/**
 * "Play the note": pick a scenario, or drag each check's level (the weakest underlying, % of its starting price) up
 * and down, then press Play. The checks run in turn: coupons drop in, the note repays early or the money-back line
 * breaks, and the payout for 100 counts up. The amounts are the reference payoff's (@sn/core simulatePerf, through
 * lib/story playOut), the same specification the on-chain workflow is tested against. It assumes the issuer pays
 * every payment on time. No wallet needed; with reduced motion the result shows at once.
 */
import { useEffect, useMemo, useRef, useState, type PointerEvent as RPointerEvent } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import type { ProductParams } from '@sn/core';
import type { Schedule } from '../lib/listing';
import { bandRange, checkWhen, linesOf, playOut, scenarios, type PlayEvent } from '../lib/story';

const W = 720;
const H = 300;
const X0 = 52;
const X1 = W - 16;
const Y0 = H - 34;
const Y1 = 18;
const STEP_MS = 900;

const reduced = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function PlayNote({
  p,
  cash,
  schedule = {},
  start,
  title = 'Play the note',
}: {
  p: ProductParams;
  cash: string;
  schedule?: Schedule;
  /** A path to start from (e.g. the checks already observed, then flat). Default: the first scenario. */
  start?: number[];
  title?: string;
}) {
  const n = Math.max(1, p.observations);
  const presets = useMemo(() => scenarios(p), [p]);
  const [perfs, setPerfs] = useState<number[]>(() => fit(start ?? presets[1]?.perfs ?? [], n));
  const [preset, setPreset] = useState<string>(start ? '' : (presets[1]?.id ?? ''));
  // How many checks have been revealed: n when idle (the whole result), counting up while playing.
  const [shown, setShown] = useState(n);
  const [playing, setPlaying] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    setPerfs((x) => fit(x, n));
    setShown(n);
  }, [n]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const played = useMemo(() => playOut({ ...p, observations: n }, perfs), [p, n, perfs]);
  const lines = linesOf(p);
  const { lo, hi } = bandRange(lines, perfs);
  const yMin = Math.min(lo, 20);
  const yMax = Math.max(hi, 140);
  const x = (k: number) => X0 + (k / n) * (X1 - X0);
  const y = (v: number) => Y0 - ((v - yMin) / (yMax - yMin)) * (Y0 - Y1);
  const toV = (py: number) => yMin + ((Y0 - py) / (Y0 - Y1)) * (yMax - yMin);
  const end = played.calledAt ?? n;
  const visible = Math.min(shown, end);

  const set = (i: number, v: number) => {
    stop();
    setPreset('');
    setPerfs((xs) => xs.map((old, j) => (j === i ? Math.round(Math.max(10, Math.min(200, v))) : old)));
    setShown(n);
  };
  const stop = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    setPlaying(false);
  };
  const play = () => {
    stop();
    if (reduced()) {
      setShown(n);
      return;
    }
    setPlaying(true);
    setShown(0);
    const tick = (k: number) => {
      setShown(k);
      if (k >= Math.min(n, end)) {
        timer.current = setTimeout(() => setPlaying(false), STEP_MS / 2);
        return;
      }
      timer.current = setTimeout(() => tick(k + 1), STEP_MS);
    };
    timer.current = setTimeout(() => tick(1), 300);
  };

  // Dragging a knob on the chart.
  const svg = useRef<SVGSVGElement>(null);
  const drag = useRef<number | null>(null);
  const move = (e: RPointerEvent) => {
    if (drag.current === null || !svg.current) return;
    const r = svg.current.getBoundingClientRect();
    set(drag.current, toV(((e.clientY - r.top) / r.height) * H));
  };

  const events = played.events.filter((e) => e.k <= visible);
  const done = visible >= end;
  const soFar = events.reduce((a, e) => a + e.amount, 0);
  const total = done ? played.total : soFar;
  const goodLine =
    lines.find((l) => l.key === 'coupon') ??
    lines.find((l) => l.key === 'autocall') ??
    lines.find((l) => l.key === 'start');
  const lineColor = { knockIn: 'var(--risk)', coupon: 'var(--good)', autocall: 'var(--good)', start: 'var(--ink)' };
  const path = [`M${x(0)},${y(100)}`, ...perfs.slice(0, visible).map((v, i) => `L${x(i + 1)},${y(v)}`)].join(' ');
  const ghost = [`M${x(0)},${y(100)}`, ...perfs.map((v, i) => `L${x(i + 1)},${y(v)}`)].join(' ');

  return (
    <section className="card play" aria-labelledby="play-h" data-play>
      <div className="play-head">
        <div>
          <h2 id="play-h">{title}</h2>
          <p className="small muted">
            Pick a scenario or drag each check up and down, then press Play. Worked out with the note's own payoff
            rules; it assumes the issuer pays on time.
          </p>
        </div>
        <div className="play-ctl">
          <button type="button" className="btn primary" onClick={playing ? stop : play} data-play-button>
            {playing ? <Pause className="i" /> : <Play className="i" />}
            {playing ? 'Pause' : 'Play'}
          </button>
        </div>
      </div>
      <div className="presets" role="group" aria-label="Scenarios">
        {presets.map((s) => (
          <button
            key={s.id}
            type="button"
            className={`chip${preset === s.id ? ' on' : ''}`}
            aria-pressed={preset === s.id}
            onClick={() => {
              stop();
              setPreset(s.id);
              setPerfs(fit(s.perfs, n));
              setShown(n);
            }}
          >
            {s.label}
          </button>
        ))}
        {start && (
          <button
            type="button"
            className={`chip${preset === '' ? ' on' : ''}`}
            onClick={() => {
              stop();
              setPreset('');
              setPerfs(fit(start, n));
              setShown(n);
            }}
          >
            <RotateCcw className="i" />
            So far
          </button>
        )}
      </div>
      <div className="play-grid">
        <div className="play-chart">
          <svg
            ref={svg}
            viewBox={`0 0 ${W} ${H}`}
            className="play-svg"
            role="img"
            aria-label={`The weakest level at each check: ${perfs.map((v, i) => `check ${i + 1} ${v}%`).join(', ')}`}
            onPointerMove={move}
            onPointerUp={() => (drag.current = null)}
            onPointerCancel={() => (drag.current = null)}
          >
            {p.knockInBarrierPct && p.productType !== 'ppn' && (
              <rect
                x={X0}
                y={y(p.knockInBarrierPct)}
                width={X1 - X0}
                height={Y0 - y(p.knockInBarrierPct)}
                className="pz-loss"
              />
            )}
            {goodLine && (
              <rect x={X0} y={Y1} width={X1 - X0} height={Math.max(0, y(goodLine.pct) - Y1)} className="pz-good" />
            )}
            {[20, 40, 60, 80, 100, 120, 140, 160, 180]
              .filter((v) => v >= yMin && v <= yMax)
              .map((v) => (
                <g key={v} className="pg">
                  <line x1={X0} x2={X1} y1={y(v)} y2={y(v)} />
                  <text x={X0 - 8} y={y(v) + 4} textAnchor="end">
                    {v}%
                  </text>
                </g>
              ))}
            {Array.from({ length: n + 1 }, (_, k) => (
              <text
                key={k}
                className="pax"
                x={x(k)}
                y={Y0 + 20}
                textAnchor={k === 0 ? 'start' : k === n ? 'end' : 'middle'}
              >
                {k === 0 ? 'Start' : n > 6 ? k : `Check ${k}`}
              </text>
            ))}
            {lines.map((l) => (
              <g key={l.key} className="pl">
                <line x1={X0} x2={X1} y1={y(l.pct)} y2={y(l.pct)} style={{ stroke: lineColor[l.key] }} />
                <text x={X1 - 4} y={y(l.pct) - 6} textAnchor="end" style={{ fill: lineColor[l.key] }}>
                  {l.label} {l.pct}%
                </text>
              </g>
            ))}
            <path d={ghost} className="pp ghost" />
            <path d={path} className="pp" />
            {perfs.map((v, i) => {
              const k = i + 1;
              const after = k > end;
              const ev =
                played.events.find(
                  (e) => e.k === k && e.kind !== 'par' && e.kind !== 'loss' && e.kind !== 'protected',
                ) ?? played.events.find((e) => e.k === k);
              return (
                <g
                  key={k}
                  className={`pk${after ? ' after' : ''} k-${ev?.kind ?? 'none'}`}
                  onPointerDown={(e) => {
                    drag.current = i;
                    (e.currentTarget.ownerSVGElement as SVGSVGElement).setPointerCapture(e.pointerId);
                    e.preventDefault();
                  }}
                >
                  <circle cx={x(k)} cy={y(v)} r={20} className="hit" />
                  <circle cx={x(k)} cy={y(v)} r={8} className="dot" />
                  <text x={x(k)} y={y(v) - 14} textAnchor="middle">
                    {v}%
                  </text>
                </g>
              );
            })}
            {playing && <line className="pcur" x1={x(visible)} x2={x(visible)} y1={Y1} y2={Y0} />}
          </svg>
          <div className="play-sliders">
            {perfs.map((v, i) => (
              <label key={i}>
                <span>
                  Check {i + 1}
                  {checkWhen(p, i + 1, schedule).startsWith('month') ? ` · ${checkWhen(p, i + 1, schedule)}` : ''}
                  <b className="num">{v}%</b>
                </span>
                <input
                  type="range"
                  min={10}
                  max={200}
                  value={v}
                  onChange={(e) => set(i, Number(e.target.value))}
                  aria-label={`Check ${i + 1}: weakest level, % of the starting price`}
                />
              </label>
            ))}
          </div>
        </div>
        <div className="play-out">
          <ol className="events" aria-live="polite">
            {played.events.map((e, i) => (
              <EventRow key={`${e.k}-${e.kind}-${i}`} e={e} pending={e.k > visible} />
            ))}
          </ol>
          <div
            className={`outcome${done && played.how === 'loss' ? ' loss' : ''}${done && played.how === 'call' ? ' call' : ''}`}
          >
            <span className="small muted">What 100 {cash} becomes</span>
            <strong className="num">{total.toFixed(2)}</strong>
            <span className="small">
              {!done
                ? 'So far. Keep watching.'
                : played.how === 'call'
                  ? `Repaid early at check ${played.calledAt}, ${played.coupons > 0 ? `with ${played.coupons.toFixed(2)} in coupons` : 'with the payout'}.`
                  : played.how === 'par'
                    ? `Held to the end: 100 back${played.coupons > 0 ? ` plus ${played.coupons.toFixed(2)} in coupons` : ''}.`
                    : played.how === 'protected'
                      ? 'The protected amount, plus any share of the rise.'
                      : `The money-back line broke, so you share the fall${played.coupons > 0 ? `, softened by ${played.coupons.toFixed(2)} in coupons` : ''}.`}
            </span>
            {done && played.how === 'call' && !playing && <span className="cheer" aria-hidden="true" />}
          </div>
        </div>
      </div>
    </section>
  );
}

function EventRow({ e, pending }: { e: PlayEvent; pending: boolean }) {
  const icon = { coupon: '✓', none: '–', call: '↑', par: '✓', loss: '!', protected: '✓' }[e.kind];
  return (
    <li className={`ev ev-${e.kind}${pending ? ' pending' : ' pop'}`}>
      <span className="ic" aria-hidden="true">
        {icon}
      </span>
      <span>{e.text}</span>
      <span className="amt num">
        {e.amount ? (e.kind === 'loss' ? e.amount.toFixed(2) : `+${e.amount.toFixed(2)}`) : '0.00'}
      </span>
    </li>
  );
}

/** A path of exactly n checks: cut, or padded with its last level. */
function fit(xs: number[], n: number): number[] {
  const base = xs.length ? xs : [100];
  return Array.from({ length: n }, (_, i) => Math.round(base[Math.min(i, base.length - 1)]));
}
