/**
 * The issue builder's live preview: the card investors will see (plain name, rate, facts, the barrier bar) and a
 * rough risk reading, updated as the terms change.
 */
import { economicsOf, type ProductParams } from '@sn/core';
import { ChevronDown } from 'lucide-react';
import type { Schedule } from '../../lib/listing';
import { riskLevel } from '../../lib/story';
import { useNarrow } from '../../lib/useNarrow';
import { PreviewCard, rateOf } from '../NoteCard';

export function RiskMeter({ p }: { p: ProductParams }) {
  const r = riskLevel(p);
  const tone = r.level <= 2 ? 'low' : r.level <= 3 ? 'mid' : 'high';
  return (
    <div className={`risk r-${tone}`} data-risk={r.level}>
      <div className="risk-head">
        <span className="small">Risk to investors</span>
        <span className="xs muted">a rough guide</span>
      </div>
      <div
        className="risk-bar"
        role="meter"
        aria-valuemin={1}
        aria-valuemax={5}
        aria-valuenow={r.level}
        aria-label="Risk to investors, 1 to 5"
      >
        {[1, 2, 3, 4, 5].map((i) => (
          <span key={i} className={i <= r.level ? 'on' : ''} />
        ))}
      </div>
      <span className="xs">{r.text}</span>
    </div>
  );
}

export function IssuePreview({
  p,
  cash,
  chainKey,
  schedule,
  size,
}: {
  p: ProductParams;
  cash: string;
  chainKey: string;
  schedule: Schedule;
  size?: number;
}) {
  const eco = economicsOf(p);
  // On a phone the preview cannot sit beside the step: it folds into a bar that stays under the header, showing the
  // rate and the risk level as the terms change, and opens to the full card.
  const narrow = useNarrow(860);
  const nums = [
    p.couponRatePct,
    p.couponBarrierPct,
    p.knockInBarrierPct,
    p.autocallLevelPct,
    p.protectionPct,
    p.participationPct,
    p.observations,
  ];
  if (!nums.every((v) => v === undefined || Number.isFinite(v)))
    return (
      <aside className="iw-side iw-preview" aria-label="Investors will see" data-issue-preview>
        <span className="iw-side-h">Investors will see</span>
        <p className="small muted">Fill in every term to see the note as investors will.</p>
      </aside>
    );
  const card = (
    <PreviewCard
      p={p}
      cash={cash}
      chainKey={chainKey}
      schedule={schedule}
      facts={[
        <span key="c">
          <b>{eco.collateralRatioPct}%</b> collateral
        </span>,
        size ? (
          <span key="s">
            <b>{size.toLocaleString()}</b> {cash} on offer
          </span>
        ) : null,
      ]}
    />
  );
  if (narrow) {
    const r = rateOf(p, cash, schedule);
    const risk = riskLevel(p);
    return (
      <details className="iw-side iw-preview iw-peek" aria-label="Investors will see" data-issue-preview>
        <summary>
          <span className="iw-peek-h">Investors will see</span>
          <span className="iw-peek-rate">
            <b className="num">{r.big}</b> {r.sub}
          </span>
          <span className="iw-peek-risk" data-risk={risk.level}>
            Risk {risk.level}/5
          </span>
          <ChevronDown className="i" aria-hidden />
        </summary>
        {card}
        <RiskMeter p={p} />
      </details>
    );
  }
  return (
    <aside className="iw-side iw-preview" aria-label="Investors will see" data-issue-preview>
      <span className="iw-side-h">Investors will see</span>
      {card}
      <RiskMeter p={p} />
    </aside>
  );
}
