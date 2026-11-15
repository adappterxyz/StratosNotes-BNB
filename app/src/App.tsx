import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { Briefcase, LayoutGrid, Mail, Moon, PenTool, Settings2, Sun } from 'lucide-react';
import Marketplace from './pages/Marketplace';
import OfferingPage from './pages/Offering';
import Portfolio from './pages/Portfolio';
import IssueWizard from './pages/IssueWizard';
import Workspace from './pages/Workspace';
import { useNarrow } from './lib/useNarrow';
import AlertsPage, { AlertsConfirm, AlertsUnsubscribe } from './pages/Alerts';
import FaucetButton, { TestnetTokens } from './components/FaucetButton';
import { ToastProvider } from './components/Toast';
import RoleSwitch from './components/RoleSwitch';
import { useChains } from './lib/chains';
import { watchTables } from './lib/stackTables';

function useDark() {
  // White is the default; the dark theme is an opt-in kept per browser.
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark);
    try {
      localStorage.setItem('nm-theme', dark ? 'dark' : 'light');
    } catch {
      /* private mode */
    }
    window.dispatchEvent(new Event('sn-theme'));
  }, [dark]);
  return [dark, setDark] as const;
}

/**
 * One menu for the testnet's tools: the theme, where to get testnet tokens (each token's own faucet). The test
 * wallet's role switch and the local dev faucet stay in the bar (dev builds only).
 */
function ToolsMenu() {
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useDark();
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (!open) return;
    const off = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', off);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', off);
      document.removeEventListener('keydown', esc);
    };
  }, [open]);
  return (
    <span className="menu" ref={ref}>
      <button
        className="btn"
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Theme and testnet tokens"
        title="Theme and testnet tokens"
        onClick={() => setOpen((o) => !o)}
        data-tools
      >
        <Settings2 className="i" />
      </button>
      {open && (
        <div className="menu-pop tools-pop" role="menu">
          <button type="button" className="mi" role="menuitem" onClick={() => setDark((d) => !d)}>
            <span className="row gap-8">
              {dark ? <Sun className="i" /> : <Moon className="i" />}
              <span>{dark ? 'Light theme' : 'Dark theme'}</span>
            </span>
          </button>
          <div className="sep" />
          <TestnetTokens />
        </div>
      )}
    </span>
  );
}

/** The primary lockup (docs/brand/logo-guide.pdf): the payoff-note mark, "notes" in Geist Bold, a Signal-green square
 *  dot, "markets" in Geist Regular, Slate. On the dark theme: the reversed mark, white and light grey. */
function Wordmark() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains('dark'));
  useEffect(() => {
    const on = () => setDark(document.documentElement.classList.contains('dark'));
    window.addEventListener('sn-theme', on);
    return () => window.removeEventListener('sn-theme', on);
  }, []);
  return (
    <span className="wordmark" aria-label="notes.markets">
      <img
        className="wm-mark"
        src={`${import.meta.env.BASE_URL}brand/${dark ? 'mark-reversed' : 'mark'}.svg`}
        alt=""
        aria-hidden="true"
      />
      <span className="wm-text" aria-hidden="true">
        <b>notes</b>
        <i />
        <span>markets</span>
      </span>
    </span>
  );
}

export default function App() {
  const { pathname } = useLocation();
  const { config } = useChains();
  const narrow = useNarrow(720);
  useEffect(() => watchTables(), []);
  const networks = config.chains.map((c) => c.name).join(' · ');
  const workspace = pathname.startsWith('/issue/advanced');
  return (
    <ToastProvider>
      <NewVersion />
      <header className="appbar">
        <div className="appbar-row">
          <Link to="/" className="brand" aria-label="notes.markets marketplace">
            <Wordmark />
          </Link>
          <nav className="seg main-nav" aria-label="Sections">
            <NavLink to="/" end>
              <LayoutGrid className="i" />
              Marketplace
            </NavLink>
            <NavLink to="/issue">
              <PenTool className="i" />
              Issue
            </NavLink>
            <NavLink to="/portfolio">
              <Briefcase className="i" />
              Portfolio
            </NavLink>
            <NavLink to="/alerts">
              <Mail className="i" />
              Alerts
            </NavLink>
          </nav>
          <div className="right">
            <span
              className="net-dot"
              title={`Testnets: ${networks}. Test tokens only.`}
              aria-label={`Testnets: ${networks}`}
              data-networks={networks}
            >
              <span className="dot" />
              {narrow ? '' : config.chains.length > 1 ? `${config.chains.length} testnets` : 'Testnet'}
            </span>
            <FaucetButton devOnly />
            <RoleSwitch />
            <ToolsMenu />
            <ConnectButton chainStatus="icon" accountStatus={narrow ? 'avatar' : 'address'} showBalance={false} />
          </div>
        </div>
      </header>
      <Routes>
        <Route path="/" element={<Marketplace />} />
        <Route path="/note/:id" element={<OfferingPage />} />
        <Route path="/issue" element={<IssueWizard />} />
        <Route path="/issue/advanced" element={<Workspace />} />
        <Route path="/studio" element={<Navigate to="/issue" replace />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/alerts" element={<AlertsPage />} />
        <Route path="/alerts/confirm" element={<AlertsConfirm />} />
        <Route path="/alerts/unsubscribe" element={<AlertsUnsubscribe />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
      {!workspace && (
        <footer className="foot">
          <span>notes.markets runs on testnets: test tokens only, and the contracts are not audited.</span>
          {config.chains
            .filter((c) => c.explorer)
            .map((c) => (
              <a key={c.key} href={`${c.explorer}/address/${c.engine}`} target="_blank" rel="noreferrer">
                Engine on {c.name}
              </a>
            ))}
        </footer>
      )}
    </ToastProvider>
  );
}

/** The app's own bundle, as named in the page that loaded it. */
const loadedBundle = () =>
  document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]')?.getAttribute('src') ??
  null;

/**
 * A tab opened before a deploy keeps running the code it loaded. Every few minutes (and when the tab comes back into
 * view) compare the live page's bundle with ours; when they differ, offer a one-click reload.
 */
function NewVersion() {
  const [stale, setStale] = useState(false);
  useEffect(() => {
    const mine = loadedBundle();
    if (!mine) return;
    let off = false;
    const check = async () => {
      try {
        const html = await (await fetch(`${import.meta.env.BASE_URL}?v=${Date.now()}`, { cache: 'no-store' })).text();
        const live = /src="([^"]*\/assets\/index-[^"]+\.js)"/.exec(html)?.[1];
        if (!off && live && live !== mine) setStale(true);
      } catch {
        /* offline: try later */
      }
    };
    const t = setInterval(check, 5 * 60_000);
    const vis = () => {
      if (document.visibilityState === 'visible') void check();
    };
    document.addEventListener('visibilitychange', vis);
    return () => {
      off = true;
      clearInterval(t);
      document.removeEventListener('visibilitychange', vis);
    };
  }, []);
  if (!stale) return null;
  return (
    <div className="notice ok new-version" role="status">
      A newer version of notes.markets is live.{' '}
      <button type="button" className="btn sm" onClick={() => window.location.reload()}>
        Reload
      </button>
    </div>
  );
}
