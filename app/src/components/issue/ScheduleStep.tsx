import { Timer } from 'lucide-react';
import { canWindowFeed, FIXING_WINDOWS, type ProductParams } from '@sn/core';
import type { ChainConfig } from '../../lib/api';
import { Presets } from './controls';
import type { Every, Timing } from './schedule';

const SIZES = [1_000, 10_000, 100_000];
const BOOK = [
  { min: 5, label: 'In 5 minutes' },
  { min: 60, label: 'In 1 hour' },
  { min: 24 * 60, label: 'Tomorrow' },
  { min: 7 * 24 * 60, label: 'In a week' },
];
const EVERY: Array<{ v: Every; label: string; sub: string; star?: boolean }> = [
  { v: { n: 3, unit: 'minutes' }, label: 'Demo: every 3 minutes', sub: 'Watch a whole note run', star: true },
  { v: { n: 1, unit: 'days' }, label: 'Every day', sub: 'A short test' },
  { v: { n: 1, unit: 'months' }, label: 'Every month', sub: '' },
  { v: { n: 3, unit: 'months' }, label: 'Every 3 months', sub: 'Usual for notes' },
];

/** Step 3, Schedule: how much is on offer, when the book closes, and how often the price is checked. */
export function ScheduleStep({
  p,
  set,
  sym,
  size,
  setSize,
  strikeIn,
  setStrikeIn,
  every,
  setEvery,
  setTiming,
  chainCfg,
  chainKey,
  observations,
  strikeAt,
  dateOf,
  fmtT,
  demo,
}: {
  p: ProductParams;
  set: (patch: Partial<ProductParams>) => void;
  sym: string;
  size: number;
  setSize: (n: number) => void;
  strikeIn: number;
  setStrikeIn: (n: number) => void;
  every: Every;
  setEvery: (e: Every) => void;
  setTiming: (t: Timing | null) => void;
  chainCfg: ChainConfig | undefined;
  chainKey: string;
  observations: number;
  strikeAt: number;
  dateOf: (k: number) => number;
  fmtT: (s: number) => string;
  demo: boolean;
}) {
  const runs = demo ? Math.round(((dateOf(observations) - strikeAt) / 60) * 10) / 10 : null;
  // A fixing window needs the feed's price history, which the keeper can read for stocks only so far.
  const canWindow = p.underlyings.every(canWindowFeed);
  return (
    <>
      <h2>Schedule</h2>
      <div className="iw-field">
        <div className="iw-field-h">
          <label htmlFor="is-size">How much to raise</label>
          <span className="with-suffix maxw-200">
            <input id="is-size" type="number" min={1} value={size} onChange={(e) => setSize(Number(e.target.value))} />
            <span className="suffix">{sym}</span>
          </span>
        </div>
        <Presets
          label="Size"
          options={SIZES.map((s) => ({ label: `${s.toLocaleString()} ${sym}`, value: s }))}
          value={size}
          onPick={setSize}
        />
        <span className="hint">Units on offer: one unit per 1 {sym} of face value.</span>
      </div>

      <div className="iw-field">
        <div className="iw-field-h">
          <label htmlFor="is-strike">Book closes</label>
          <span className="with-suffix maxw-200">
            <input
              id="is-strike"
              type="number"
              min={2}
              value={strikeIn}
              onChange={(e) => setStrikeIn(Math.max(2, Number(e.target.value) || 2))}
            />
            <span className="suffix">minutes</span>
          </span>
        </div>
        <Presets
          label="Book closes"
          options={BOOK.map((b) => ({ label: b.label, value: b.min }))}
          value={strikeIn}
          onPick={setStrikeIn}
        />
        <span className="hint">Investors can buy until then; Chainlink fixes the starting prices at that moment.</span>
      </div>

      <div className="iw-field">
        <div className="iw-field-h">
          <label htmlFor="is-every">How often the price is checked</label>
          <span className="row flex-nowrap gap-6 maxw-240">
            <input
              className="w-64"
              id="is-every"
              type="number"
              min={1}
              value={every.n}
              onChange={(e) => {
                setEvery({ ...every, n: Number(e.target.value) || 1 });
                setTiming(null);
              }}
            />
            <select
              aria-label="Interval unit"
              value={every.unit}
              onChange={(e) => {
                setEvery({ ...every, unit: e.target.value as typeof every.unit });
                setTiming(null);
              }}
            >
              <option value="minutes">minutes (demo)</option>
              <option value="days">days</option>
              <option value="months">months</option>
            </select>
          </span>
        </div>
        <Presets
          label="Check every"
          options={EVERY.map((e) => ({ label: e.label, sub: e.sub || undefined, value: e.v, star: e.star }))}
          value={every}
          onPick={(v) => {
            setEvery(v);
            setTiming(null);
          }}
        />
      </div>

      <div className="iw-field" data-fixing-window={p.fixingWindowMin ?? 0}>
        <div className="iw-field-h">
          <span className="lbl">Which price each check uses</span>
        </div>
        <Presets
          label="Price fixing"
          options={FIXING_WINDOWS.filter((m) => m === 0 || canWindow).map((m) => ({
            label: m ? `${m}-minute median` : 'Latest price',
            sub: m ? 'Ignores a brief spike' : 'One reading',
            value: m as number,
          }))}
          value={canWindow ? (p.fixingWindowMin ?? 0) : 0}
          onPick={(m) => set({ fixingWindowMin: m || undefined })}
        />
        <span className="hint">
          {canWindow
            ? 'A median takes the price that held for most of the minutes before the check, from the Chainlink feed. A sudden spike or dip that reverses does not set the start price, a coupon or the barrier.'
            : 'A median over the minutes before each check is available for stocks only for now.'}
        </span>
      </div>

      <div className="iw-timeline" aria-label="Dates">
        <span className="iw-tl-dot start">
          <b>Start</b>
          {fmtT(strikeAt)}
        </span>
        {Array.from({ length: observations }, (_, i) => (
          <span key={i} className={`iw-tl-dot${i === observations - 1 ? ' end' : ''}`}>
            <b>{i === observations - 1 ? 'End' : `Check ${i + 1}`}</b>
            {fmtT(dateOf(i + 1))}
          </span>
        ))}
      </div>
      <p className="small muted m-0">
        On {chainCfg?.name ?? chainKey}.{' '}
        {demo && runs !== null && (
          <span className="iw-demo">
            <Timer className="i" /> The whole note runs in about {runs} minutes after the book closes: watch it live.
          </span>
        )}
      </p>
    </>
  );
}
