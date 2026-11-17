/**
 * A section divider in the shape of the mark's payoff line (floor, participation, cap): a hairline that steps up
 * once, the step in Signal green. It draws itself in when it scrolls into view (data-reveal).
 */
export default function PayoffRule() {
  return (
    <div className="payoff-rule" aria-hidden="true" data-reveal>
      <svg viewBox="0 0 1200 28" preserveAspectRatio="none">
        <path className="pr-base" d="M0 22H470" pathLength={1} />
        <path className="pr-rise" d="M470 22L530 6" pathLength={1} />
        <path className="pr-base pr-cap" d="M530 6H1200" pathLength={1} />
      </svg>
    </div>
  );
}
