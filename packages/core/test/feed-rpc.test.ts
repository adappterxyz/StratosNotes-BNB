import { describe, expect, it } from 'vitest';
import {
  blockNumberBody,
  checkRound,
  corporateActionHold,
  decodeTokenBatch,
  tokenMultiplier,
  TOKEN_SELECTORS,
  CORPORATE_ACTION_WINDOW,
  isRhMultiplierRef,
  rhTokenOfFeed,
  RH_STOCK_TOKENS,
  FEEDS,
  FEED_CATALOGUE,
  decodeBlockNumber,
  decodeFeedBatch,
  feedBatchBody,
  HTTP_FEED_CHAINS,
  pinnedBlock,
  readingToRound,
} from '../src';

const TSLA = '0x4A1166a659A55625345e9515b32adECea5547C38';
const AMD = '0x943A29E7ae51A4798823ca9eEd2ed533B2A22C72';
// A real reply from Robinhood Chain mainnet (TSLA / USD, block tag 'safe', 2026-10-24).
const TSLA_ROUND =
  '0x00000000000000000000000000000000000000000000000100000000000006c200000000000000000000000000000000000000000000000000000008a9b7ac08000000000000000000000000000000000000000000000000000000006adb882d000000000000000000000000000000000000000000000000000000006adb883900000000000000000000000000000000000000000000000100000000000006c2';
const EIGHT = '0x' + '8'.padStart(64, '0');

describe('feed reads over JSON-RPC (chains CRE has no EVM capability for)', () => {
  it('batches latestRoundData + decimals per feed at the block tag', () => {
    const body = JSON.parse(feedBatchBody([TSLA, AMD], 'safe'));
    expect(body).toHaveLength(4);
    expect(body[0]).toEqual({
      jsonrpc: '2.0',
      id: 0,
      method: 'eth_call',
      params: [{ to: TSLA, data: '0xfeaf968c' }, 'safe'],
    });
    expect(body[3]).toEqual({
      jsonrpc: '2.0',
      id: 3,
      method: 'eth_call',
      params: [{ to: AMD, data: '0x313ce567' }, 'safe'],
    });
  });

  it('decodes a real reply in any order, deterministically, and checks it like an EVM read', () => {
    const reply = JSON.stringify([
      { jsonrpc: '2.0', id: 1, result: EIGHT },
      { jsonrpc: '2.0', id: 0, result: TSLA_ROUND },
    ]);
    const [r] = decodeFeedBatch(reply, [TSLA]);
    expect(r).toEqual({
      roundId: String((1n << 64n) + 0x6c2n),
      answer: String(0x8a9b7ac08n),
      updatedAt: String(0x6adb8839n),
      answeredInRound: String((1n << 64n) + 0x6c2n),
      decimals: 8,
    });
    const { round, decimals } = readingToRound(r);
    // $372.32... at 8 decimals -> engine fixed point (10 decimals).
    expect(checkRound(round, decimals, 0x6adb8839 + 60, 86400, 1800)).toBe(0x8a9b7ac08n * 100n);
    expect(() => checkRound(round, decimals, 0x6adb8839 + 86400 + 1801, 86400, 1800)).toThrow(/stale/);
  });

  it('fails only the feed whose call failed, with a node-independent error', () => {
    const reply = JSON.stringify([
      { jsonrpc: '2.0', id: 0, result: TSLA_ROUND },
      { jsonrpc: '2.0', id: 1, result: EIGHT },
      { jsonrpc: '2.0', id: 2, error: { code: -32000, message: 'historical state 78516d48… is not available' } },
      { jsonrpc: '2.0', id: 3, result: EIGHT },
    ]);
    const [ok, bad] = decodeFeedBatch(reply, [TSLA, AMD]);
    expect('error' in ok).toBe(false);
    expect(bad).toEqual({ error: 'feed RPC: eth_call failed (code -32000)' });
    expect(() => readingToRound(bad)).toThrow('eth_call failed');
  });

  it('refuses a non-feed (empty result), a missing reply, a non-batch reply and non-JSON', () => {
    expect(
      decodeFeedBatch(
        JSON.stringify([
          { id: 0, result: '0x' },
          { id: 1, result: EIGHT },
        ]),
        [TSLA],
      )[0],
    ).toEqual({ error: expect.stringMatching(/malformed/) });
    expect(decodeFeedBatch(JSON.stringify([{ id: 0, result: TSLA_ROUND }]), [TSLA])[0]).toEqual({
      error: 'feed RPC: no reply',
    });
    expect(decodeFeedBatch(JSON.stringify({ id: null, error: { code: -32600 } }), [TSLA, AMD])).toEqual([
      { error: 'feed RPC: batch refused (code -32600)' },
      { error: 'feed RPC: batch refused (code -32600)' },
    ]);
    expect(decodeFeedBatch('<html>', [TSLA])).toEqual([{ error: 'feed RPC: reply is not JSON' }]);
  });

  it('decodes a negative answer as negative (checkRound refuses it)', () => {
    const neg = TSLA_ROUND.slice(0, 66) + 'f'.repeat(64) + TSLA_ROUND.slice(130);
    const [r] = decodeFeedBatch(
      JSON.stringify([
        { id: 0, result: neg },
        { id: 1, result: EIGHT },
      ]),
      [TSLA],
    );
    expect((r as { answer: string }).answer).toBe('-1');
    const { round, decimals } = readingToRound(r);
    expect(() => checkRound(round, decimals, 0x6adb8839, 86400, 1800)).toThrow(/non-positive/);
  });

  it('pins the read below the agreed head', () => {
    expect(JSON.parse(blockNumberBody())).toEqual({ jsonrpc: '2.0', id: 1, method: 'eth_blockNumber', params: [] });
    expect(decodeBlockNumber('{"jsonrpc":"2.0","id":1,"result":"0x5c45eea"}')).toBe(0x5c45eea);
    expect(() => decodeBlockNumber('{"jsonrpc":"2.0","id":1,"error":{"code":-32603}}')).toThrow('code -32603');
    expect(pinnedBlock(0x5c45eea, 600)).toBe('0x' + (0x5c45eea - 600).toString(16));
    expect(pinnedBlock(10, 600)).toBe('0x0');
    expect(JSON.parse(feedBatchBody([TSLA], pinnedBlock(1000, 600)))[0].params[1]).toBe('0x190');
  });

  it('knows Robinhood Chain mainnet', () => {
    expect(HTTP_FEED_CHAINS['robinhood-mainnet']).toEqual({
      rpc: 'https://rpc.mainnet.chain.robinhood.com',
      chainId: 4663,
      lagBlocks: 600,
    });
  });

  const w = (v: bigint | number) => '0x' + BigInt(v).toString(16).padStart(64, '0');
  const TOKEN = RH_STOCK_TOKENS.TSLA;

  it('asks a stock token for its multiplier, pending change and pause after the feeds, and decodes them', () => {
    const body = JSON.parse(feedBatchBody([TSLA], 'safe', [TOKEN]));
    expect(body.map((c: { id: number }) => c.id)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(body.slice(2).map((c: { params: [{ to: string; data: string }] }) => c.params[0])).toEqual(
      TOKEN_SELECTORS.map((data) => ({ to: TOKEN, data })),
    );
    // SNDK on 2026-11-21: 8 shares a token after its split, nothing pending, not paused.
    const reply = JSON.stringify([
      { id: 5, result: w(0) },
      { id: 2, result: w(8n * 10n ** 18n) },
      { id: 3, result: w(8n * 10n ** 18n) },
      { id: 4, result: w(1795185000) },
      { id: 0, result: TSLA_ROUND },
      { id: 1, result: EIGHT },
    ]);
    const [t] = decodeTokenBatch(reply, 1, [TOKEN]);
    expect(t).toEqual({
      multiplier: '8000000000000000000',
      pending: '8000000000000000000',
      effectiveAt: '1795185000',
      paused: false,
    });
    expect(decodeFeedBatch(reply, [TSLA])[0]).toMatchObject({ decimals: 8 });
    // One failed call fails that token only, with the same text on every node.
    expect(decodeTokenBatch(JSON.stringify([{ id: 2, result: w(1) }]), 1, [TOKEN])).toEqual([
      { error: 'token RPC: no reply' },
    ]);
    expect(decodeTokenBatch('<html>', 0, [TOKEN])).toEqual([{ error: 'token RPC: reply is not JSON' }]);
  });

  it('holds a stock observation while its token is in a corporate action', () => {
    const now = 1_800_000_000;
    const t = {
      multiplier: String(2n * 10n ** 18n),
      pending: String(2n * 10n ** 18n),
      effectiveAt: '0',
      paused: false,
    };
    expect(corporateActionHold(t, now)).toBeNull();
    expect(tokenMultiplier(t, now)).toBe(20_000_000_000n); // 2, engine fixed point
    expect(corporateActionHold({ ...t, paused: true }, now)).toMatch(/paused/);
    // A change an hour either side of now: wait; older or further out: go.
    expect(corporateActionHold({ ...t, effectiveAt: String(now + 60) }, now)).toMatch(/takes effect/);
    expect(corporateActionHold({ ...t, effectiveAt: String(now - 60) }, now)).toMatch(/took effect/);
    expect(corporateActionHold({ ...t, effectiveAt: String(now - CORPORATE_ACTION_WINDOW) }, now)).toBeNull();
    expect(corporateActionHold({ ...t, effectiveAt: String(now + CORPORATE_ACTION_WINDOW) }, now)).toBeNull();
    expect(() => tokenMultiplier({ ...t, paused: true }, now)).toThrow(/paused/);
    expect(() => tokenMultiplier({ error: 'token RPC: no reply' }, now)).toThrow(/no reply/);
    expect(() => tokenMultiplier({ ...t, multiplier: '0' }, now)).toThrow(/non-positive/);
  });

  it('tells a multiplier reference from a price feed, and finds the token behind a stock feed', () => {
    expect(isRhMultiplierRef({ feed: TOKEN, feedChain: 'robinhood-mainnet' })).toBe(true);
    expect(isRhMultiplierRef({ feed: TOKEN.toLowerCase(), feedChain: 'robinhood-mainnet' })).toBe(true);
    expect(isRhMultiplierRef({ feed: TOKEN, feedChain: 'ethereum-mainnet' })).toBe(false);
    expect(isRhMultiplierRef(FEEDS.TSLA)).toBe(false);
    expect(rhTokenOfFeed(FEEDS.TSLA)).toBe(TOKEN.toLowerCase());
    expect(rhTokenOfFeed(FEEDS.ETH)).toBeUndefined();
    // Every stock feed of the catalogue on Robinhood Chain has its token.
    const stocks = FEED_CATALOGUE.filter((f) => f.assetClass === 'Stocks' && f.feedChain === 'robinhood-mainnet');
    expect(stocks.length).toBe(Object.keys(RH_STOCK_TOKENS).length);
    for (const f of stocks) expect(rhTokenOfFeed(f)).toMatch(/^0x[0-9a-f]{40}$/);
  });
});
