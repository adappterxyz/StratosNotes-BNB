import { useRef } from 'react';

import type { Side } from './Carousel';

export type { Side };

const SIDES: Array<{ id: Side; label: string }> = [
  { id: 'Investors', label: 'For investors' },
  { id: 'Issuers', label: 'For issuers' },
];

/**
 * Investor / issuer pill tabs. One choice drives the whole page (hero copy and buttons, the note cards, the section
 * order), so the tabs appear in the hero and again above the note cards: `idPrefix` keeps their ids apart.
 */
export function SideTabs({
  side,
  onChange,
  idPrefix,
  controls,
}: {
  side: Side;
  onChange: (s: Side) => void;
  idPrefix: string;
  controls?: string;
}) {
  const refs = useRef<Array<HTMLButtonElement | null>>([]);
  const move = (i: number) => {
    const n = (i + SIDES.length) % SIDES.length;
    onChange(SIDES[n].id);
    refs.current[n]?.focus();
  };
  return (
    <div className="side-tabs" role="tablist" aria-label="Who you are">
      {SIDES.map((t, i) => (
        <button
          key={t.id}
          ref={(el) => {
            refs.current[i] = el;
          }}
          id={`${idPrefix}-${t.id}`}
          type="button"
          role="tab"
          aria-selected={side === t.id}
          aria-controls={controls}
          tabIndex={side === t.id ? 0 : -1}
          className={side === t.id ? 'on' : ''}
          onClick={() => onChange(t.id)}
          onKeyDown={(e) => {
            if (e.key === 'ArrowRight') {
              e.preventDefault();
              move(i + 1);
            } else if (e.key === 'ArrowLeft') {
              e.preventDefault();
              move(i - 1);
            } else if (e.key === 'Home') {
              e.preventDefault();
              move(0);
            } else if (e.key === 'End') {
              e.preventDefault();
              move(SIDES.length - 1);
            }
          }}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
