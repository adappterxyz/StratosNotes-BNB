// Chainlink feed reads over the CRE HTTP capability, for feed chains CRE has no EVM read capability for
// (Robinhood Chain mainnet). Kept apart from main.ts so a check workflow can run exactly this code.
//
// Per chain per run: (pinned reads only) one eth_blockNumber request, the DON agreeing on the median head; then
// ONE batched JSON-RPC request with latestRoundData() + decimals() for every feed needed, at that head minus
// lagBlocks (or at a block tag). Every node decodes its reply to plain strings (packages/core/src/feed-rpc.ts), so
// the DON agrees on the readings themselves, never on raw JSON. No response cache: each node asks the RPC itself.
import {
  bytesToBase64,
  consensusIdenticalAggregation,
  consensusMedianAggregation,
  HTTPClient,
  ok,
  text,
  type HTTPSendRequester,
  type Runtime,
} from '@chainlink/cre-sdk';
import { z } from 'zod';
import {
  blockNumberBody,
  decodeBlockNumber,
  decodeFeedBatch,
  decodeRoundHistory,
  decodeTokenBatch,
  feedBatchBody,
  FEEDS_PER_BATCH,
  pinnedBlock,
  ROUND_CALLS_PER_REQUEST,
  roundHistoryBody,
  roundPoints,
  type FeedReading,
  type RoundHistoryRequest,
  type TokenReading,
} from '../../packages/core/src/feed-rpc';
import type { FeedRef, PricePoint } from '../../packages/core/src/keeper';
import { isRhMultiplierRef, rhTokenOfFeed } from '../../packages/core/src/products/robinhood-tokens';

export const httpFeedChainsSchema = z.record(
  z.object({
    // A regex, not z.string().url(): the workflow's QuickJS runtime has no URL constructor.
    rpc: z.string().regex(/^https:\/\/[^\s/?#]+[^\s]*$/, 'an https:// URL'),
    /** Block tag to read at (default 'finalized'), unless lagBlocks pins the block. */
    blockTag: z.enum(['finalized', 'safe', 'latest']).optional(),
    /** Read at (median head across nodes) - lagBlocks: every node reads the same block. */
    lagBlocks: z.number().int().nonnegative().optional(),
  }),
);
export type HttpFeedChains = z.infer<typeof httpFeedChainsSchema>;

const post = (s: HTTPSendRequester, rpc: string, body: string): string => {
  const r = s
    .sendRequest({
      url: rpc,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      // QuickJS has no Node Buffer: encode with the SDK helper.
      body: bytesToBase64(new TextEncoder().encode(body)),
      timeout: '10s', // CRE caps an HTTP request at 10 s
    })
    .result();
  if (!ok(r)) throw new Error(`feed RPC: HTTP ${r.statusCode}`);
  return text(r);
};

/** Runs on every node: the head block number (aggregated by median). */
export const headBlock = (s: HTTPSendRequester, rpc: string): number =>
  decodeBlockNumber(post(s, rpc, blockNumberBody()));

/**
 * Runs on every node: one batched request, decoded to strings (aggregated as identical). A failed request fails
 * every feed in it with the same text, so nodes that saw the same failure still agree.
 */
export const feedBatch = (
  s: HTTPSendRequester,
  req: { rpc: string; feeds: string[]; tokens: string[]; block: string },
): string => {
  let readings: FeedReading[];
  let tokens: TokenReading[];
  try {
    const reply = post(s, req.rpc, feedBatchBody(req.feeds, req.block, req.tokens));
    readings = decodeFeedBatch(reply, req.feeds);
    tokens = decodeTokenBatch(reply, req.feeds.length, req.tokens);
  } catch (e) {
    const m = (e as Error).message;
    const error = m.startsWith('feed RPC:') ? m : 'feed RPC: request failed';
    readings = req.feeds.map(() => ({ error }));
    tokens = req.tokens.map(() => ({ error }));
  }
  return JSON.stringify({ readings, tokens });
};

/** What the HTTP feed chains answered this run, by `${feedChain}:${lowercase address}`. */
export interface HttpReadings {
  feeds: Map<string, FeedReading>;
  /** Stock tokens: of every multiplier reference, and of the token behind every stock feed read (its pause). */
  tokens: Map<string, TokenReading>;
  /** The block each chain was read at (a tag or a pinned 0x number): a fixing window reads its history there too. */
  blocks: Map<string, string>;
}

/**
 * Read every feed `wanted` on the HTTP feed chains (feeds on other chains are ignored). Returns readings by
 * `${feedChain}:${feed lowercase}`; a request that fails (or fails consensus) fails its feeds, not the run.
 * A reference to a Robinhood stock token (its multiplier) is read as a token, and so is the token behind every
 * Robinhood stock feed, in the same request as the feed: same block, so a price and its token's state agree.
 * HTTP calls per run: per chain with feeds due, 1 (pinned) + ceil(feeds / FEEDS_PER_BATCH); CRE allows 15.
 */
export function httpFeedReadings(
  runtime: Runtime<{ httpFeedChains?: HttpFeedChains }>,
  wanted: FeedRef[],
): HttpReadings {
  const out = new Map<string, FeedReading>();
  const outTokens = new Map<string, TokenReading>();
  const blocks = new Map<string, string>();
  const chains = runtime.config.httpFeedChains ?? {};
  // Per chain: [feed, its token or ''] pairs (a multiplier reference is a token with no feed: ['', token]).
  const byChain = new Map<string, Array<[string, string]>>();
  for (const f of wanted) {
    if (!chains[f.feedChain]) continue;
    const list = byChain.get(f.feedChain) ?? [];
    const pair: [string, string] = isRhMultiplierRef(f)
      ? ['', f.feed.toLowerCase()]
      : [f.feed.toLowerCase(), rhTokenOfFeed(f) ?? ''];
    if (!list.some((x) => x[0] === pair[0] && x[1] === pair[1])) list.push(pair);
    byChain.set(f.feedChain, list);
  }
  const http = new HTTPClient();
  for (const [name, pairs] of byChain) {
    const c = chains[name];
    const feeds = pairs.map((x) => x[0]).filter(Boolean);
    const tokens = [...new Set(pairs.map((x) => x[1]).filter(Boolean))];
    let block: string;
    try {
      block =
        c.lagBlocks !== undefined
          ? pinnedBlock(
              http.sendRequest(runtime, headBlock, consensusMedianAggregation<number>())(c.rpc).result(),
              c.lagBlocks,
            )
          : (c.blockTag ?? 'finalized');
    } catch (e) {
      const error = `feed RPC: no agreed head block (${(e as Error).message})`;
      for (const f of feeds) out.set(`${name}:${f}`, { error });
      for (const t of tokens) outTokens.set(`${name}:${t}`, { error });
      continue;
    }
    blocks.set(name, block);
    // Feeds and tokens share the batches (a token costs 4 calls, a feed 2: FEEDS_PER_BATCH counts both as one).
    const n = Math.max(feeds.length, tokens.length);
    for (let i = 0; i < n; i += FEEDS_PER_BATCH) {
      const part = feeds.slice(i, i + FEEDS_PER_BATCH);
      const partTokens = tokens.slice(i, i + FEEDS_PER_BATCH);
      let readings: FeedReading[];
      let tokenReadings: TokenReading[];
      try {
        const r = JSON.parse(
          http
            .sendRequest(
              runtime,
              feedBatch,
              consensusIdenticalAggregation<string>(),
            )({ rpc: c.rpc, feeds: part, tokens: partTokens, block })
            .result(),
        ) as { readings: FeedReading[]; tokens: TokenReading[] };
        readings = r.readings;
        tokenReadings = r.tokens;
      } catch (e) {
        const error = `feed RPC: no consensus (${(e as Error).message})`;
        readings = part.map(() => ({ error }));
        tokenReadings = partTokens.map(() => ({ error }));
      }
      part.forEach((f, j) => out.set(`${name}:${f}`, readings[j] ?? { error: 'feed RPC: no reading' }));
      partTokens.forEach((t, j) =>
        outTokens.set(`${name}:${t}`, tokenReadings[j] ?? { error: 'feed RPC: no reading' }),
      );
      runtime.log(
        `${name}: ${part.length} feed(s)${partTokens.length ? ` and ${partTokens.length} stock token(s)` : ''} read over HTTP JSON-RPC at block ${block}`,
      );
    }
  }
  return { feeds: out, tokens: outTokens, blocks };
}

/** Runs on every node: one batched request of past rounds, decoded to compact strings (aggregated as identical). */
export const roundHistory = (
  s: HTTPSendRequester,
  req: { rpc: string; reqs: RoundHistoryRequest[]; block: string },
): string => {
  try {
    return JSON.stringify(decodeRoundHistory(post(s, req.rpc, roundHistoryBody(req.reqs, req.block)), req.reqs));
  } catch (e) {
    const m = (e as Error).message;
    return JSON.stringify(
      req.reqs.map(() => ({ error: m.startsWith('feed RPC:') ? m : 'history RPC: request failed' })),
    );
  }
};

/** A feed whose past rounds a fixing window needs: read back from `fromRound` (its latest, already agreed). */
export interface HistoryWanted {
  feedChain: string;
  feed: string;
  fromRound: string;
  rpc: string;
  /** The block to read at: the one the latest round was read at, or 'latest' (past rounds never change). */
  block: string;
}

/**
 * The past rounds of every feed `wanted`, by `${feedChain}:${feed lowercase}`, as price points (feed decimals), in
 * ONE request per chain (ROUND_CALLS_PER_REQUEST shared by its feeds, spaced as roundOffsets). A request that fails
 * fails its feeds: the report waits for the next run, it never falls back to the latest round. The fixing itself
 * (the window, the disruption rule) is the step's: packages/core/src/keeper.ts stepFixing.
 */
export function roundHistories(
  runtime: Runtime<unknown>,
  wanted: HistoryWanted[],
): Map<string, PricePoint[] | { error: string }> {
  const out = new Map<string, PricePoint[] | { error: string }>();
  const byChain = new Map<string, HistoryWanted[]>();
  for (const w of wanted) {
    const list = byChain.get(w.feedChain) ?? [];
    if (!list.some((x) => x.feed.toLowerCase() === w.feed.toLowerCase())) list.push(w);
    byChain.set(w.feedChain, list);
  }
  const http = new HTTPClient();
  for (const [name, list] of byChain) {
    const count = Math.max(4, Math.floor(ROUND_CALLS_PER_REQUEST / list.length));
    const reqs = list.map((w) => ({ feed: w.feed.toLowerCase(), fromRound: w.fromRound, count }));
    let got: Array<{ rounds: string[] } | { error: string }>;
    try {
      got = JSON.parse(
        http
          .sendRequest(
            runtime,
            roundHistory,
            consensusIdenticalAggregation<string>(),
          )({ rpc: list[0].rpc, reqs, block: list[0].block })
          .result(),
      ) as Array<{ rounds: string[] } | { error: string }>;
    } catch (e) {
      got = reqs.map(() => ({ error: `history RPC: no consensus (${(e as Error).message})` }));
    }
    runtime.log(
      `${name}: up to ${count} past round(s) of ${list.length} feed(s) read at block ${list[0].block} (fixing window)`,
    );
    reqs.forEach((r, i) => {
      const h = got[i] ?? { error: 'history RPC: no reading' };
      out.set(`${name}:${r.feed}`, 'error' in h ? h : roundPoints(h.rounds));
    });
  }
  return out;
}
