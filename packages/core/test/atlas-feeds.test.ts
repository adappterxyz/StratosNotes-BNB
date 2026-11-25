import { describe, expect, it } from 'vitest';
import {
  ATLAS_BSTOCKS,
  ATLAS_MULTI_FEED,
  ATLAS_STALENESS,
  atlasFetchData,
  BSC_MAINNET_FEED_CHAIN,
  checkRound,
  cmcIdOfFeed,
  decodeFeedBatch,
  feedBatchBody,
  FEEDS,
  HTTP_FEED_CHAINS,
  isAtlasFeed,
  keyedFeed,
  parseFeedRef,
  readingToRound,
} from '../src';

const TSLAB = keyedFeed(ATLAS_MULTI_FEED, 933);
const CHAINLINK = '0x4A1166a659A55625345e9515b32adECea5547C38';
const w = (v: bigint) => v.toString(16).padStart(64, '0');

describe('Atlas Multi-Feed prices', () => {
  it('names one price of the registry as contract#id', () => {
    expect(FEEDS.TSLAB.feed).toBe(TSLAB);
    expect(parseFeedRef(TSLAB)).toEqual({ address: ATLAS_MULTI_FEED, atlasId: 933 });
    expect(parseFeedRef(CHAINLINK)).toEqual({ address: CHAINLINK });
    expect(isAtlasFeed(TSLAB)).toBe(true);
    expect(isAtlasFeed(CHAINLINK)).toBe(false);
    // fetch(bytes4): the id left-aligned in its word. Checked against the live contract 2026-11-25.
    expect(atlasFetchData(933)).toBe('0x7ffc4b97000003a5' + '0'.repeat(56));
    expect(HTTP_FEED_CHAINS[BSC_MAINNET_FEED_CHAIN]).toMatchObject({ chainId: 56 });
  });

  it('asks for fetch(id) on the registry and latestRoundData on a Chainlink feed, in one batch', () => {
    const calls = JSON.parse(feedBatchBody([TSLAB, CHAINLINK], '0x10')) as Array<{
      id: number;
      params: [{ to: string; data: string }, string];
    }>;
    expect(calls.map((c) => c.id)).toEqual([0, 1, 2, 3]);
    expect(calls[0].params[0]).toEqual({ to: ATLAS_MULTI_FEED, data: atlasFetchData(933) });
    expect(calls[1].params[0]).toEqual({ to: ATLAS_MULTI_FEED, data: '0x313ce567' });
    expect(calls[2].params[0]).toEqual({ to: CHAINLINK, data: '0xfeaf968c' });
    expect(calls.every((c) => c.params[1] === '0x10')).toBe(true);
  });

  it('decodes a snapshot (the reply BNB Chain gave on 2026-11-25) into a reading the keeper checks as any other', () => {
    // TSLAB: 364.62… USD (18 decimals), aggregated at 1795621959, written on-chain a second later.
    const reply = JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: '0x' + w(18n) },
      { jsonrpc: '2.0', id: 0, result: '0x' + w(0x13c42a3934e5f37dc0n) + w(0x6b070447n) + w(0x6b070448n) },
    ]);
    const [r] = decodeFeedBatch(reply, [TSLAB]);
    expect(r).toEqual({
      roundId: '1795621959',
      answer: '364623310680296226240',
      updatedAt: '1795621959',
      answeredInRound: '1795621959',
      decimals: 18,
    });
    const { round, decimals } = readingToRound(r);
    // Engine fixed point: 10 decimals.
    expect(checkRound(round, decimals, 1795621959 + 60, ATLAS_STALENESS, 30)).toBe(3646233106802n);
    // Atlas stopped publishing (its sources disagree): the price ages out and the check waits.
    expect(() => checkRound(round, decimals, 1795621959 + ATLAS_STALENESS + 31, ATLAS_STALENESS, 30)).toThrow(/stale/);
  });

  it('fails an id Atlas does not publish, and only that feed', () => {
    const reply = JSON.stringify([
      { jsonrpc: '2.0', id: 0, result: '0x' + w(0n) + w(0n) + w(0n) },
      { jsonrpc: '2.0', id: 1, result: '0x' + w(18n) },
      { jsonrpc: '2.0', id: 2, result: '0x' + w(5n) + w(40000000000n) + w(100n) + w(100n) + w(5n) },
      { jsonrpc: '2.0', id: 3, result: '0x' + w(8n) },
    ]);
    const [atlas, chainlink] = decodeFeedBatch(reply, [keyedFeed(ATLAS_MULTI_FEED, 1), CHAINLINK]);
    expect(atlas).toEqual({ error: 'Atlas feed: empty snapshot (unknown feed id?)' });
    expect(chainlink).toMatchObject({ answer: '40000000000', decimals: 8 });
  });

  it("knows each stock token's CoinMarketCap id: its second source", () => {
    expect(cmcIdOfFeed(FEEDS.TSLAB)).toBe(ATLAS_BSTOCKS.TSLAB.cmcId);
    expect(cmcIdOfFeed(FEEDS.NVDAB)).toBe(40215);
    expect(cmcIdOfFeed(FEEDS.TSLA)).toBeUndefined();
    expect(new Set(Object.values(ATLAS_BSTOCKS).map((b) => b.cmcId)).size).toBe(7);
    expect(new Set(Object.values(ATLAS_BSTOCKS).map((b) => b.atlasId)).size).toBe(7);
  });
});
