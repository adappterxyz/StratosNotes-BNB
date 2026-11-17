/**
 * A band of figures under the hero. The first four describe the product and come from packages/core; the rest are
 * live, counted from /api/notes, and appear only once the API has answered with at least one note.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CHAIN_TOKENS,
  FEED_CATALOGUE,
  NOTE_CHAINS,
  collateralChoices,
  remoteCollateralChains,
} from '../../packages/core/src/products/params';

type NoteRow = {
  view?: {
    reports?: { cre?: number };
    economics?: { periods?: Array<{ status?: string }> };
  };
};

const collateralTokens = NOTE_CHAINS.reduce(
  (n, c) =>
    n +
    Object.values(CHAIN_TOKENS[c]).filter((t) => collateralChoices({ chain: c }).some((x) => x.token === t.token))
      .length,
  0,
);
const routes = NOTE_CHAINS.reduce((n, c) => n + remoteCollateralChains(c).length, 0);

const STATIC: Array<[number, string]> = [
  [NOTE_CHAINS.length, 'chains a note can run on'],
  [FEED_CATALOGUE.length, 'Chainlink prices to write a note on'],
  [collateralTokens, 'tokens accepted as collateral'],
  [routes, 'cross-chain collateral routes, all live'],
];

/** Counts up to `to` once, when first seen; shows the final value at once with reduced motion or no JS. */
function Count({ to, run }: { to: number; run: boolean }) {
  const [v, setV] = useState(to);
  const done = useRef(false);
  useEffect(() => {
    if (!run || done.current) return;
    done.current = true;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const t0 = performance.now(),
      ms = 900;
    let f = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) f = requestAnimationFrame(tick);
    };
    setV(0);
    f = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(f);
  }, [run, to]);
  return <>{v.toLocaleString('en-US')}</>;
}

export default function Numbers() {
  const ref = useRef<HTMLDivElement>(null);
  const [seen, setSeen] = useState(false);
  const [live, setLive] = useState<Array<[number, string]>>([]);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    let off = false;
    (async () => {
      const rows: NoteRow[] = [];
      let next: string | undefined;
      // A few pages at most: this is a headline figure, not a report.
      for (let i = 0; i < 5; i++) {
        const r = await fetch(`/api/notes${next ? `?cursor=${encodeURIComponent(next)}` : ''}`);
        if (!r.ok) break;
        const d = (await r.json()) as { notes?: NoteRow[]; next?: string | null };
        rows.push(...(d.notes ?? []));
        if (!d.next) break;
        next = d.next;
      }
      if (off || !rows.length) return;
      const coupons = rows.reduce(
        (n, x) => n + (x.view?.economics?.periods ?? []).filter((p) => p.status === 'paid').length,
        0,
      );
      const steps = rows.reduce((n, x) => n + (x.view?.reports?.cre ?? 0), 0);
      const out: Array<[number, string]> = [[rows.length, rows.length === 1 ? 'note issued' : 'notes issued']];
      if (coupons) out.push([coupons, coupons === 1 ? 'payment made to holders' : 'payments made to holders']);
      if (steps) out.push([steps, 'steps run by Chainlink CRE']);
      setLive(out);
    })().catch(() => undefined);
    return () => {
      off = true;
    };
  }, []);

  return (
    <section id="numbers" className="numbers" aria-label="notes.markets in numbers">
      <div className="wrap" ref={ref}>
        <dl className="num-row">
          {STATIC.map(([n, t]) => (
            <div key={t}>
              <dd>
                <Count to={n} run={seen} />
              </dd>
              <dt>{t}</dt>
            </div>
          ))}
        </dl>
        {live.length > 0 && (
          <dl className="num-row live">
            <div className="num-live-k">
              <span className="badge">
                <i />
                Live on testnet
              </span>
            </div>
            {live.map(([n, t]) => (
              <div key={t}>
                <dd>
                  <Count to={n} run={seen} />
                </dd>
                <dt>{t}</dt>
              </div>
            ))}
          </dl>
        )}
      </div>
    </section>
  );
}
