/**
 * scanLogs: event scans over ranges wider than an RPC's eth_getLogs cap, with the two caps the testnets' RPCs report.
 */
import { describe, expect, it } from 'vitest';
import { allowedSpan, isRangeError, scanLogs, type LogRange } from '../src';

/** An RPC that refuses spans wider than `cap` with `message`, and returns one "log" per block otherwise. */
function rpc(cap: bigint, message: (span: bigint) => string) {
  const calls: Array<[bigint, bigint]> = [];
  const get = async (from: bigint, to: bigint) => {
    calls.push([from, to]);
    const span = to - from + 1n;
    if (span > cap) throw Object.assign(new Error('RPC Request failed.'), { details: message(span) });
    const out: bigint[] = [];
    for (let b = from; b <= to; b++) out.push(b);
    return out;
  };
  return { get, calls };
}

const robinhood = (span: bigint) =>
  `query spans ${span} blocks (1 to ${span}), but only 10 are allowed for this request; narrow the block range`;
const publicnode = () => 'exceed maximum block range: 7';

describe('scanLogs', () => {
  it('queries the whole range at once when the RPC accepts it', async () => {
    const { get, calls } = rpc(1000n, robinhood);
    const logs = await scanLogs(5n, 24n, get);
    expect(logs).toHaveLength(20);
    expect(calls).toEqual([[5n, 24n]]);
  });

  it('uses the span the RPC names, keeps every log in order, and remembers the span', async () => {
    const { get, calls } = rpc(10n, robinhood);
    const range: LogRange = {};
    const logs = await scanLogs(1n, 35n, get, range);
    expect(logs).toEqual(Array.from({ length: 35 }, (_, i) => BigInt(i + 1)));
    expect(range.max).toBe(10n);
    expect(calls.slice(1)).toEqual([
      [1n, 10n],
      [11n, 20n],
      [21n, 30n],
      [31n, 35n],
    ]);
    // A later scan with the same range goes straight to the learned span.
    calls.length = 0;
    await scanLogs(36n, 50n, get, range);
    expect(calls).toEqual([
      [36n, 45n],
      [46n, 50n],
    ]);
  });

  it("reads publicnode's wording too", async () => {
    const { get } = rpc(7n, publicnode);
    const range: LogRange = {};
    expect(await scanLogs(0n, 99n, get, range)).toHaveLength(100);
    expect(range.max).toBe(7n);
  });

  it('halves the span when the RPC names no number', async () => {
    const { get } = rpc(6n, () => 'block range is too wide');
    const range: LogRange = {};
    expect(await scanLogs(0n, 63n, get, range)).toHaveLength(64);
    expect(range.max).toBeLessThanOrEqual(6n);
  });

  it('rethrows any other error', async () => {
    const get = async () => {
      throw new Error('HTTP request failed.');
    };
    await expect(scanLogs(0n, 10n, get)).rejects.toThrow('HTTP request failed.');
  });
});

describe('range errors', () => {
  it('recognises both testnet RPCs and reads the span they allow', () => {
    const rh = Object.assign(new Error('Invalid parameters were provided to the RPC method.'), {
      details: robinhood(10_980_193n).replace('only 10 ', 'only 10000000 '),
    });
    const base = Object.assign(new Error('RPC Request failed.'), { details: 'exceed maximum block range: 50000' });
    expect(isRangeError(rh)).toBe(true);
    expect(allowedSpan(rh)).toBe(10_000_000n);
    expect(isRangeError(base)).toBe(true);
    expect(allowedSpan(base)).toBe(50_000n);
    expect(isRangeError(new Error('execution reverted'))).toBe(false);
  });
});
