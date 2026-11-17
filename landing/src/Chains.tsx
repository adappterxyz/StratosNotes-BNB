/**
 * The chains section: where notes run, and how collateral on one chain backs a note on another.
 *  - ChainFlow: an animated four-step diagram of cross-chain collateral (lock, message, count, release) for one
 *    example route per collateral chain. It advances on its own while on screen; hover, focus or a click on a step
 *    holds it. With reduced motion it never advances by itself and nothing travels.
 *  - A condensed version of /support's first table, read from packages/core like the page itself.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CHAIN_CASH,
  CHAIN_TOKENS,
  NOTE_CHAINS,
  NOTE_CHAIN_SHORT,
  REMOTE_COLLATERAL,
  collateralChoices,
  remoteCollateralChains,
  type CollateralSymbol,
  type NoteChain,
} from '../../packages/core/src/products/params';

/** One example per collateral chain: [note chain, collateral chain, collateral symbol]. */
const ROUTES: Array<{ home: NoteChain; asset: NoteChain; symbol: CollateralSymbol }> = [
  { home: 'base-sepolia', asset: 'robinhood-testnet', symbol: 'TSLA' },
  { home: 'bnb-testnet', asset: 'base-sepolia', symbol: 'USD' },
  { home: 'robinhood-testnet', asset: 'bnb-testnet', symbol: 'TSLAB' },
];
const STEP_MS = 3200;

function prefersReducedMotion() {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

function ChainFlow() {
  const [route, setRoute] = useState(0);
  const [step, setStep] = useState(0);
  const [held, setHeld] = useState(false);
  const [seen, setSeen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [reduced] = useState(prefersReducedMotion);

  // Advance only while the diagram is on screen.
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setSeen(e.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (reduced || held || !seen) return;
    const t = window.setTimeout(() => setStep((s) => (s + 1) % 4), STEP_MS);
    return () => clearTimeout(t);
  }, [step, held, seen, reduced, route]);

  const r = ROUTES[route];
  const remote = REMOTE_COLLATERAL[r.home][r.asset][r.symbol]!;
  const token = remote.locked.token;
  const receipt = remote.token;
  const on = NOTE_CHAIN_SHORT[r.asset];
  const home = NOTE_CHAIN_SHORT[r.home];

  const steps: Array<[string, string]> = [
    ['Lock', `The issuer locks ${token} in a vault on ${on}. It never leaves ${on}.`],
    ['Message', `Chainlink CCIP tells the note on ${home} about the lock. This takes about 20 minutes.`],
    [
      'Count',
      `The note holds a receipt, ${receipt}, priced by Chainlink and counted toward its collateral. Chainlink CRE checks on every run that the vault still holds the ${token}.`,
    ],
    [
      'Release',
      `Paid in full: CCIP carries the release back and the vault returns the ${token} to the issuer. On a default it goes to the holders instead, up to its value.`,
    ],
  ];

  return (
    <div
      ref={ref}
      className="flow-wrap"
      data-reveal
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={() => setHeld(false)}
    >
      <div className="flow-routes" role="group" aria-label="Example route">
        {ROUTES.map((x, i) => {
          const t = REMOTE_COLLATERAL[x.home][x.asset][x.symbol]!.locked.token;
          return (
            <button
              key={t}
              type="button"
              className={i === route ? 'on' : ''}
              aria-pressed={i === route}
              onClick={() => {
                setRoute(i);
                setStep(0);
              }}
            >
              {t} on {NOTE_CHAIN_SHORT[x.asset]} → note on {NOTE_CHAIN_SHORT[x.home]}
            </button>
          );
        })}
      </div>

      <div className="flow" data-step={step} aria-hidden="true">
        <div className="flow-chain a">
          <span className="flow-k">Collateral stays on</span>
          <b>{on}</b>
          <div className="flow-box vault">
            <span className="flow-box-k">Vault</span>
            <code className="flow-tok">{token}</code>
            <span className="flow-state">{step === 3 ? 'Released' : 'Locked'}</span>
          </div>
        </div>
        <div className="flow-rail">
          <span className="flow-k">Chainlink CCIP</span>
          <span className="flow-line">
            {/* Remounted on each step so the packet's run restarts. */}
            <i key={`${route}:${step}`} className="flow-pkt" />
          </span>
          <span className="flow-k dim">about 20 minutes</span>
        </div>
        <div className="flow-chain b">
          <span className="flow-k">Note runs on</span>
          <b>{home}</b>
          <div className="flow-box note">
            <span className="flow-box-k">Note</span>
            <code className="flow-tok">{receipt}</code>
            <span className="flow-meter">
              <i />
            </span>
            <span className="flow-state">{step === 3 ? 'Repaid' : 'Counted as collateral'}</span>
          </div>
        </div>
      </div>

      <ol className="flow-steps">
        {steps.map(([k, t], i) => (
          <li key={k} className={i === step ? 'on' : ''}>
            <button type="button" aria-current={i === step ? 'step' : undefined} onClick={() => setStep(i)}>
              <span className="flow-n">{String(i + 1).padStart(2, '0')}</span>
              <b>{k}</b>
              <span className="flow-t">{t}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}

/** The stock tokens a chain has of its own (everything pledgeable there that is not cash or wrapped ETH). */
const stocksOn = (c: NoteChain) =>
  collateralChoices({ chain: c })
    .filter((x) => x.token && x.symbol !== 'USD' && x.symbol !== 'ETH')
    .map((x) => x.token as string);

export default function Chains() {
  return (
    <section id="chains">
      <div className="wrap">
        <div className="section-head" data-reveal>
          <span className="eyebrow">Three chains, one engine</span>
          <h2>Collateral stays where it lives. The note runs where you want it.</h2>
          <p>
            A note is issued, paid and settled on one chain: Robinhood Chain, Base or BNB Chain. Each has its own
            tokenized stocks. Any of them can back a note on its own chain, or stay locked there and back a note on
            another, with no bridge and no wrapped token.
          </p>
        </div>

        <ChainFlow />

        <div className="chain-table" data-reveal>
          <table>
            <thead>
              <tr>
                <th scope="col">Notes run on</th>
                <th scope="col">Paid in</th>
                <th scope="col">Stock tokens there</th>
                <th scope="col">Can also be backed by tokens on</th>
              </tr>
            </thead>
            <tbody>
              {NOTE_CHAINS.map((c) => (
                <tr key={c}>
                  <th scope="row">{NOTE_CHAIN_SHORT[c]}</th>
                  <td data-h="Paid in">
                    {CHAIN_CASH[c].token}
                    <small>{CHAIN_TOKENS[c][CHAIN_CASH[c].token]?.issuer.replace(' (test token)', '')}</small>
                  </td>
                  <td data-h="Stock tokens">{stocksOn(c).join(', ')}</td>
                  <td data-h="Also backed by tokens on">
                    {remoteCollateralChains(c)
                      .map((a) => NOTE_CHAIN_SHORT[a])
                      .join(' and ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="chain-foot" data-reveal>
          All three are testnets. The stock tokens on Base and BNB Chain, and nmUSD, are our own test copies of
          Coinbase&apos;s and Binance&apos;s tokens.{' '}
          <a href="/support">See everything supported: stablecoins, all 141 underlyings, every collateral token →</a>
        </p>
      </div>
    </section>
  );
}
