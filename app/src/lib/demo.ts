/**
 * A demo wallet for pages that need one (Portfolio, Alerts) when none is connected: a real investor's address from
 * the live notes (a holder that is neither the issuer nor one of the note's own role accounts, such as its escrow),
 * shown read-only and labelled as a demo. Found once per page load.
 */
import { useEffect, useState } from 'react';
import { api } from './api';

let found: Promise<string | null> | null = null;

async function findHolder(): Promise<string | null> {
  const { notes } = await api.notes({ status: 'all', limit: 20 });
  const newest = [...notes].sort((a, b) => b.view.createdAt - a.view.createdAt).slice(0, 6);
  for (const n of newest) {
    const d = await api.note(n.id).catch(() => null);
    if (!d) continue;
    const skip = new Set([d.view.issuer, d.state.creator, ...d.state.roles].map((a) => a.toLowerCase()));
    const score = new Map<string, number>();
    for (const h of d.state.holdings) {
      const o = h.owner.toLowerCase();
      if (skip.has(o)) continue;
      // Units weigh most (a live position), then anything else held in the note (payouts, collateral after a default).
      score.set(o, (score.get(o) ?? 0) + Number(BigInt(h.balance)) * (h.asset === 0 ? 1000 : 1));
    }
    const best = [...score.entries()].sort((a, b) => b[1] - a[1])[0];
    if (best) return best[0];
  }
  return null;
}

/** A real holder's address to preview with (null while looking, or when there is none). */
export function useDemoHolder(enabled: boolean): string | null {
  const [addr, setAddr] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    found ??= findHolder().catch(() => null);
    found.then((a) => {
      if (live) setAddr(a);
    });
    return () => {
      live = false;
    };
  }, [enabled]);
  return enabled ? addr : null;
}
