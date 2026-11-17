/**
 * The underlyings as a moving ticker: a selection of well-known symbols with their logos, in two rows that drift
 * opposite ways. Each row is rendered several times end to end so the loop has no seam (the copies are hidden from
 * assistive tech). Hover pauses it; with reduced motion the rows stand still and scroll by hand. The full list is on
 * /support.
 */
import { FEED_CATALOGUE } from '../../packages/core/src/products/params';
import { TICKER_ICONS } from './ticker-icons';

/**
 * A selection, not the whole catalogue: well-known names from each class, mixed so every stretch of the ticker shows
 * stocks, crypto, currencies and metals. Only symbols that are in the catalogue and have a logo are shown.
 */
const PICK = [
  ['TSLA', 'BTC', 'EUR', 'NVDA', 'ETH', 'XAU', 'AAPL', 'SOL', 'JPY', 'META', 'LINK', 'GBP', 'GOOGL', 'LTC', 'CHF'],
  ['COIN', 'DOGE', 'XAG', 'AMD', 'BNB', 'CNY', 'PLTR', 'AVAX', 'AUD', 'INTC', 'UNI', 'SGD', 'DELL', 'AAVE', 'CAD'],
];
const known = new Set<string>(FEED_CATALOGUE.map((f) => f.symbol));
const rows = PICK.map((r) => r.filter((x) => known.has(x) && TICKER_ICONS.has(x)).map((x) => ({ s: x })));
type Item = { s: string };

function Row({ items, reverse }: { items: Item[]; reverse?: boolean }) {
  const run = (hidden: boolean) => (
    <span className="tk-run" aria-hidden={hidden || undefined}>
      {items.map((x) => (
        <span key={x.s} className="tk-sym ic">
          <img src={`/ticker/${x.s}.svg`} alt="" width={30} height={30} loading="lazy" decoding="async" />
          {x.s}
        </span>
      ))}
    </span>
  );
  return (
    <div className={`tk-row${reverse ? ' rev' : ''}`}>
      {run(false)}
      {run(true)}
      {run(true)}
      {run(true)}
    </div>
  );
}

export default function Ticker() {
  return (
    <div className="ticker" data-reveal>
      <div className="wrap tk-head">
        <span>Stocks, crypto, currencies, gold.</span>
        <a href="/support#underlyings">All of them →</a>
      </div>
      <div className="tk-rows">
        <Row items={rows[0]} />
        <Row items={rows[1]} reverse />
      </div>
    </div>
  );
}
