/**
 * The barrier bar: one band with the lines that decide a note (money-back, coupon, early repayment; for a protected
 * note its starting price), coloured by what happens in each zone, and a marker per underlying at its latest level
 * against its strike, the weakest highlighted. One plain sentence says where the weakest stands. Lines come from the
 * note's terms (lib/story.ts linesOf), so every product type draws only the lines it has.
 */
import type { ProductParams } from '@sn/core';
import { bandRange, barSentence, linesOf, zonesOf, type Mark, type ZoneTone } from '../lib/story';

const TONE_ORDER: ZoneTone[] = ['loss', 'safe', 'coupon', 'gain', 'call'];

export function BarrierBar({
  p,
  marks = [],
  say = true,
  past = false,
  legend = true,
  note,
}: {
  p: ProductParams;
  marks?: Mark[];
  /** The plain sentence above the band. */
  say?: boolean;
  /** The note has finished: the sentence is about its last check. */
  past?: boolean;
  legend?: boolean;
  /** Shown instead of the sentence when there are no markers (before the strike). */
  note?: string;
}) {
  const lines = linesOf(p);
  const { lo, hi } = bandRange(
    lines,
    marks.map((m) => m.pct),
  );
  const at = (v: number) => ((Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)) * 100;
  const zones = zonesOf(p, lo, hi);
  const sentence = say ? (barSentence(p, marks, past) ?? note ?? null) : null;
  // Markers alternate above and below the band when there are several, weakest on top.
  const ordered = [...marks].sort((a, b) => Number(b.worst) - Number(a.worst));
  const label = `${zones.map((z) => `${z.from}–${z.to}%: ${z.text}`).join('; ')}${marks.length ? `. Now: ${marks.map((m) => `${m.sym} ${m.pct.toFixed(1)}%`).join(', ')}` : ''}`;
  return (
    <div className="bb" data-barrier-bar>
      {sentence && <p className="bb-say">{sentence}</p>}
      <div className={`bb-track${marks.length > 1 ? ' two' : ''}`} role="img" aria-label={label}>
        <div className="bb-zones">
          {zones.map((z) => (
            <span key={z.from} className={`z-${z.tone}`} style={{ width: `${at(z.to) - at(z.from)}%` }} />
          ))}
        </div>
        {lines.map((l) => (
          <span key={l.key} className={`bb-line l-${l.key}`} style={{ left: `${at(l.pct)}%` }} />
        ))}
        {ordered.map((m, i) => (
          <div
            key={m.sym}
            className={`bb-mark${m.worst ? ' worst' : ''}${i % 2 ? ' below' : ''}`}
            style={{ left: `${at(m.pct)}%` }}
          >
            <span className="pin" />
            <span className="bb-chip num">
              {m.sym} {m.pct.toFixed(1)}%
            </span>
          </div>
        ))}
      </div>
      <div className="bb-scale num" aria-hidden="true">
        {lines.map((l) => (
          <span key={l.key} style={{ left: `${at(l.pct)}%` }}>
            {l.pct}%
          </span>
        ))}
      </div>
      {legend && (
        <div className="bb-legend">
          {[...zones]
            .sort((a, b) => TONE_ORDER.indexOf(a.tone) - TONE_ORDER.indexOf(b.tone))
            .map((z) => (
              <span key={z.from}>
                <i className={`z-${z.tone}`} />
                {legendRange(z, lo, hi)}: {z.text}
              </span>
            ))}
        </div>
      )}
    </div>
  );
}

function legendRange(z: { from: number; to: number }, lo: number, hi: number) {
  if (z.from <= lo) return `Below ${z.to}%`;
  if (z.to >= hi) return `Above ${z.from}%`;
  return `${z.from}–${z.to}%`;
}
