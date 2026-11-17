/**
 * /support: what notes.markets supports today, in tables. Everything here is read from packages/core (the same data
 * the app and the keeper use) and from the deployment records, so the page follows the product: a new chain, token or
 * cross-chain pair shows up on the next build without editing this file.
 */
import './notes.css';
import './support.css';
import { Wordmark } from './Wordmark';
import proof from './proof.json';
import rhXc from '../../deployments/crosschain/robinhood-testnet.json';
import baseXc from '../../deployments/crosschain/base-sepolia.json';
import bnbXc from '../../deployments/crosschain/bnb-testnet.json';
import {
  ASSET_CLASSES,
  CASH_FAUCETS,
  CHAIN_CASH,
  CHAIN_TOKENS,
  DEFAULT_HAIRCUT,
  FEED_CATALOGUE,
  FEED_CHAIN_LABELS,
  FEEDS,
  GAS_FAUCETS,
  MAX_COLLATERAL,
  MAX_GRACE_DAYS,
  MAX_OBSERVATIONS,
  MAX_UNDERLYINGS,
  NOTE_CHAINS,
  NOTE_CHAIN_IDS,
  NOTE_CHAIN_LABELS,
  NOTE_CHAIN_SHORT,
  POPULAR_UNDERLYINGS,
  PRODUCT_LABELS,
  RECEIPT_SUFFIX,
  STOCK_TOKEN_FAUCETS,
  UNPRICED_STOCKS,
  canDeliverNow,
  collateralChoices,
  deliverableToken,
  remoteCollateralChains,
  type ChainToken,
  type CollateralSymbol,
  type NoteChain,
  type ProductType,
} from '../../packages/core/src/products/params';

const APP_URL = '/app/';
const ISSUE_URL = '/app/issue';
const REPO_URL = 'https://github.com/adappterxyz/StratosNotes-Robinhood';
const STRATOS_URL = 'https://stratoslab.xyz';

type XcRecord = {
  home: { chain: string; gateway: string };
  remotes: Array<{ chain: string; vault: string }>;
};
const XC: Record<string, XcRecord> = {
  'robinhood-testnet': rhXc as XcRecord,
  'base-sepolia': baseXc as XcRecord,
  'bnb-testnet': bnbXc as XcRecord,
};
const DEPLOYED = Object.fromEntries(proof.deployments.map((d) => [d.key, d]));
const explorerOf = (c: NoteChain) => DEPLOYED[c]?.explorer ?? '';

const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;
function Addr({ chain, address }: { chain: NoteChain; address?: string }) {
  if (!address) return <span className="muted">not deployed</span>;
  return (
    <a className="mono addr" href={`${explorerOf(chain)}/address/${address}`} target="_blank" rel="noopener">
      {short(address)}
    </a>
  );
}
const Chips = ({ items, empty = 'None' }: { items: readonly string[]; empty?: string }) =>
  items.length ? (
    <span className="chips">
      {items.map((s) => (
        <code key={s}>{s}</code>
      ))}
    </span>
  ) : (
    <span className="muted">{empty}</span>
  );

/** The tokens a note on `chain` can pledge: in the note itself, or locked on `on`. */
const pledgeable = (chain: NoteChain, on?: NoteChain) =>
  collateralChoices(on ? { chain, collateralChain: on } : { chain })
    .map((c) => c.token)
    .filter((t): t is string => !!t);
/** What a physically settled note on `chain` delivers: [underlying, token]. */
const deliveries = (chain: NoteChain) =>
  Object.keys(FEEDS)
    .filter((s) => canDeliverNow({ chain }, s))
    .map((s) => [s, deliverableToken({ chain }, s)!.token] as const);

/** How a collateral token is priced, in plain words. */
function pricedBy(t: ChainToken): string {
  if (t.valuedAs === 'USD') return 'Counted at $1';
  if (t.b20) return `Chainlink ${t.token}/USD (per-token feed on Base)`;
  if (t.bstock) return `Chainlink ${t.bstock.delivers}/USD × the token's multiplier`;
  const f = t.valuedAs ? FEEDS[t.valuedAs as keyof typeof FEEDS] : undefined;
  return f ? `Chainlink ${t.valuedAs}/USD (${FEED_CHAIN_LABELS[f.feedChain] ?? f.feedChain})` : 'No price feed';
}
const kindOf = (t: ChainToken) =>
  t.valuedAs === 'USD'
    ? 'Stablecoin'
    : t.valuedAs === 'ETH'
      ? 'Wrapped ETH'
      : t.b20
        ? 'Coinbase B20 stock, test copy'
        : t.bstock
          ? 'Binance bStock, test copy'
          : 'Robinhood stock token';
const isOurs = (t: ChainToken) => t.issuer.startsWith('notes.markets');

const CASH_NOTES: Record<NoteChain, string> = {
  'robinhood-testnet': 'Paxos can pause it or freeze an address.',
  'base-sepolia': 'Circle can pause it or blacklist an address.',
  'bnb-testnet':
    'Our own test dollar: BNB Chain testnet has no public stablecoin faucet. It has no value and stands in for a real stablecoin.',
};

const PRODUCT_NOTES: Record<ProductType, string> = {
  fcn: 'A fixed coupon on every observation. Can end early on an autocall. Principal is at risk below the knock-in barrier.',
  'reverse-convertible':
    'A fixed coupon and no early exit. Below the barrier at maturity, holders get the underlying or its value instead of par.',
  phoenix:
    'A coupon whenever the underlying holds its coupon barrier, with memory of missed ones. Can autocall. Knock-in at maturity.',
  snowball: 'The coupon accrues each period and is paid in full on autocall, or at maturity if above the strike.',
  ppn: 'A set share of principal back at maturity whatever the underlying does, plus a share of any rise.',
};

const links: Array<[string, string]> = [
  ['#chains', 'Chains'],
  ['#cash', 'Stablecoins'],
  ['#collateral', 'Collateral'],
  ['#underlyings', 'Underlyings'],
  ['#notes', 'Note types'],
  ['#contracts', 'Contracts'],
];

export default function Support() {
  const updated = new Date(proof.generatedAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const routes = NOTE_CHAINS.reduce((n, c) => n + remoteCollateralChains(c).length, 0);
  const collateralTokens = NOTE_CHAINS.flatMap((c) =>
    Object.values(CHAIN_TOKENS[c])
      .filter((t) => t.valuedAs && pledgeable(c).includes(t.token))
      .map((t) => ({ chain: c, t })),
  );

  return (
    <div className="sn-root sup">
      <header className="nav scrolled">
        <div className="nav-inner">
          <a className="brand" href="/" aria-label="notes.markets home">
            <Wordmark />
          </a>
          <nav className="nav-links" aria-label="On this page">
            {links.map(([h, t]) => (
              <a key={h} href={h}>
                {t}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <a href={APP_URL} className="btn btn-primary">
              Launch app
            </a>
          </div>
        </div>
      </header>

      <main id="top">
        <section className="sup-hero">
          <div className="wrap">
            <span className="badge">
              <i />
              Testnet · as of {updated}
            </span>
            <h1>What notes.markets supports</h1>
            <p className="sub">
              Where a note can run, what it settles in, what it can be written on and what can back it. Every token here
              is a test token with no value.
            </p>
            <dl className="sup-stats">
              <div>
                <dt>Note chains</dt>
                <dd>{NOTE_CHAINS.length}</dd>
              </div>
              <div>
                <dt>Underlyings</dt>
                <dd>{FEED_CATALOGUE.length}</dd>
              </div>
              <div>
                <dt>Collateral tokens</dt>
                <dd>{collateralTokens.length}</dd>
              </div>
              <div>
                <dt>Cross-chain collateral routes</dt>
                <dd>{routes}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section id="chains">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Overview</span>
              <h2>One row per chain a note can run on.</h2>
              <p>
                A note is issued, subscribed, observed and paid on one chain. Its collateral sits in the note, or stays
                locked on another chain and is carried by Chainlink CCIP.
              </p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Notes run on</th>
                    <th scope="col">Settles in</th>
                    <th scope="col">Collateral held in the note</th>
                    <th scope="col">Collateral locked on another chain</th>
                    <th scope="col">Delivered at maturity</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTE_CHAINS.map((c) => (
                    <tr key={c}>
                      <th scope="row">
                        {NOTE_CHAIN_LABELS[c]}
                        <small>Chain ID {NOTE_CHAIN_IDS[c]}</small>
                      </th>
                      <td>
                        <Chips items={[CHAIN_CASH[c].token]} />
                        <small>{CHAIN_TOKENS[c][CHAIN_CASH[c].token]?.issuer}</small>
                      </td>
                      <td>
                        <Chips items={pledgeable(c)} />
                      </td>
                      <td>
                        {remoteCollateralChains(c).map((a) => (
                          <div key={a} className="sup-group">
                            <small>On {NOTE_CHAIN_SHORT[a]}</small>
                            <Chips items={pledgeable(c, a)} />
                          </div>
                        ))}
                      </td>
                      <td>
                        <Chips items={deliveries(c).map(([s, t]) => (s === t ? s : `${s} as ${t}`))} />
                        <small>Any other underlying settles in {CHAIN_CASH[c].token}.</small>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sup-foot">
              Underlyings are the same on every chain: all {FEED_CATALOGUE.length} Chainlink prices below. A suffix
              names where a token is locked: <code>.{RECEIPT_SUFFIX['robinhood-testnet']}</code> Robinhood Chain,{' '}
              <code>.{RECEIPT_SUFFIX['base-sepolia']}</code> Base, <code>.{RECEIPT_SUFFIX['bnb-testnet']}</code> BNB
              Chain.
            </p>
          </div>
        </section>

        <section id="cash" className="sup-alt">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Stablecoins</span>
              <h2>Each chain settles in one dollar token.</h2>
              <p>Subscriptions, coupons and redemptions on a chain are all paid in that chain's token.</p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">Chain</th>
                    <th scope="col">Issued by</th>
                    <th scope="col">Contract</th>
                    <th scope="col">Where to get it</th>
                    <th scope="col">Good to know</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTE_CHAINS.map((c) => {
                    const t = CHAIN_TOKENS[c][CHAIN_CASH[c].token];
                    return (
                      <tr key={c}>
                        <th scope="row">
                          <code>{t.token}</code>
                          <small>
                            {t.name} · {t.decimals} decimals
                          </small>
                        </th>
                        <td>{NOTE_CHAIN_LABELS[c]}</td>
                        <td>{t.issuer}</td>
                        <td>
                          <Addr chain={c} address={t.address} />
                        </td>
                        <td>
                          {CASH_FAUCETS[c] ? (
                            <a href={CASH_FAUCETS[c]} target="_blank" rel="noopener">
                              {isOurs(t) ? 'notes.markets faucet' : `${t.issuer} faucet`}
                            </a>
                          ) : (
                            <span className="muted">No faucet</span>
                          )}
                          <small>
                            Gas:{' '}
                            {GAS_FAUCETS[c].map((u, i) => (
                              <span key={u}>
                                {i > 0 && ', '}
                                <a href={u} target="_blank" rel="noopener">
                                  {new URL(u).hostname.replace(/^www\./, '')}
                                </a>
                              </span>
                            ))}
                          </small>
                        </td>
                        <td>{CASH_NOTES[c]}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sup-foot">
              A dollar token locked on another chain can also back a note as collateral (for example{' '}
              <code>USDC.base</code> behind a Robinhood Chain note), but a note is always paid in its own chain's token.
            </p>
          </div>
        </section>

        <section id="collateral">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Collateral</span>
              <h2>What an issuer can lock behind a note.</h2>
              <p>
                Up to {MAX_COLLATERAL} tokens per note. Each counts toward the note's collateral ratio at a share of its
                value, which the issuer can set lower than the default shown.
              </p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Token</th>
                    <th scope="col">Lives on</th>
                    <th scope="col">What it is</th>
                    <th scope="col">Priced by</th>
                    <th scope="col" className="r">
                      Counts at
                    </th>
                    <th scope="col">Backs notes on other chains as</th>
                    <th scope="col">Contract</th>
                  </tr>
                </thead>
                <tbody>
                  {collateralTokens.map(({ chain, t }) => (
                    <tr key={`${chain}:${t.token}`}>
                      <th scope="row">
                        <code>{t.token}</code>
                        <small>{t.name}</small>
                      </th>
                      <td>{NOTE_CHAIN_SHORT[chain]}</td>
                      <td>{kindOf(t)}</td>
                      <td>{pricedBy(t)}</td>
                      <td className="r num">{DEFAULT_HAIRCUT[t.valuedAs as CollateralSymbol]}%</td>
                      <td>
                        <code>
                          {t.token}.{RECEIPT_SUFFIX[chain]}
                        </code>
                      </td>
                      <td>
                        <Addr chain={chain} address={t.address} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="sup-notes">
              <li>
                <b>Test copies.</b> Coinbase's B20 stocks exist only on Base mainnet and Binance's bStocks only on BNB
                Chain mainnet. On testnet notes.markets runs its own copies with the same symbols, decimals and
                multipliers, so moving to the real tokens is a change of address. Get them from the faucets on{' '}
                <a href={STOCK_TOKEN_FAUCETS['base-sepolia']} target="_blank" rel="noopener">
                  Base Sepolia
                </a>{' '}
                and{' '}
                <a href={STOCK_TOKEN_FAUCETS['bnb-testnet']} target="_blank" rel="noopener">
                  BNB Chain testnet
                </a>
                . Robinhood's stock tokens come from{' '}
                <a href={STOCK_TOKEN_FAUCETS['robinhood-testnet']} target="_blank" rel="noopener">
                  Robinhood's own faucet
                </a>
                .
              </li>
              <li>
                <b>Not accepted.</b> {UNPRICED_STOCKS.join(', ')} on Robinhood Chain has no Chainlink price the keeper
                can read, so it cannot be pledged or delivered. There is no wrapped ETH or BTC collateral on BNB Chain
                testnet.
              </li>
              <li>
                <b>If the issuer misses a payment</b> and does not cure it within the grace period (0 to{' '}
                {MAX_GRACE_DAYS} days, set per note), the note defaults and the collateral goes to holders, up to what
                they are owed or in full, as the note's terms say.
              </li>
            </ul>

            <h3 className="sup-h3">Cross-chain routes</h3>
            <p className="sup-lead">
              Every pair of chains is wired in both directions. The token stays in a vault on its own chain; Chainlink
              CCIP tells the note about the lock and carries the release back. Each message takes about 20 minutes.
            </p>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Note runs on</th>
                    {NOTE_CHAINS.map((a) => (
                      <th key={a} scope="col">
                        Collateral on {NOTE_CHAIN_SHORT[a]}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {NOTE_CHAINS.map((home) => (
                    <tr key={home}>
                      <th scope="row">
                        {NOTE_CHAIN_SHORT[home]}
                        <small>
                          Gateway <Addr chain={home} address={XC[home]?.home.gateway} />
                        </small>
                      </th>
                      {NOTE_CHAINS.map((asset) => {
                        const vault = XC[home]?.remotes.find((r) => r.chain === asset)?.vault;
                        return (
                          <td key={asset} data-h={`Collateral on ${NOTE_CHAIN_SHORT[asset]}`}>
                            {home === asset ? (
                              <>
                                <span className="tag ok">In the note</span>
                                <small>{pledgeable(home).length} tokens, no message needed</small>
                              </>
                            ) : (
                              <>
                                <span className={`tag${vault ? ' ok' : ''}`}>
                                  {vault ? 'Live via CCIP' : 'Not wired'}
                                </span>
                                <small>
                                  {pledgeable(home, asset).length} tokens
                                  {vault && (
                                    <>
                                      {' '}
                                      · vault <Addr chain={asset} address={vault} />
                                    </>
                                  )}
                                </small>
                              </>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        <section id="underlyings" className="sup-alt">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Underlyings</span>
              <h2>{FEED_CATALOGUE.length} Chainlink prices a note can be written on.</h2>
              <p>
                The same list on every chain. A note can follow one underlying or the worst of up to {MAX_UNDERLYINGS},
                with up to {MAX_OBSERVATIONS} observation dates. Most often used: {POPULAR_UNDERLYINGS.join(', ')}.
              </p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Class</th>
                    <th scope="col" className="r">
                      Count
                    </th>
                    <th scope="col">Price read from</th>
                    <th scope="col">Symbols</th>
                  </tr>
                </thead>
                <tbody>
                  {ASSET_CLASSES.map((cls) => {
                    const feeds = FEED_CATALOGUE.filter((f) => f.assetClass === cls);
                    const sources = [...new Set(feeds.map((f) => FEED_CHAIN_LABELS[f.feedChain] ?? f.feedChain))];
                    return (
                      <tr key={cls}>
                        <th scope="row">{cls}</th>
                        <td className="r num">{feeds.length}</td>
                        <td>Chainlink on {sources.join(' and ')}</td>
                        <td>
                          <Chips items={feeds.map((f) => f.symbol)} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="sup-foot">
              Stock, forex and commodity prices follow market hours. Being an underlying is separate from being
              collateral: a note on SOL or EUR/USD is backed by one of the collateral tokens above and settles in cash.
            </p>
          </div>
        </section>

        <section id="notes">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Note types</span>
              <h2>Five payoffs, on any chain and any underlying.</h2>
              <p>
                Issuers can also edit a payoff step by step: a stepped autocall level, a servicing fee, a different
                default rule.
              </p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Note</th>
                    <th scope="col">How it pays</th>
                  </tr>
                </thead>
                <tbody>
                  {(Object.keys(PRODUCT_LABELS) as ProductType[]).map((p) => (
                    <tr key={p}>
                      <th scope="row">{PRODUCT_LABELS[p]}</th>
                      <td>{PRODUCT_NOTES[p]}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sup-foot">
              Settlement at maturity is in cash, or in the underlying's token where the chain has one (the last column
              of the first table). There is no secondary market: units can be transferred to another verified address.
            </p>
          </div>
        </section>

        <section id="contracts" className="sup-alt">
          <div className="wrap">
            <div className="section-head">
              <span className="eyebrow">Contracts</span>
              <h2>Deployed and running.</h2>
              <p>
                The same engine on each chain. Chainlink CRE reads the prices and runs every observation and payment
                step. The contracts are not audited.
              </p>
            </div>
            <div className="sup-table">
              <table>
                <thead>
                  <tr>
                    <th scope="col">Chain</th>
                    <th scope="col">Note engine</th>
                    <th scope="col">Cross-chain gateway</th>
                    <th scope="col">Explorer</th>
                  </tr>
                </thead>
                <tbody>
                  {NOTE_CHAINS.map((c) => (
                    <tr key={c}>
                      <th scope="row">
                        {NOTE_CHAIN_LABELS[c]}
                        <small>Chain ID {NOTE_CHAIN_IDS[c]}</small>
                      </th>
                      <td>
                        <Addr chain={c} address={DEPLOYED[c]?.engine} />
                      </td>
                      <td>
                        <Addr chain={c} address={XC[c]?.home.gateway} />
                      </td>
                      <td>
                        <a href={explorerOf(c)} target="_blank" rel="noopener">
                          {explorerOf(c).replace('https://', '')}
                        </a>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="hero-cta sup-cta">
              <a href={APP_URL} className="btn btn-primary btn-lg">
                Browse live notes
              </a>
              <a href={ISSUE_URL} className="btn btn-ghost btn-lg">
                Issue a note
              </a>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-inner">
          <Wordmark dark />
          <div className="foot-links">
            <a href="/">Home</a>
            <a href={APP_URL}>App</a>
            <a href={REPO_URL} target="_blank" rel="noopener">
              GitHub
            </a>
            <a href={STRATOS_URL} target="_blank" rel="noopener">
              stratoslab.xyz
            </a>
          </div>
          <small className="disclaimer">
            notes.markets is software running on test networks: notes here use test tokens with no value. Nothing on
            this page is an offer to sell, a solicitation to buy, or a recommendation of any security. The contracts are
            not audited. Robinhood, Coinbase, Base, Binance, BNB Chain, Paxos, Circle and Chainlink are trademarks of
            their owners; notes.markets is not affiliated with or endorsed by them.
          </small>
        </div>
      </footer>
    </div>
  );
}
