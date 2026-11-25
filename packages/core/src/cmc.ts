/**
 * CoinMarketCap as a note's second price source (docs/ATLAS-CMC.md). Atlas publishes a stock token's price on BNB
 * Chain but keeps the latest value only; CoinMarketCap's Pro API has the same token's price every five minutes
 * (/v3/cryptocurrency/quotes/historical), aggregated across the exchanges it tracks. The keeper uses it twice:
 *
 *  1. HISTORY. A fixing window (the time-weighted median of the minutes before a check) and the disruption rule
 *     (postpone a check made in the middle of a violent move) need past prices: for an Atlas feed they are
 *     CoinMarketCap's five-minute points, in the feed's own decimals, through the same stepFixing as every note.
 *  2. SECOND SOURCE. No Atlas price is written to a note unless CoinMarketCap's latest point agrees with it within
 *     SECOND_SOURCE_TOLERANCE_BPS (secondSourceHold): two independent publishers, or the check waits.
 *
 * Every node of the DON asks for the same closed five-minute points (the newest one is at least CMC_SETTLE seconds
 * old, so it is already published) and decodes the reply into the same compact strings: identical consensus, as for
 * a feed's past rounds (feed-rpc.ts decodeRoundHistory). The API key is a keeper secret, never in a note or a page.
 *
 * Pure: no I/O and no Node APIs (bundled into the CRE workflow's WASM).
 */
import type { PricePoint } from './keeper';

export const CMC_API = 'https://pro-api.coinmarketcap.com';
/** The header the Pro API reads the key from. */
export const CMC_KEY_HEADER = 'X-CMC_PRO_API_KEY';
/** Seconds between CoinMarketCap's historical points at interval=5m. */
export const CMC_STEP = 300;
/** A point is asked for only once it is this old: published, and the same for every node. */
export const CMC_SETTLE = 90;
/** How far back one request reaches at most, seconds (7 tokens x 48 points: ~150 KB, under CRE's 250 KB reply cap). */
export const CMC_MAX_LOOKBACK = 4 * 3600;
/** The newest point must be no older than this, or CoinMarketCap is not a live second source: the check waits. */
export const CMC_MAX_AGE = 900;
/** How far an Atlas price may sit from CoinMarketCap's latest point, basis points of the latter. */
export const SECOND_SOURCE_TOLERANCE_BPS = 300;

/** The end of the newest closed five-minute point every node can already read at `nowSec`. */
export const cmcEnd = (nowSec: number): number => Math.floor((nowSec - CMC_SETTLE) / CMC_STEP) * CMC_STEP;

/**
 * Path and query of the history request for `ids` (CoinMarketCap ids) covering [fromSec, cmcEnd(nowSec)], never
 * further back than CMC_MAX_LOOKBACK. time_start is exclusive at CoinMarketCap: one step earlier, so the point at
 * the aligned start is in.
 */
export function cmcHistoryPath(ids: readonly number[], fromSec: number, nowSec: number): string {
  const end = cmcEnd(nowSec);
  const from = Math.max(fromSec, end - CMC_MAX_LOOKBACK);
  const start = Math.floor(from / CMC_STEP) * CMC_STEP - CMC_STEP;
  const sorted = [...new Set(ids)].sort((a, b) => a - b);
  return `/v3/cryptocurrency/quotes/historical?id=${sorted.join(',')}&time_start=${start}&time_end=${end}&interval=5m&convert=USD&aux=`;
}

/** A USD price as a feed answer of `decimals` (8 significant decimals kept: CoinMarketCap quotes are floats). */
export function usdToAnswer(price: number, decimals: number): bigint {
  const e8 = BigInt(Math.round(price * 1e8));
  return decimals >= 8 ? e8 * 10n ** BigInt(decimals - 8) : e8 / 10n ** BigInt(8 - decimals);
}

/**
 * Decode a history reply: per id (in the order asked), its points newest first as "at:answer" decimal strings in
 * `decimals` (consensus-safe and compact, the form of decodeRoundHistory). An id with no usable point is an error,
 * and so is a reply that is not CoinMarketCap's (a refused key, a rate limit): the check then waits for the next run.
 * Error texts carry CoinMarketCap's error code only, so nodes that saw the same failure report the same thing.
 */
export function decodeCmcHistory(
  body: string,
  ids: readonly number[],
  decimals: number,
): Array<{ rounds: string[] } | { error: string }> {
  let parsed: {
    status?: { error_code?: number | string };
    data?: Record<string, { quotes?: Array<{ timestamp?: string; quote?: { USD?: { price?: number } } }> }>;
  };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    return ids.map(() => ({ error: 'CoinMarketCap: reply is not JSON' }));
  }
  const code = Number(parsed?.status?.error_code ?? 0);
  if (code !== 0 || !parsed.data || typeof parsed.data !== 'object') {
    return ids.map(() => ({ error: `CoinMarketCap: request refused${code ? ` (code ${code})` : ''}` }));
  }
  return ids.map((id) => {
    const rounds: string[] = [];
    for (const q of parsed.data![String(id)]?.quotes ?? []) {
      const at = Math.floor(Date.parse(q?.timestamp ?? '') / 1000);
      const price = q?.quote?.USD?.price;
      if (!Number.isFinite(at) || typeof price !== 'number' || !(price > 0) || !Number.isFinite(price)) continue;
      rounds.push(`${at}:${usdToAnswer(price, decimals)}`);
    }
    rounds.sort((a, b) => Number(b.split(':')[0]) - Number(a.split(':')[0]));
    return rounds.length ? { rounds } : { error: 'CoinMarketCap: no price history for this token' };
  });
}

/**
 * Why an Atlas price must not be written now, or null when it may: CoinMarketCap has no recent point to compare it
 * with, or the two disagree by more than `toleranceBps`. `answer` and the points share the feed's decimals. The
 * report waits and the keeper retries every run: nothing is fixed on one source alone.
 */
export function secondSourceHold(
  answer: bigint,
  points: readonly PricePoint[],
  nowSec: number,
  toleranceBps: number = SECOND_SOURCE_TOLERANCE_BPS,
): string | null {
  const newest = points.reduce<PricePoint | null>((a, p) => (!a || p.at > a.at ? p : a), null);
  if (!newest) return 'CoinMarketCap has no price to compare with (second source)';
  const age = nowSec - newest.at;
  if (age > CMC_MAX_AGE) return `CoinMarketCap's newest price is ${age}s old (second source, max ${CMC_MAX_AGE}s)`;
  const diff = answer > newest.answer ? answer - newest.answer : newest.answer - answer;
  const bps = Number((diff * 10_000n) / newest.answer);
  return bps > toleranceBps
    ? `Atlas and CoinMarketCap disagree by ${(bps / 100).toFixed(2)}% (limit ${(toleranceBps / 100).toFixed(2)}%)`
    : null;
}
