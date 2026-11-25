/**
 * Atlas's SIGNED prices (docs.atlasoracle.io, pull mode; docs/ATLAS-CMC.md): the same prices as the on-chain feeds,
 * fresh to the second, each reply signed by Atlas's reporter key. The API returns a payload (20 bytes per price:
 * feed id, price with 18 decimals, time; then a count byte), a 65-byte signature over keccak256(payload), and
 * Atlas's own quality reading of each feed (consensus score and status).
 *
 * Used for the live price on a note's page: the Worker fetches it, recovers the signer and refuses anything not
 * signed by ATLAS_SIGNER (services/edge api.ts), so the page never shows a number Atlas did not publish. The note's
 * fixings do not come from here: they are the on-chain feed, confirmed by CoinMarketCap (cmc.ts).
 *
 * Pure: parsing only, no hashing (the caller recovers the signer with its own crypto).
 */
export const ATLAS_API = 'https://api.atlasoracle.io';
export const ATLAS_PRICE_PATH = '/report/v1/price/latest';
export const ATLAS_KEY_HEADER = 'X-API-KEY';
/**
 * The key Atlas signs price reports with (docs.atlasoracle.io, "Integrate the pull mode"; a live reply recovered to
 * it on 2026-11-25).
 */
export const ATLAS_SIGNER = '0x59eD4701224fD9e2a85Ef2946c2ab828C1dDC600';

/** The request body for the signed prices of `feedIds` (Atlas feed numbers). */
export const atlasSignedBody = (feedIds: readonly number[]): string =>
  JSON.stringify({ signed: true, feedIds: feedIds.map(String) });

export interface AtlasSignedPrice {
  feedId: number;
  /** The price, 18 decimals. */
  answer: bigint;
  /** When Atlas aggregated it, unix seconds. */
  at: number;
  /** Atlas's consensus status of the feed (HEALTHY, DEGRADED, WARNING, CRITICAL, SPLIT_MARKET…), when given. */
  status?: string;
  /** Its consensus score, 0..1, when given. */
  score?: number;
}

export interface AtlasSignedReport {
  /** What was signed: the packages and the count byte, 0x-hex. Its keccak256 is the signed digest. */
  payload: `0x${string}`;
  /** r ‖ s ‖ v, 0x-hex (65 bytes). */
  signature: `0x${string}`;
  prices: AtlasSignedPrice[];
}

const HEX = /^0x[0-9a-fA-F]*$/;
const PACKAGE = 40; // hex characters: 4 bytes feed id, 10 price, 6 time

/**
 * Decode a signed-price reply. The prices are read from the SIGNED payload, never from the reply's convenience
 * fields; only the quality reading (not signed) comes from beside it. Throws on anything malformed.
 */
export function decodeAtlasSigned(body: string): AtlasSignedReport {
  let parsed: {
    data?: {
      payload?: unknown;
      signature?: unknown;
      consensusScores?: Array<{ feedId?: unknown; consensusScore?: unknown; consensusStatus?: unknown }>;
    };
  };
  try {
    parsed = JSON.parse(body) as typeof parsed;
  } catch {
    throw new Error('Atlas: reply is not JSON');
  }
  const { payload, signature, consensusScores } = parsed?.data ?? {};
  if (typeof payload !== 'string' || !HEX.test(payload) || typeof signature !== 'string' || !HEX.test(signature))
    throw new Error('Atlas: no signed payload in the reply');
  if (signature.length !== 2 + 130) throw new Error('Atlas: signature is not 65 bytes');
  const hex = payload.slice(2);
  const count = parseInt(hex.slice(-2), 16);
  if (hex.length < 2 || hex.length !== count * PACKAGE + 2)
    throw new Error('Atlas: payload length does not match its count');
  const quality = new Map(
    (Array.isArray(consensusScores) ? consensusScores : []).map((q) => [
      Number(q?.feedId),
      {
        ...(typeof q?.consensusStatus === 'string' ? { status: q.consensusStatus } : {}),
        ...(typeof q?.consensusScore === 'number' ? { score: q.consensusScore } : {}),
      },
    ]),
  );
  const prices: AtlasSignedPrice[] = [];
  for (let i = 0; i < count; i++) {
    const p = hex.slice(i * PACKAGE, (i + 1) * PACKAGE);
    const feedId = parseInt(p.slice(0, 8), 16);
    prices.push({
      feedId,
      answer: BigInt('0x' + p.slice(8, 28)),
      at: parseInt(p.slice(28, 40), 16),
      ...quality.get(feedId),
    });
  }
  return { payload: payload as `0x${string}`, signature: signature as `0x${string}`, prices };
}
