import { describe, expect, it } from 'vitest';
import {
  canWindowFeed,
  compile,
  coversWindow,
  decodeRoundHistory,
  DISRUPTION_MAX_POSTPONEMENTS,
  dueReports,
  EXAMPLE_PRODUCTS,
  FEEDS,
  fixingRuleText,
  instantiateProduct,
  oracleFeeds,
  parseBpmn,
  ROUND_CALLS_PER_REQUEST,
  roundHistoryBody,
  roundOffsets,
  roundPoints,
  SELECTOR_GET_ROUND,
  stepFixing,
  timeWeightedMedian,
  usCloseOnOrAfter,
  validateProductParams,
  windowDisrupted,
  type ProductParams,
} from '../src';

const T = 1_800_000_000;
const px = (n: number) => BigInt(Math.round(n * 1e8));
const min = (m: number) => T - m * 60;

describe('fixing window: a wick does not set a fixing', () => {
  it('ignores a violent wick shorter than half the window', () => {
    // TSLA steady near 350 for an hour, then a 3-minute wick to 280 and back, in 0.5%-style rounds.
    const pts = [
      { at: min(90), answer: px(350) },
      { at: min(40), answer: px(351) },
      { at: min(5), answer: px(330) },
      { at: min(4.5), answer: px(300) },
      { at: min(4), answer: px(280) },
      { at: min(3), answer: px(310) },
      { at: min(2), answer: px(349) },
    ];
    // The latest round alone, a minute into the wick, would have fixed at 280.
    expect(timeWeightedMedian(pts, min(60), T)).toEqual({ answer: px(351), covered: 3600 });
    expect(timeWeightedMedian(pts, min(30), T).answer).toBe(px(351));
    expect(timeWeightedMedian(pts, min(15), T).answer).toBe(px(351));
    // Read at the bottom of the wick (rounds after that moment do not exist yet): still 351.
    expect(timeWeightedMedian(pts, min(64), min(4)).answer).toBe(px(351));
  });

  it('follows a price that really moved and stayed', () => {
    const pts = [
      { at: min(120), answer: px(350) },
      { at: min(50), answer: px(300) },
      { at: min(20), answer: px(298) },
    ];
    // 300 held for 30 of the 60 minutes, 298 for 20, 350 for 10: the median is 300.
    expect(timeWeightedMedian(pts, min(60), T)).toEqual({ answer: px(300), covered: 3600 });
  });

  it('is the standing price when nothing was written in the window (a closed market)', () => {
    const pts = [{ at: T - 2 * 86_400, answer: px(349.995) }];
    expect(timeWeightedMedian(pts, min(60), T)).toEqual({ answer: px(349.995), covered: 3600 });
  });

  it('ignores rounds after the fixing time, and says how much of the window the rounds cover', () => {
    const pts = [
      { at: min(10), answer: px(100) },
      { at: T + 60, answer: px(1) },
    ];
    expect(timeWeightedMedian(pts, min(60), T)).toEqual({ answer: px(100), covered: 600 });
    expect(coversWindow(pts, min(60))).toBe(false);
    expect(coversWindow([{ at: min(61), answer: px(1) }, ...pts], min(60))).toBe(true);
    expect(() => timeWeightedMedian([{ at: T + 1, answer: px(1) }], min(60), T)).toThrow(/no round/);
    // A window of no length: the price in effect.
    expect(timeWeightedMedian(pts, T, T)).toEqual({ answer: px(100), covered: 0 });
  });

  it('is the same whatever order the rounds arrive in', () => {
    const pts = Array.from({ length: 40 }, (_, i) => ({ at: min(80 - 2 * i), answer: px(300 + ((i * 37) % 23)) }));
    const a = timeWeightedMedian(pts, min(60), T);
    expect(timeWeightedMedian([...pts].reverse(), min(60), T)).toEqual(a);
    expect(
      timeWeightedMedian(
        [...pts].sort((x, y) => Number(x.answer - y.answer)),
        min(60),
        T,
      ),
    ).toEqual(a);
  });
});

describe('fixing window: reading past rounds', () => {
  const FEED = FEEDS.TSLA.feed;
  const w = (v: bigint | number) => BigInt(v).toString(16).padStart(64, '0');
  const round = (id: bigint, answer: number, at: number) => '0x' + w(id) + w(px(answer)) + w(at) + w(at) + w(id);
  const LATEST = (1n << 64n) + 2305n;

  it('reads the recent rounds one by one, then ever further back with the same few calls', () => {
    const o = roundOffsets(ROUND_CALLS_PER_REQUEST);
    expect(o).toHaveLength(ROUND_CALLS_PER_REQUEST);
    expect(o.slice(0, 24)).toEqual(Array.from({ length: 24 }, (_, i) => i));
    for (let i = 1; i < o.length; i++) expect(o[i]).toBeGreaterThan(o[i - 1]);
    expect(o[o.length - 1]).toBeGreaterThan(2000); // a window crowded with rounds is still covered end to end
    expect(roundOffsets(4)).toEqual([0, 1, 2, 3]);
  });

  it('asks for rounds going back from the latest, never below the first of the phase', () => {
    const body = JSON.parse(roundHistoryBody([{ feed: FEED, fromRound: LATEST.toString(), count: 3 }], 'safe'));
    expect(body.map((c: { id: number }) => c.id)).toEqual([0, 1, 2]);
    expect(body[1].params[0]).toEqual({ to: FEED, data: SELECTOR_GET_ROUND + w(LATEST - 1n) });
    expect(body[0].params[1]).toBe('safe');
    const early = JSON.parse(
      roundHistoryBody([{ feed: FEED, fromRound: ((1n << 64n) + 2n).toString(), count: 5 }], 'safe'),
    );
    expect(early).toHaveLength(2); // rounds 2 and 1 of the phase
  });

  it('decodes them as compact strings, leaving out a round that failed', () => {
    const reqs = [{ feed: FEED, fromRound: LATEST.toString(), count: 3 }];
    const reply = JSON.stringify([
      { id: 2, result: round(LATEST - 2n, 346.5, T - 900) },
      { id: 0, result: round(LATEST, 350, T - 60) },
      { id: 1, result: round(LATEST - 1n, 348.25, T - 300) },
    ]);
    const [h] = decodeRoundHistory(reply, reqs);
    expect(h).toEqual({ rounds: [`${T - 60}:35000000000`, `${T - 300}:34825000000`, `${T - 900}:34650000000`] });
    expect(roundPoints((h as { rounds: string[] }).rounds)[0]).toEqual({ at: T - 60, answer: px(350) });
    const [gap] = decodeRoundHistory(JSON.stringify([{ id: 0, result: round(LATEST, 350, T - 60) }]), reqs);
    expect(gap).toEqual({ rounds: [`${T - 60}:35000000000`] });
    // Nothing readable, or a refused request (the public RPC answers 429 to a large burst): an error, never a price.
    expect(decodeRoundHistory('[]', reqs)).toEqual([{ error: 'history RPC: no past round could be read' }]);
    expect(decodeRoundHistory('<html>', reqs)).toEqual([{ error: 'history RPC: reply is not JSON' }]);
    expect(decodeRoundHistory('{"jsonrpc":"2.0","error":{"code":429,"message":"Too Many Requests"}}', reqs)).toEqual([
      { error: 'history RPC: batch refused (code 429)' },
    ]);
  });

  it('keeps two feeds apart in one request', () => {
    const reqs = [
      { feed: FEED, fromRound: LATEST.toString(), count: 2 },
      { feed: FEEDS.NVDA.feed, fromRound: '18446744073709551626', count: 2 },
    ];
    const reply = JSON.stringify([
      { id: 0, result: round(LATEST, 350, T - 60) },
      // TSLA's second round fails: its id is still TSLA's, NVDA's stay NVDA's.
      { id: 2, result: round(18446744073709551626n, 130, T - 30) },
      { id: 3, result: round(18446744073709551625n, 129, T - 600) },
    ]);
    expect(decodeRoundHistory(reply, reqs)).toEqual([
      { rounds: [`${T - 60}:35000000000`] },
      { rounds: [`${T - 30}:13000000000`, `${T - 600}:12900000000`] },
    ]);
  });

  it('a window crowded with rounds: the sampled history still finds the price that held', () => {
    // 600 rounds in the last hour: 350 for 40 minutes, then a 20-minute collapse and recovery written 580 times.
    const all = [
      // Days of ordinary history before it, a round every 20 minutes or so.
      ...Array.from({ length: 3000 }, (_, i) => ({ at: min(300) - (3000 - i) * 1200, answer: px(350) })),
      { at: min(300), answer: px(350) },
      ...Array.from({ length: 20 }, (_, i) => ({ at: min(60) + i * 120, answer: px(350 + (i % 2) * 0.5) })),
      ...Array.from({ length: 580 }, (_, i) => ({ at: min(20) + i * 2, answer: px(250 + (i % 50)) })),
    ];
    const newestFirst = [...all].reverse();
    const sampled = roundOffsets(ROUND_CALLS_PER_REQUEST)
      .filter((o) => o < newestFirst.length)
      .map((o) => newestFirst[o]);
    // Consecutive rounds only: all 48 inside the collapse, the fixing would be a collapse price.
    expect(timeWeightedMedian(newestFirst.slice(0, 48), min(60), T).answer).toBeLessThan(px(300));
    // Sampled back through the window: the 350 that held for two thirds of it.
    const fix = timeWeightedMedian(sampled, min(60), T);
    expect(fix.answer).toBeGreaterThanOrEqual(px(350));
    expect(fix.answer).toBeLessThanOrEqual(px(350.5));
    expect(coversWindow(sampled, min(60))).toBe(true);
  });
});

describe('fixing window: a term of the note', () => {
  const stock: ProductParams = { ...EXAMPLE_PRODUCTS.phoenix, underlyings: [FEEDS.TSLA], fixingWindowMin: 60 };
  const compiled = (p: ProductParams) => {
    const prod = instantiateProduct(p);
    return compile(parseBpmn(prod.bpmnXml, prod.assets), { product: prod.params });
  };

  it('is recorded on every price the note reads, and reaches the keeper', () => {
    const c = compiled(stock);
    const o = oracleFeeds(c.def!);
    expect(o.initialLevel).toMatchObject({ feed: FEEDS.TSLA.feed, window: 3600 });
    for (let k = 1; k <= stock.observations; k++) expect(o[`obs${k}`].window).toBe(3600);
    // Without the term nothing changes: no window, the same definition as before.
    const plain = compiled({ ...stock, fixingWindowMin: undefined });
    expect(oracleFeeds(plain.def!).initialLevel.window).toBeUndefined();
    expect(oracleFeeds(compiled({ ...stock, fixingWindowMin: 0 }).def!).initialLevel.window).toBeUndefined();
  });

  it('hands the window to the due report', () => {
    const c = compiled(stock);
    const def = c.def!;
    const step = def.steps.findIndex((s) => s.captures.some((x) => def.fields[x.field].name === 'initialLevel'));
    const due = dueReports(
      { id: '1', definition: '0x00', status: 0, tokens: [step], numbers: def.fields.map(() => 1n) },
      def,
      2_000_000_000,
    );
    expect(due[0].feeds.find((f) => f.field === 'initialLevel')).toMatchObject({ window: 3600 });
  });

  it('is offered where the feed history can be read: stocks, and crypto on Ethereum and Arbitrum', () => {
    expect(canWindowFeed(FEEDS.TSLA)).toBe(true);
    expect(canWindowFeed(FEEDS.ETH)).toBe(true);
    expect(canWindowFeed({ feedChain: 'ethereum-mainnet-base-1' })).toBe(false);
    expect(validateProductParams(stock)).toEqual([]);
    expect(validateProductParams({ ...stock, underlyings: [FEEDS.ETH] })).toEqual([]);
    expect(
      validateProductParams({
        ...stock,
        underlyings: [{ ...FEEDS.ETH, feedChain: 'ethereum-mainnet-base-1' }],
      }).join(' '),
    ).toMatch(/not available for ETH/);
    expect(validateProductParams({ ...stock, fixingWindowMin: 7 }).join(' ')).toMatch(/fixing window must be one of/);
    expect(fixingRuleText(stock)).toMatch(/time-weighted median .* 60 minutes/);
    expect(fixingRuleText({})).toBe('');
  });

  it('the disruption limit and the closing price are terms too', () => {
    const p: ProductParams = { ...stock, fixingWindowMin: 15, disruptionPct: 10, fixingAt: 'close' };
    expect(validateProductParams(p)).toEqual([]);
    const o = oracleFeeds(compiled(p).def!);
    expect(o.initialLevel).toMatchObject({ window: 900, disruption: 1000 });
    expect(fixingRuleText(p)).toMatch(/US market close \(16:00 New York\).*15 minutes before it.*more than 10%.*twice/);
    // Each needs a window; a close needs US stocks; the limit is one of the offered ones.
    expect(validateProductParams({ ...p, fixingWindowMin: undefined }).join(' ')).toMatch(
      /disruption rule needs a fixing window.*closing-price note needs a fixing window/,
    );
    expect(validateProductParams({ ...p, underlyings: [FEEDS.ETH] }).join(' ')).toMatch(/US stocks only: ETH trades/);
    expect(validateProductParams({ ...p, disruptionPct: 7 }).join(' ')).toMatch(/disruption limit must be one of/);
    // The due report carries the limit and the step's date.
    const def = compiled(p).def!;
    const step = def.steps.findIndex((s) => s.captures.some((x) => def.fields[x.field].name === 'initialLevel'));
    const due = dueReports(
      { id: '1', definition: '0x00', status: 0, tokens: [step], numbers: def.fields.map(() => 1_900_000_000n) },
      def,
      2_000_000_000,
    );
    expect(due[0].at).toBe(1_900_000_000);
    expect(due[0].feeds.find((f) => f.field === 'initialLevel')).toMatchObject({ window: 900, disruption: 1000 });
  });
});

describe('fixing window: the step fixing (anchored at the scheduled time, disruption rule)', () => {
  const W = 900;
  const calm = [
    { at: T - 5000, answer: px(100) },
    { at: T - 400, answer: px(101) },
  ];
  it('ends at the scheduled time, whenever the keeper runs', () => {
    // A move after the scheduled time is not in the fixing, even when the report lands a little later.
    const h = [...calm, { at: T + 20, answer: px(140) }];
    const a = stepFixing([h], { window: W, nowSec: T + 60, dueAt: T });
    const b = stepFixing([h], { window: W, nowSec: T + 600, dueAt: T });
    expect(a).toMatchObject({ answers: [px(100)], at: T, anchored: true, postponed: 0 });
    expect(b).toEqual(a);
  });
  it('falls back to the window before the reading when the history does not reach the scheduled time', () => {
    const h = [{ at: T + 3000, answer: px(120) }];
    expect(stepFixing([h], { window: W, nowSec: T + 4000, dueAt: T })).toMatchObject({
      answers: [px(120)],
      at: T + 4000,
      anchored: false,
    });
    expect(stepFixing([calm], { window: W, nowSec: T })).toMatchObject({ at: T, anchored: false });
  });
  it('measures disruption between the low and the high in effect inside the window', () => {
    const h = [
      { at: T - 5000, answer: px(100) },
      { at: T - 300, answer: px(88) }, // a 12% dip for 20 seconds
      { at: T - 280, answer: px(100) },
    ];
    expect(windowDisrupted(h, T - W, T, 1000)).toBe(true);
    expect(windowDisrupted(h, T - W, T, 2000)).toBe(false);
    expect(windowDisrupted(calm, T - W, T, 500)).toBe(false);
    // The dip is over by the next window.
    expect(windowDisrupted(h, T, T + W, 1000)).toBe(false);
  });
  it('postpones a disrupted fixing by one window, and waits for that window to end', () => {
    const h = [
      { at: T - 5000, answer: px(100) },
      { at: T - 300, answer: px(88) },
      { at: T - 280, answer: px(100) },
    ];
    const o = { window: W, dueAt: T, disruptionBps: 1000 };
    // Without the rule the median already ignores the dip.
    expect(stepFixing([h], { window: W, nowSec: T + 60, dueAt: T })).toMatchObject({
      answers: [px(100)],
      postponed: 0,
    });
    expect(stepFixing([h], { ...o, nowSec: T + 60 })).toMatchObject({ retryAt: T + W });
    expect(stepFixing([h], { ...o, nowSec: T + W + 5 })).toMatchObject({
      answers: [px(100)],
      at: T + W,
      postponed: 1,
      disrupted: false,
      anchored: true,
    });
  });
  it('one disrupted underlying postpones the whole step: every price is fixed over the same window', () => {
    const wild = [
      { at: T - 5000, answer: px(50) },
      { at: T - 100, answer: px(60) },
      { at: T + 100, answer: px(61) },
    ];
    const r = stepFixing([calm, wild], { window: W, nowSec: T + W, dueAt: T, disruptionBps: 1000 });
    expect(r).toMatchObject({ answers: [px(101), px(61)], at: T + W, postponed: 1 });
  });
  it('is taken regardless after the last postponement', () => {
    // A market that keeps moving 12% every window.
    const h = Array.from({ length: 40 }, (_, i) => ({ at: T - 5000 + i * 400, answer: px(i % 2 ? 112 : 100) }));
    const o = { window: W, dueAt: T, disruptionBps: 1000 };
    expect(stepFixing([h], { ...o, nowSec: T + DISRUPTION_MAX_POSTPONEMENTS * W - 1 })).toHaveProperty('wait');
    expect(stepFixing([h], { ...o, nowSec: T + DISRUPTION_MAX_POSTPONEMENTS * W })).toMatchObject({
      at: T + DISRUPTION_MAX_POSTPONEMENTS * W,
      postponed: DISRUPTION_MAX_POSTPONEMENTS,
      disrupted: true,
    });
  });
});

describe('closing price: the US close', () => {
  const iso = (t: number) => new Date(t * 1000).toISOString();
  const at = (s: string) => Date.parse(s) / 1000;
  it('is 16:00 New York on the next weekday, through daylight saving', () => {
    // Winter (UTC-5): Monday 23 Nov 2026, before and after the close.
    expect(iso(usCloseOnOrAfter(at('2026-11-23T15:00:00Z')))).toBe('2026-11-23T21:00:00.000Z');
    expect(iso(usCloseOnOrAfter(at('2026-11-23T21:00:00Z')))).toBe('2026-11-23T21:00:00.000Z');
    expect(iso(usCloseOnOrAfter(at('2026-11-23T21:00:01Z')))).toBe('2026-11-24T21:00:00.000Z');
    // A weekend goes to Monday.
    expect(iso(usCloseOnOrAfter(at('2026-11-20T22:00:00Z')))).toBe('2026-11-23T21:00:00.000Z');
    expect(iso(usCloseOnOrAfter(at('2026-11-22T10:00:00Z')))).toBe('2026-11-23T21:00:00.000Z');
    // Summer (UTC-4), and across the change (8 March 2026).
    expect(iso(usCloseOnOrAfter(at('2026-07-01T12:00:00Z')))).toBe('2026-07-01T20:00:00.000Z');
    expect(iso(usCloseOnOrAfter(at('2026-03-06T22:00:00Z')))).toBe('2026-03-09T20:00:00.000Z');
  });
});
