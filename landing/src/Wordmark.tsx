/** The wordmark: lowercase, with the dot as the one blue mark. */
export function Wordmark({ size = 'md', dark = false }: { size?: 'md' | 'lg'; dark?: boolean }) {
  // Primary lockup (docs/brand/logo-guide.pdf): the payoff note, then "notes" in Geist Bold, a Signal-green square dot,
  // "markets" in Geist Regular, Slate.
  return (
    <span className={`wordmark ${size}${dark ? ' on-dark' : ''}`} aria-label="notes.markets">
      <img className="wm-mark" src={dark ? '/brand/mark-reversed.svg' : '/brand/mark.svg'} alt="" aria-hidden="true" />
      <span className="wm-text" aria-hidden="true">
        <b>notes</b>
        <i />
        <span>markets</span>
      </span>
    </span>
  );
}
