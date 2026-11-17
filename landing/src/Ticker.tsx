/**
 * The underlyings as a moving ticker: every symbol in the feed catalogue, in two rows that drift opposite ways.
 * Each row is rendered twice end to end so the loop has no seam (the copy is hidden from assistive tech). Hover
 * pauses it; with reduced motion the rows stand still and scroll by hand.
 */
import { FEED_CATALOGUE, POPULAR_UNDERLYINGS } from '../../packages/core/src/products/params';

const all = FEED_CATALOGUE.map((f) => ({ s: f.symbol as string, c: f.assetClass as string }));
const rows = [all.filter((_, i) => i % 2 === 0), all.filter((_, i) => i % 2 === 1)];
const popular = new Set<string>(POPULAR_UNDERLYINGS);

function Row({ items, reverse }: { items: typeof all; reverse?: boolean }) {
  const run = (hidden: boolean) => (
    <span className="tk-run" aria-hidden={hidden || undefined}>
      {items.map((x) => (
        <span key={x.s} className={`tk-sym${popular.has(x.s) ? ' hot' : ''}`}>
          {x.s}
        </span>
      ))}
    </span>
  );
  return (
    <div className={`tk-row${reverse ? ' rev' : ''}`}>
      {run(false)}
      {run(true)}
    </div>
  );
}

export default function Ticker() {
  return (
    <div className="ticker" data-reveal>
      <div className="wrap tk-head">
        <b>{FEED_CATALOGUE.length}</b>
        <span>underlyings. Stocks, crypto, currencies, gold.</span>
        <a href="/support#underlyings">All of them →</a>
      </div>
      <div className="tk-rows">
        <Row items={rows[0]} />
        <Row items={rows[1]} reverse />
      </div>
    </div>
  );
}
