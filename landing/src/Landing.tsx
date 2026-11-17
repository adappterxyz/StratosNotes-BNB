import { useCallback, useEffect, useRef, useState } from 'react';
import './notes.css';
import Carousel from './Carousel';
import Stage from './Stage';
import ExplorerPanel from './ExplorerPanel';
import TermSheet from './TermSheet';
import { WhyOnchain, Outcomes, ForIssuers, Faq } from './Sections';
import { SideTabs, type Side } from './SideTabs';
import Chains from './Chains';
import Numbers from './Numbers';
import PayoffRule from './PayoffRule';
import { DEFAULT_START, type ExplorerStart } from './explorer/start';
import { Wordmark } from './Wordmark';

const APP_URL = '/app/';
const ISSUE_URL = '/app/issue';
const STRATOS_URL = 'https://stratoslab.xyz';
const REPO_URL = 'https://github.com/adappterxyz/StratosNotes-Robinhood';

export default function Landing() {
  const rootRef = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  // One audience choice for the whole page: hero copy and buttons, the note cards and the section order. Remembered.
  const [side, setSideState] = useState<Side>(() => {
    try {
      return localStorage.getItem('nm-side') === 'Issuers' ? 'Issuers' : 'Investors';
    } catch {
      return 'Investors';
    }
  });
  const setSide = useCallback((v: Side) => {
    setSideState(v);
    try {
      localStorage.setItem('nm-side', v);
    } catch {
      /* private mode: the choice lasts for this visit */
    }
  }, []);
  // The full explorer opens on request only (a card, the "Try a note" buttons, or a #explore link).
  const [explorer, setExplorer] = useState<ExplorerStart | null>(() =>
    typeof window !== 'undefined' && window.location.hash === '#explore' ? DEFAULT_START : null,
  );
  const openExplorer = useCallback((s: ExplorerStart = DEFAULT_START) => {
    setMenu(false);
    setExplorer(s);
  }, []);
  const closeExplorer = useCallback(() => {
    setExplorer(null);
    if (window.location.hash === '#explore')
      history.replaceState(null, '', window.location.pathname + window.location.search);
  }, []);
  useEffect(() => {
    const onHash = () => {
      if (window.location.hash === '#explore') setExplorer((e) => e ?? DEFAULT_START);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);
  // Nav state and gentle reveals; the page is complete without them.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const header = root.querySelector('header.nav');
    const onScroll = () => header?.classList.toggle('scrolled', window.scrollY > 20);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    root.classList.add('js');
    return () => {
      window.removeEventListener('scroll', onScroll);
      root.classList.remove('js');
    };
  }, []);
  // Reveals. Re-run when the audience changes: that reorders the sections, and a section that moves is mounted anew.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const els = [...root.querySelectorAll<HTMLElement>('[data-reveal]:not(.in)')];
    const io = new IntersectionObserver(
      (entries) =>
        entries.forEach((en) => {
          if (en.isIntersecting) {
            en.target.classList.add('in');
            io.unobserve(en.target);
          }
        }),
      { threshold: 0.1 },
    );
    els.forEach((el) => io.observe(el));
    const all = window.setTimeout(() => els.forEach((el) => el.classList.add('in')), 1800);
    return () => {
      io.disconnect();
      clearTimeout(all);
    };
  }, [side]);
  useEffect(() => {
    if (!menu) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenu(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [menu]);

  const links = [
    ['#chains', 'Chains'],
    ['#notes', 'Notes'],
    ['#why', 'Why onchain'],
    ['#issuers', 'For issuers'],
    ['#faq', 'FAQ'],
    ['/support', 'Supported'],
  ];

  // What a note can do: the cards for this audience, how a note can end, and the explorer to try one.
  const notes = (
    <section id="notes" className="notes-sec" key="notes">
      <div className="wrap">
        <div className="section-head">
          <span className="eyebrow">What a note can do</span>
          <h2>Pick the trade-off you want.</h2>
          <SideTabs side={side} onChange={setSide} idPrefix="tab" controls="notes-panel" />
          <p className="side-sub" aria-live="polite">
            {side === 'Investors'
              ? 'Every note gives up some upside for something else: a coupon, a buffer, an early exit. Terms are set before you buy, and you can lose money.'
              : 'Raise stablecoins against collateral you lock, and pay each coupon when it falls due.'}
          </p>
        </div>
      </div>
      <div id="notes-panel" role="tabpanel" aria-labelledby={`tab-${side}`}>
        <Carousel key={side} side={side} onOpen={openExplorer} />
      </div>
      <div className="wrap">
        <div className="try-row">
          <button type="button" className="btn btn-primary" onClick={() => openExplorer()}>
            Try a note yourself
          </button>
          <span>Drag the price and watch what it pays. Example terms, not live prices.</span>
        </div>
      </div>
      <Outcomes />
      <div className="wrap">
        <p className="underlyings" data-reveal>
          <span className="built-label">Underlyings</span>141 Chainlink prices: 87 crypto assets including BTC, ETH and
          SOL · 34 US stocks and ETFs including TSLA, NVDA, AAPL, AMZN and SPY · 18 currencies · gold and silver.{' '}
          <a href="/support">See the full list</a>
        </p>
      </div>
    </section>
  );
  const live = (
    <section id="live" className="ts-sec" key="live">
      <div className="wrap ts-wrap">
        <div className="section-head" data-reveal>
          <span className="badge">
            <i />
            Live on testnet
          </span>
          <h2>Every term on one sheet, before you subscribe.</h2>
          <p>
            Each note publishes its coupon, tenor, autocall level, knock-in barrier and the collateral pledged behind
            it.
          </p>
          <div className="hero-cta">
            <a href={APP_URL} className="btn btn-ghost">
              Browse live notes
            </a>
          </div>
        </div>
        <div data-reveal>
          <TermSheet />
        </div>
      </div>
    </section>
  );

  return (
    <div className="sn-root" ref={rootRef}>
      <header className={`nav${menu ? ' open' : ''}`}>
        <div className="nav-inner">
          <a className="brand" href="#top" aria-label="notes.markets home">
            <Wordmark />
          </a>
          <nav className="nav-links" aria-label="Sections">
            {links.map(([h, t]) => (
              <a key={h} href={h}>
                {t}
              </a>
            ))}
          </nav>
          <div className="nav-cta">
            <button type="button" className="btn btn-ghost hide-sm" onClick={() => openExplorer()}>
              Try a note
            </button>
            <a href={APP_URL} className="btn btn-primary">
              Launch app
            </a>
            <button
              type="button"
              className="nav-menu"
              aria-label={menu ? 'Close menu' : 'Open menu'}
              aria-expanded={menu}
              aria-controls="nav-sheet"
              onClick={() => setMenu((m) => !m)}
            >
              <span />
              <span />
              <span />
            </button>
          </div>
        </div>
        <div id="nav-sheet" className="nav-sheet" hidden={!menu}>
          {links.map(([h, t]) => (
            <a key={h} href={h} onClick={() => setMenu(false)}>
              {t}
            </a>
          ))}
          <button type="button" className="btn btn-ghost" onClick={() => openExplorer()}>
            Try a note
          </button>
        </div>
      </header>

      <main id="top">
        <Stage side={side} onSide={setSide} onTry={() => openExplorer()} />
        <Numbers />
        <Chains />
        <PayoffRule />
        {side === 'Issuers' && <ForIssuers key="issuers" />}
        {notes}
        {live}
        <WhyOnchain />
        {side === 'Investors' && <ForIssuers key="issuers" />}
        <Faq />

        <section id="cta">
          <div className="wrap">
            <div className="cta-final" data-reveal>
              <h2>
                Terms set upfront.
                <br />
                Every payment step onchain.
              </h2>
              <div className="hero-cta">
                <a href={APP_URL} className="btn btn-primary btn-lg">
                  Browse live notes
                </a>
                <a href={ISSUE_URL} className="btn btn-ghost btn-lg">
                  Issue a note
                </a>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="foot">
        <div className="wrap foot-inner">
          <Wordmark dark />
          <div className="foot-links">
            <a href={APP_URL}>App</a>
            <a href="/support">What&apos;s supported</a>
            <a href={REPO_URL} target="_blank" rel="noopener">
              GitHub
            </a>
            <a href={STRATOS_URL} target="_blank" rel="noopener">
              stratoslab.xyz
            </a>
          </div>
          <small className="by">
            <img src="/logos/stratos-mark.png" alt="" width={16} height={16} />
            notes.markets by StratosLab · Built on Robinhood Chain, Base, BNB Chain and Chainlink
          </small>
          <small className="disclaimer">
            notes.markets is software running on a test network: notes here use test tokens with no value. Nothing on
            this site is an offer to sell, a solicitation to buy, or a recommendation of any security, and nothing here
            is investment, legal or tax advice. Structured notes are complex: you can lose some or all of what you
            invest, payments depend on the issuer and on the collateral pledged, and examples and simulations do not
            predict results. Any future offering will be subject to eligibility and jurisdiction rules. Tokens used as
            cash or collateral (USDG, USDC, the stock tokens) can be paused or frozen by their issuers. The stock tokens
            on Base and BNB Chain testnets, and nmUSD, are notes.markets&apos; own test copies, not Coinbase&apos;s or
            Binance&apos;s. The contracts are not audited. Robinhood Chain, Base, Coinbase, Binance, BNB Chain and
            Chainlink are trademarks of their owners; notes.markets is not affiliated with or endorsed by them.
          </small>
        </div>
      </footer>
      {explorer && <ExplorerPanel start={explorer} onClose={closeExplorer} />}
    </div>
  );
}
