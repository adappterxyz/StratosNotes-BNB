/**
 * Event-log scans over long block ranges. Public RPCs cap how many blocks one eth_getLogs may span (Robinhood Chain
 * testnet: 10,000,000; publicnode's Base Sepolia: 50,000), and an engine's deployment block falls further behind the
 * head every day, so a single "deployment block to latest" query starts failing once the chain grows past the cap.
 * `scanLogs` splits the range into spans the RPC accepts: it learns the cap from the RPC's own error (the number it
 * names, else by halving) and remembers it in `range`, so later scans go straight to the right span.
 */

/** A scan's learned span, shared by every scan against the same RPC (one per adapter or bot). */
export interface LogRange {
  /** The largest span (in blocks) known to work; undefined until an RPC refuses a range. */
  max?: bigint;
}

const RANGE_ERROR =
  /block range|blocks? (are )?allowed|range (is )?too (large|wide|big)|exceed(s|ed)? (the )?(max|limit)|too many blocks|query returned more than|narrow the (block )?range/i;

function errorText(err: unknown): string {
  if (!(err instanceof Error)) return String(err);
  const e = err as Error & { details?: string; shortMessage?: string; cause?: unknown };
  return [e.message, e.details, e.shortMessage, e.cause instanceof Error ? errorText(e.cause) : ''].join(' ');
}

/** Whether `err` is an RPC refusing an eth_getLogs span as too wide (not some other failure, which is rethrown). */
export function isRangeError(err: unknown): boolean {
  return RANGE_ERROR.test(errorText(err));
}

/** The span an RPC says it allows, when its error names one ("only 10000000 are allowed", "maximum block range: 50000"). */
export function allowedSpan(err: unknown): bigint | undefined {
  const t = errorText(err);
  const m =
    /only (\d+) (?:blocks? )?(?:are |is )?allowed/i.exec(t) ??
    /max(?:imum)? block range:? (\d+)/i.exec(t) ??
    /range (?:limit|is limited to|of) (\d+)/i.exec(t);
  return m ? BigInt(m[1]) : undefined;
}

/**
 * Every log `get` returns for blocks `from`..`to` (inclusive), queried in spans the RPC accepts, in block order.
 * `get` must return the logs of exactly the span it is given.
 */
export async function scanLogs<T>(
  from: bigint,
  to: bigint,
  get: (fromBlock: bigint, toBlock: bigint) => Promise<T[]>,
  range: LogRange = {},
): Promise<T[]> {
  const out: T[] = [];
  let start = from;
  while (start <= to) {
    const span = range.max ?? to - start + 1n;
    const end = start + span - 1n < to ? start + span - 1n : to;
    try {
      out.push(...(await get(start, end)));
      start = end + 1n;
    } catch (err) {
      if (!isRangeError(err) || end === start) throw err;
      const tried = end - start + 1n;
      const named = allowedSpan(err);
      const next = named && named < tried ? named : tried / 2n;
      range.max = next > 0n ? next : 1n;
    }
  }
  return out;
}
