import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Check } from 'lucide-react';
import { STEPS } from './wizard-data';

/** Breadcrumbs, where the note runs (in view on every step) and the step bar; a step already done can be reopened. */
export function WizardHeader({
  title,
  step,
  setStep,
  chip,
  back,
  reached = step,
}: {
  title: string;
  step: number;
  setStep: (s: number) => void;
  /** The chain chip (ChainChip). */
  chip?: ReactNode;
  /** Where "Issue" in the breadcrumbs goes (keeps the chosen network). */
  back: string;
  /** The furthest step reached so far: any step up to it can be reopened. */
  reached?: number;
}) {
  return (
    <>
      <div className="iw-top">
        <nav className="crumbs" aria-label="Breadcrumb">
          <Link to={back}>Issue</Link>
          <span aria-hidden="true">/</span>
          <span>{title}</span>
          <span aria-hidden="true">/</span>
          <span aria-current="page">{STEPS[step]}</span>
        </nav>
        {chip}
      </div>
      <ol className="iw-progress" aria-label="Steps">
        {STEPS.map((s, i) => (
          <li
            key={s}
            className={i === step ? 'now' : i < step || i <= reached ? 'done' : ''}
            aria-current={i === step ? 'step' : undefined}
          >
            <button disabled={i > Math.max(step, reached) || i === step} onClick={() => setStep(i)}>
              <span className="n">{i < step || (i <= reached && i !== step) ? <Check className="i" /> : i + 1}</span>
              {s}
            </button>
          </li>
        ))}
      </ol>
    </>
  );
}
