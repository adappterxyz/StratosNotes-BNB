import { DISRUPTION_MAX_POSTPONEMENTS, MAX_GRACE_DAYS, usCloseOnOrAfter } from '@sn/core';

export type Every = { n: number; unit: 'minutes' | 'days' | 'months' };
export type Timing = { lag: number; grace: number };

/** The issuance schedule the wizard proposes: observation dates, and when each payment is due. */
export function issueSchedule(
  every: Every,
  strikeIn: number,
  timing: Timing | null,
  eco: { settlementLagDays: number; gracePeriodDays: number },
  /** The note's fixing terms: a closing-price note's dates sit on the US close; the disruption rule can delay a check. */
  fixing: { fixingAt?: 'close'; fixingWindowMin?: number; disruptionPct?: number } = {},
) {
  // Payment timing: per issuance. A schedule minutes apart (a demo) gets seconds; a real one, days.
  const stepSec =
    every.unit === 'minutes' ? every.n * 60 : every.unit === 'days' ? every.n * 86400 : every.n * 30 * 86400;
  const demo = every.unit === 'minutes';
  const t =
    timing ??
    (demo
      ? { lag: Math.min(30, Math.floor(stepSec / 4)), grace: Math.min(60, Math.floor(stepSec / 3)) }
      : { lag: eco.settlementLagDays * 86400, grace: eco.gracePeriodDays * 86400 });
  const close = fixing.fixingAt === 'close';
  // The disruption rule can postpone a check by this long: its payment date must not come first.
  const maxDelay = fixing.disruptionPct ? DISRUPTION_MAX_POSTPONEMENTS * (fixing.fixingWindowMin ?? 0) * 60 : 0;
  const timingBad =
    maxDelay && t.lag < maxDelay
      ? `With the disruption rule a check can be up to ${Math.round(maxDelay / 60)} minutes late: the payment date must be at least that long after it.`
      : t.lag + t.grace > stepSec
        ? 'The payment date plus grace must fall before the next observation.'
        : t.grace > MAX_GRACE_DAYS * 86400
          ? `Grace is at most ${MAX_GRACE_DAYS} days.`
          : '';
  const rawStrike = Math.floor(Date.now() / 60000) * 60 + strikeIn * 60;
  // A closing-price note: the book closes, and every check falls, at the US close (16:00 New York) of a weekday.
  const strikeAt = close ? usCloseOnOrAfter(rawStrike) : rawStrike;
  const rawDate = (k: number) => {
    if (every.unit === 'months') {
      const d = new Date(strikeAt * 1000);
      d.setUTCMonth(d.getUTCMonth() + every.n * k);
      return Math.floor(d.getTime() / 1000);
    }
    return strikeAt + k * every.n * (every.unit === 'days' ? 86400 : 60);
  };
  const dateOf = (k: number): number => {
    if (!close) return rawDate(k);
    // Each check at the first close on or after its date, and always a later close than the check before it.
    let prev = strikeAt;
    for (let i = 1; i <= k; i++) prev = usCloseOnOrAfter(Math.max(rawDate(i), prev + 1));
    return prev;
  };
  const scheduleBad =
    close && demo ? 'A closing-price note is checked at most once a day: choose days or months, not minutes.' : '';
  const fmtT = (s: number) =>
    close
      ? `${new Date(s * 1000).toLocaleDateString([], { dateStyle: 'medium' })}, US close`
      : demo
        ? new Date(s * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
        : new Date(s * 1000).toLocaleDateString([], { dateStyle: 'medium' });
  const dur = (s: number) => (demo ? `${s}s` : `${+(s / 86400).toFixed(2)} days`);
  return { demo, t, timingBad, scheduleBad, strikeAt, dateOf, fmtT, dur };
}
