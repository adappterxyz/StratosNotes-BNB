import { useEffect, useState, type ReactNode } from 'react';
import { useLocation } from 'react-router-dom';
import { Compass, PenLine, Sparkles } from 'lucide-react';
import type { ChainConfig } from '../../lib/api';
import type { AiReading, ReadyMade } from '../../lib/readymade';
import DescribeIt from './DescribeIt';
import ReadyMadeList, { RecentList } from './ReadyMadeList';
import { ChainCards, cashOn, shortName } from './ChainPicker';
import { PRODUCTS, type Kind } from './wizard-data';

type Door = 'from' | 'wizard' | 'describe';

/**
 * Issue, start here: first where the note runs (and so what it raises), then one of three ways in: a ready-made note
 * (recommended), build your own from a note type, or describe it to the AI. Only the chosen way is shown; each ends
 * on a review with what investors will see before anything is issued.
 */
export function IssueChooser({
  chains,
  chain,
  setChain,
  ai,
  pick,
  choose,
  fromAi,
  aiWorkflow,
}: {
  chains: ChainConfig[];
  /** The network picked (null: not yet). */
  chain: string | null;
  setChain: (key: string) => void;
  /** The deployment serves the AI. */
  ai: boolean;
  pick: (r: ReadyMade) => void;
  choose: (k: Kind) => void;
  fromAi: (r: AiReading) => void;
  aiWorkflow: (xml: string) => void;
}) {
  // /issue#from, #wizard, #describe (links from elsewhere) open that way in.
  const { hash } = useLocation();
  const [door, setDoor] = useState<Door>(() => {
    const h = hash.slice(1);
    return h === 'wizard' || (h === 'describe' && ai) ? h : 'from';
  });
  useEffect(() => {
    const h = hash.slice(1);
    if (h === 'from' || h === 'wizard' || (h === 'describe' && ai)) setDoor(h);
  }, [hash, ai]);
  const cfg = chains.find((c) => c.key === chain);
  const doors: Array<{ id: Door; icon: ReactNode; title: string; line: string; tag?: string }> = [
    {
      id: 'from',
      icon: <Compass className="i" />,
      title: 'Start from a ready-made note',
      line: 'Terms filled in. Pick a schedule and collateral, then issue.',
      tag: 'Recommended',
    },
    {
      id: 'wizard',
      icon: <PenLine className="i" />,
      title: 'Build your own',
      line: 'Choose what kind of note, then set each term with a live preview.',
    },
    ...(ai
      ? [
          {
            id: 'describe' as const,
            icon: <Sparkles className="i" />,
            title: 'Describe it',
            line: 'Say it in your own words; the AI fills in the terms.',
          },
        ]
      : []),
  ];
  return (
    <main className="page iw iw-start">
      <div className="page-head">
        <div>
          <h1>Issue a note</h1>
          <p>
            Raise money from investors against collateral you lock. Investors see the note's terms, lines and a preview
            before anything goes on-chain.
          </p>
        </div>
      </div>

      <section className="iw-q" aria-labelledby="q-chain">
        <h2 id="q-chain">
          <span className="iw-qn">1</span>Where will it run?
        </h2>
        <ChainCards chains={chains} value={chain} onPick={setChain} />
      </section>

      {!cfg ? (
        <p className="small muted iw-q-wait">
          Pick a network first: it decides the currency investors pay in and what can back the note.
        </p>
      ) : (
        <section className="iw-q" aria-labelledby="q-how">
          <h2 id="q-how">
            <span className="iw-qn">2</span>How do you want to start?
          </h2>
          <div className="iw-doors" role="tablist" aria-label="Ways to start">
            {doors.map((d) => (
              <button
                key={d.id}
                type="button"
                role="tab"
                id={`door-${d.id}`}
                aria-selected={door === d.id}
                aria-controls={`door-panel-${d.id}`}
                className={`iw-doorbtn${door === d.id ? ' on' : ''}`}
                data-door={d.id}
                onClick={() => setDoor(d.id)}
              >
                <span className="iw-doorbtn-t">
                  {d.icon}
                  {d.title}
                  {d.tag && <span className="tag">{d.tag}</span>}
                </span>
                <span className="iw-doorbtn-d">{d.line}</span>
              </button>
            ))}
          </div>

          <div role="tabpanel" id={`door-panel-${door}`} aria-labelledby={`door-${door}`} className="iw-panel">
            {door === 'from' && (
              <div className="stack gap-16">
                <RecentList chain={cfg.key} onPick={pick} />
                <div className="stack gap-10">
                  <h3 className="iw-sub">
                    Ready-made notes on {shortName(cfg)}, in {cashOn(cfg)}
                  </h3>
                  <ReadyMadeList chain={cfg.key} onPick={pick} />
                </div>
              </div>
            )}
            {door === 'wizard' && (
              <div className="iw-grid">
                {PRODUCTS.map((x) => (
                  <button key={x.kind} className="iw-card" data-product={x.kind} onClick={() => choose(x.kind)}>
                    <span className="iw-ic" aria-hidden="true">
                      {x.icon}
                    </span>
                    <span className="iw-t">{x.title}</span>
                    <span className="iw-d">{x.line}</span>
                    <span className="xs dim">{x.tech}</span>
                  </button>
                ))}
              </div>
            )}
            {door === 'describe' && ai && <DescribeIt onProduct={fromAi} onWorkflow={aiWorkflow} />}
          </div>
        </section>
      )}
    </main>
  );
}
