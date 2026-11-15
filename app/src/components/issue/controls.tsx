/**
 * The issue builder's controls: a slider with its number (the number input keeps the field's id, so links, tests and
 * keyboards can type an exact value) and an optional "recommended" band, and a row of presets.
 */
import type { CSSProperties, ReactNode } from 'react';

export function Slider({
  id,
  label,
  tech,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  safe,
  warn,
}: {
  id: string;
  label: string;
  /** The technical name, shown small. */
  tech?: string;
  value: number | undefined;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: ReactNode;
  /** A recommended range, drawn under the track. */
  safe?: { from: number; to: number; label?: string };
  /** A warning for the current value. */
  warn?: string | null;
}) {
  const v = Number.isFinite(value) ? (value as number) : min;
  const at = (x: number) => ((Math.min(max, Math.max(min, x)) - min) / (max - min)) * 100;
  return (
    <div className={`sl${warn ? ' warned' : ''}`}>
      <div className="sl-head">
        <label htmlFor={id}>
          {label}
          {tech && <small> ({tech})</small>}
        </label>
        <span className="sl-num">
          <input
            id={id}
            type="number"
            step={step}
            min={min}
            value={Number.isFinite(value) ? value : ''}
            onChange={(e) => onChange(e.target.value === '' ? NaN : Number(e.target.value))}
          />
          {suffix && <span className="suffix">{suffix}</span>}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={Math.min(max, Math.max(min, v))}
        style={{ '--fill': `${at(v)}%` } as CSSProperties}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {safe && (
        <div className="sl-safe" aria-hidden="true">
          <span
            style={{ left: `${at(safe.from)}%`, width: `${at(safe.to) - at(safe.from)}%` } as CSSProperties}
            title={safe.label}
          />
          {safe.label && <em style={{ left: `${at(safe.from)}%` }}>{safe.label}</em>}
        </div>
      )}
      {warn ? <span className="sl-warn">{warn}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Presets<T>({
  label,
  options,
  value,
  onPick,
  same = (a, b) => JSON.stringify(a) === JSON.stringify(b),
}: {
  label: string;
  options: Array<{ label: ReactNode; sub?: ReactNode; value: T; star?: boolean }>;
  value: T;
  onPick: (v: T) => void;
  same?: (a: T, b: T) => boolean;
}) {
  return (
    <div className="presets iw-presets" role="group" aria-label={label}>
      {options.map((o, i) => {
        const on = same(o.value, value);
        return (
          <button
            key={i}
            type="button"
            className={`preset${on ? ' on' : ''}${o.star ? ' star' : ''}`}
            aria-pressed={on}
            onClick={() => onPick(o.value)}
          >
            <b>{o.label}</b>
            {o.sub && <small>{o.sub}</small>}
          </button>
        );
      })}
    </div>
  );
}
