/**
 * The chains section: where notes run, and how collateral on one chain backs a note on another.
 *  - ChainFlow: an animated four-step diagram of cross-chain collateral (lock, message, count, release) for one
 *    example route per collateral chain. It advances on its own while on screen; hover, focus or a click on a step
 *    holds it. With reduced motion it never advances by itself and nothing travels.
 *  - One card per chain (mark, cash token, its stock tokens), read from packages/core like /support.
 */
import { useEffect, useRef, useState } from 'react';
import {
  CHAIN_CASH,
  NOTE_CHAINS,
  NOTE_CHAIN_SHORT,
  REMOTE_COLLATERAL,
  collateralChoices,
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
    ['Lock', `${token} goes into a vault on ${on}.`],
    ['Message', 'Chainlink CCIP tells the note. About 20 minutes.'],
    ['Count', `The note counts ${receipt} as collateral.`],
    ['Release', 'Back to the issuer. Or to holders, on a default.'],
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
              {t} · {NOTE_CHAIN_SHORT[x.asset]} → {NOTE_CHAIN_SHORT[x.home]}
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
              {/* The bar fills over the step's time on screen, then the next step takes over. */}
              <i key={`${route}:${step}`} className={`flow-bar${held || reduced ? ' still' : ''}`} />
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

/** Each chain's mark for a dark ground. BNB Chain's official logo carries its own name. */
const MARK: Record<NoteChain, { src: string; h: number; named?: boolean }> = {
  'robinhood-testnet': { src: '/logos/robinhood-chain.svg', h: 26 },
  'base-sepolia': { src: '/logos/base-white.svg', h: 20 },
  'bnb-testnet': { src: '/logos/bnb-chain.svg', h: 20, named: true },
};

export default function Chains() {
  return (
    <section id="chains" className="chains-band">
      <div className="snap">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Cross-chain collateral</span>
            <h2>
              Collateral stays put.
              <br />
              The note runs anywhere.
            </h2>
          </div>

          <ChainFlow />
        </div>
      </div>

      <div className="snap">
        <div className="wrap">
          <div className="section-head" data-reveal>
            <span className="eyebrow">Where notes run</span>
            <h2>Three chains. One engine.</h2>
          </div>
          <div className="chain-cards">
            {NOTE_CHAINS.map((c) => (
              <div key={c} className="chain-card" data-reveal>
                <div className="chain-name">
                  <img src={MARK[c].src} alt={MARK[c].named ? NOTE_CHAIN_SHORT[c] : ''} height={MARK[c].h} />
                  {!MARK[c].named && NOTE_CHAIN_SHORT[c]}
                </div>
                <span className="chain-cash">
                  Paid in <b>{CHAIN_CASH[c].token}</b>
                </span>
                <span className="chain-toks">
                  {stocksOn(c).map((t) => (
                    <code key={t}>{t}</code>
                  ))}
                </span>
              </div>
            ))}
          </div>
          <p className="chain-foot" data-reveal>
            Testnets. The stock tokens on Base and BNB Chain, and nmUSD, are our own test copies.{' '}
            <a href="/support">Everything supported →</a>
          </p>
        </div>
      </div>
    </section>
  );
}
