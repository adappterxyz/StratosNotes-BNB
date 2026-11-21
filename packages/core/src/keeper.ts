/**
 * What the keeper decides, as pure functions: no I/O and no Node APIs. This file is bundled into the CRE
 * workflow's WASM (cre/notes-keeper-evm) and the fallback keeper (services/keeper-fallback), and unit-tested
 * here, so both agents decide exactly the same thing.
 *
 * Input: a running process's state as the engine holds it (definition, BPMN tokens, captured values, account
 * balances) and its decoded definition. Output: the reports that are due now. A report either runs one oracle
 * step (a strike fixing or an observation: the keeper reads each capture's price feed, collateral prices
 * included) and everything after it, or only advances (STEP_ADVANCE) when time alone moves the note: a payment
 * date, the end of a grace period or of a margin call, a funding window closing.
 */
import type { WorkflowDef } from './def-types';
import { evalExpr } from './eval';
import type { TokenReading } from './feed-rpc';

const KIND_SERVICE = 3,
  KIND_RECEIVE = 4,
  KIND_CATCH = 7,
  SRC_ORACLE = 1;
const NO_EXPR = 0xffff;

/** Report step that only runs what is due (FlowEngine.STEP_ADVANCE). */
export const STEP_ADVANCE = 0xffff;
/** Report step reserved for cross-chain payout decisions (FlowEngine.STEP_PAYOUT, Phase 5). */
export const PAYOUT_STEP = 0xfffe;
/** FlowEngine.RUNNING. */
export const STATUS_RUNNING = 0;

/** A process as the keeper sees it. `numbers[f]` is field f's value when it holds a number (dates included). */
export interface ProcessState {
  /** Engine-specific process id (EVM: the numeric pid as a decimal string). */
  id: string;
  /** 0x-hex definition id: sha256 of the definition bytes. */
  definition: string;
  status: number;
  /** Step indexes holding a BPMN token (a step may appear more than once). */
  tokens: number[];
  numbers: Array<bigint | undefined>;
  /**
   * Every role's balance of every asset, engine fixed point: balances[role * nAssets + asset] (NotesLens).
   * Lets the keeper see what a guard such as "Funded?" sees; without it, guards that read balances wait.
   */
  balances?: bigint[];
}

/** Where a capture's price comes from: a Chainlink feed on a named chain (CRE chain-selector name). */
export interface FeedRef {
  field: string;
  feed: string;
  feedChain: string;
  /** Seconds the feed may go without an update (its heartbeat). */
  staleness: number;
  /**
   * Fixing window, seconds (absent: the latest round). The price is the time-weighted median of the feed's rounds
   * over the window before the reading (timeWeightedMedian): a wick shorter than half the window does not move it.
   */
  window?: number;
}

export interface DueReport {
  process: string;
  definition: string;
  step: number;
  /** BPMN id of the step, or 'advance'. */
  stepId: string;
  /** One per oracle capture, in capture order (empty for STEP_ADVANCE). */
  feeds: FeedRef[];
}

/** Where each oracle field's feed is, from the definition's metadata (packages/core/src/compile.ts). */
export function oracleFeeds(
  def: WorkflowDef,
): Record<string, { feed: string; feedChain?: string; staleness?: number; window?: number }> {
  try {
    return (
      (
        JSON.parse(def.meta) as {
          oracles?: Record<string, { feed: string; feedChain?: string; staleness?: number; window?: number }>;
        }
      ).oracles ?? {}
    );
  } catch {
    return {};
  }
}

/** When a step's timer fires (unix seconds), or undefined if its date field is not set yet. */
function timerAt(def: WorkflowDef, p: ProcessState, step: number): number | undefined {
  const t = def.steps[step].timer;
  if (!t) return -Infinity;
  if (t.kind === 0) return Number(t.at);
  const v = p.numbers[t.field];
  return v === undefined ? undefined : Number(v);
}

/** A step's guard (receive task) as the engine would evaluate it now: true, false, or null if not knowable. */
export function guardHolds(p: ProcessState, def: WorkflowDef, step: number, nowSec: number): boolean | null {
  const g = def.steps[step]?.guard;
  if (g === undefined || g === NO_EXPR) return true;
  const nAssets = def.assets.length;
  const v = evalExpr(
    def.exprs[g],
    def.fields.map((f) => f.kind),
    (f) => p.numbers[f] ?? null,
    {
      balance: (role, asset) => (p.balances ? (p.balances[role * nAssets + asset] ?? 0n) : null),
      now: () => nowSec,
    },
  );
  return v === null ? null : v !== 0n;
}

/**
 * The reports due for one process at `nowSec`: each due oracle step once (lowest step first), then at most
 * one STEP_ADVANCE if a token waits on something time has now released: a due timer step that captures nothing
 * from an oracle (a payment date), a waiting step whose guard now holds (the end of a grace period or of a
 * margin call), or a repeatable window whose closing date has passed.
 */
export function dueReports(p: ProcessState, def: WorkflowDef, nowSec: number): DueReport[] {
  if (p.status !== STATUS_RUNNING) return [];
  const oracles = oracleFeeds(def);
  const out: DueReport[] = [];
  let advance = false;
  // Windows (funding, the book) that closed: worth a transaction only when nothing else holds the note, i.e.
  // closing them is what finishes it (a later report or payment passes them on anyway).
  const closed = (t: number) => {
    const u = def.steps[t]?.until;
    if (!u) return false;
    const at = u.kind === 0 ? Number(u.at) : p.numbers[u.field] === undefined ? undefined : Number(p.numbers[u.field]);
    return at !== undefined && nowSec >= at;
  };
  if (p.tokens.length && p.tokens.every((t) => def.steps[t]?.until) && p.tokens.some(closed)) advance = true;
  for (const t of [...new Set(p.tokens)].sort((a, b) => a - b)) {
    const s = def.steps[t];
    if (!s) continue;
    if (s.until) continue;
    if (s.kind === KIND_RECEIVE) {
      if (s.guard !== NO_EXPR && guardHolds(p, def, t, nowSec) === true) advance = true;
      continue;
    }
    if (s.kind !== KIND_SERVICE && s.kind !== KIND_CATCH) continue; // tasks and gateways: not the keeper's
    const caps = s.captures.filter((c) => c.source === SRC_ORACLE);
    if (!s.timer && !caps.length) continue; // runs by itself
    const at = timerAt(def, p, t);
    if (at === undefined || nowSec < at) continue;
    if (!caps.length) {
      advance = true; // a plain timer: nothing else will move the note
      continue;
    }
    const feeds = caps.map((c) => {
      const name = def.fields[c.field].name;
      const o = oracles[name];
      return o
        ? {
            field: name,
            feed: o.feed,
            feedChain: o.feedChain ?? 'ethereum-mainnet',
            staleness: o.staleness ?? 3600,
            ...(o.window ? { window: o.window } : {}),
          }
        : null;
    });
    if (feeds.some((f) => !f)) continue; // a capture with no recorded feed cannot be observed
    out.push({ process: p.id, definition: p.definition, step: t, stepId: s.id, feeds: feeds as FeedRef[] });
  }
  if (advance && !out.length)
    out.push({ process: p.id, definition: p.definition, step: STEP_ADVANCE, stepId: 'advance', feeds: [] });
  return out;
}

/**
 * Feed overrides by symbol: route an underlying's feed to another source than the one recorded at compile
 * time (e.g. Robinhood Chain mainnet equity feeds, or a chain's own feeds once CRE reads it). Keyed by the
 * recorded feed address (lowercase).
 */
export type FeedRoutes = Record<string, { feed: string; feedChain: string; staleness?: number }>;

export function routeFeed(f: FeedRef, routes: FeedRoutes | undefined): FeedRef {
  const r = routes?.[f.feed.toLowerCase()];
  return r
    ? {
        field: f.field,
        feed: r.feed,
        feedChain: r.feedChain,
        staleness: r.staleness ?? f.staleness,
        ...(f.window ? { window: f.window } : {}),
      }
    : f;
}

/** Chainlink answer (feed decimals) -> engine fixed point (10 decimals). */
export function feedToFixed(answer: bigint, decimals: number): bigint {
  return decimals <= 10 ? answer * 10n ** BigInt(10 - decimals) : answer / 10n ** BigInt(decimals - 10);
}

/**
 * Check a `latestRoundData` answer and convert it: positive, answered, and no older than the feed's
 * heartbeat plus `allowanceSec` (reads at a finalized block lag the chain head).
 */
export function checkRound(
  round: { roundId: bigint; answer: bigint; updatedAt: bigint; answeredInRound: bigint },
  decimals: number,
  nowSec: number,
  staleness: number,
  allowanceSec: number,
): bigint {
  if (round.roundId === 0n || round.answeredInRound < round.roundId) throw new Error('round not answered');
  if (round.answer <= 0n) throw new Error('non-positive answer');
  const age = nowSec - Number(round.updatedAt);
  if (age > staleness + allowanceSec) throw new Error(`stale round (age ${age}s, max ${staleness + allowanceSec}s)`);
  return feedToFixed(round.answer, decimals);
}

/**
 * Seconds around a multiplier change during which a stock observation waits. Robinhood pauses the token's oracle
 * while it applies a corporate action, but the flag is advisory and the price and the multiplier do not switch in
 * one transaction: an hour either side of the effective time keeps a report from mixing the old one with the new.
 */
export const CORPORATE_ACTION_WINDOW = 3600;

/**
 * Why a stock price (or its token's multiplier) must not be used now, or null when it may: the issuer has paused
 * the token's oracle, or a multiplier change takes (or took) effect within CORPORATE_ACTION_WINDOW. The report
 * waits and the keeper retries every run; nothing is lost, the observation is taken once the action is through.
 */
export function corporateActionHold(t: TokenReading, nowSec: number): string | null {
  if ('error' in t) return t.error;
  if (t.paused) return 'oracle paused by the token issuer (corporate action)';
  const at = Number(t.effectiveAt);
  if (at > 0 && Math.abs(nowSec - at) < CORPORATE_ACTION_WINDOW) {
    return `multiplier change ${nowSec < at ? 'takes' : 'took'} effect at ${at} (corporate action window)`;
  }
  return null;
}

/** A stock token's multiplier in effect (18 decimals) as engine fixed point; throws while corporateActionHold. */
export function tokenMultiplier(t: TokenReading, nowSec: number): bigint {
  const hold = corporateActionHold(t, nowSec);
  if (hold) throw new Error(hold);
  const m = BigInt((t as { multiplier: string }).multiplier);
  if (m <= 0n) throw new Error('non-positive multiplier');
  return feedToFixed(m, 18);
}

/** One round of a feed: when it was written (unix seconds) and its answer (feed decimals). */
export interface PricePoint {
  at: number;
  answer: bigint;
}

/**
 * The time-weighted median of a feed over [from, to]: each round's answer counts for as long as it was the feed's
 * price inside the window (from its own time, or `from`, to the next round, or `to`); the median is the lowest answer
 * at which half that time is reached. A wick, however deep, that lasted less than half the window does not move it;
 * a price that held for most of the window is the fixing. Rounds after `to` are ignored. `covered` is the part of
 * the window the rounds account for (less than the window when the oldest round given is younger than `from`).
 * Deterministic integer arithmetic: every node and the fallback keeper get the same number from the same rounds.
 */
export function timeWeightedMedian(
  points: readonly PricePoint[],
  from: number,
  to: number,
): { answer: bigint; covered: number } {
  const pts = points.filter((p) => p.at <= to).sort((a, b) => a.at - b.at);
  if (!pts.length) throw new Error('no round at or before the fixing time');
  const weighted: Array<{ answer: bigint; w: number }> = [];
  let covered = 0;
  for (let i = 0; i < pts.length; i++) {
    const start = Math.max(pts[i].at, from);
    const end = i + 1 < pts.length ? Math.min(pts[i + 1].at, to) : to;
    const w = end - start;
    if (w > 0) {
      weighted.push({ answer: pts[i].answer, w });
      covered += w;
    }
  }
  // A window of no length (or rounds only at its very end): the price in effect at `to`.
  if (!covered) return { answer: pts[pts.length - 1].answer, covered: 0 };
  weighted.sort((a, b) => (a.answer < b.answer ? -1 : a.answer > b.answer ? 1 : 0));
  let acc = 0;
  for (const x of weighted) {
    acc += x.w;
    if (acc * 2 >= covered) return { answer: x.answer, covered };
  }
  return { answer: weighted[weighted.length - 1].answer, covered };
}

/** Whether the rounds given reach back to the start of the window (the oldest is at or before `from`). */
export const coversWindow = (points: readonly PricePoint[], from: number): boolean => points.some((p) => p.at <= from);
