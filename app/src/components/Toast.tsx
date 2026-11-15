/**
 * Small rewards: a toast for the moments worth a beat (a coupon paid or claimed, units bought, a note repaid early),
 * with a short burst for the best ones. Polite (role="status"), dismissible, gone after a few seconds; with reduced
 * motion it simply appears.
 */
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { X } from 'lucide-react';

export interface Toast {
  id: number;
  title: string;
  body?: string;
  /** coin: a payment; party: a celebration (early repayment); plain: anything else. */
  tone?: 'coin' | 'party' | 'plain';
  /** The coin's label: "$", "+", "↑". */
  mark?: string;
}

const Ctx = createContext<(t: Omit<Toast, 'id'>) => void>(() => {});
export const useToast = () => useContext(Ctx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [list, setList] = useState<Toast[]>([]);
  const seq = useRef(0);
  const drop = useCallback((id: number) => setList((l) => l.filter((t) => t.id !== id)), []);
  const push = useCallback((t: Omit<Toast, 'id'>) => {
    const id = ++seq.current;
    setList((l) => [...l.slice(-2), { ...t, id }]);
  }, []);
  return (
    <Ctx.Provider value={push}>
      {children}
      <div className="toasts" role="status" aria-live="polite">
        {list.map((t) => (
          <ToastView key={t.id} t={t} onClose={() => drop(t.id)} />
        ))}
      </div>
    </Ctx.Provider>
  );
}

function ToastView({ t, onClose }: { t: Toast; onClose: () => void }) {
  useEffect(() => {
    const h = setTimeout(onClose, t.tone === 'party' ? 7000 : 5500);
    return () => clearTimeout(h);
  }, [onClose, t.tone]);
  return (
    <div className={`toast t-${t.tone ?? 'plain'}`} data-toast>
      <span className="coin" aria-hidden="true">
        {t.mark ?? (t.tone === 'party' ? '↑' : t.tone === 'coin' ? '$' : '✓')}
        {t.tone === 'party' && (
          <span className="burst">
            {Array.from({ length: 8 }, (_, i) => (
              <i key={i} style={{ rotate: `${i * 45}deg` }} />
            ))}
          </span>
        )}
      </span>
      <span className="toast-text">
        <b>{t.title}</b>
        {t.body && <small>{t.body}</small>}
      </span>
      <button type="button" className="toast-x" aria-label="Dismiss" onClick={onClose}>
        <X className="i" />
      </button>
    </div>
  );
}
