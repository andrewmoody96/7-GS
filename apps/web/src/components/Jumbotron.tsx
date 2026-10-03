import { useEffect, useRef } from 'react';

interface JumbotronProps {
  open: boolean;
  /** The big word, e.g. "W" or "Walk-off W". */
  headline: string;
  detail?: string;
  onClose: () => void;
  /** Auto-dismiss after this many ms (0 keeps it up). */
  autoCloseMs?: number;
}

const PENNANTS = Array.from({ length: 18 }, (_, i) => i);

/** Full-screen bulb-board celebration. Static (no confetti) with reduced motion. */
export function Jumbotron({ open, headline, detail, onClose, autoCloseMs = 3600 }: JumbotronProps) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const timer = autoCloseMs > 0 ? window.setTimeout(onClose, autoCloseMs) : undefined;
    return () => {
      window.removeEventListener('keydown', onKey);
      if (timer) window.clearTimeout(timer);
    };
  }, [open, onClose, autoCloseMs]);

  if (!open) return null;
  const big = headline.length <= 2;
  return (
    <div className="jumbotron" role="alertdialog" aria-modal="true" aria-label={headline} onClick={onClose}>
      <div className="jumbotron__confetti" aria-hidden="true">
        {PENNANTS.map((i) => (
          <span key={i} className={`pennant pennant--${i % 3}`} style={{ left: `${(i * 37) % 100}%`, animationDelay: `${(i % 6) * 120}ms` }} />
        ))}
      </div>
      <div className="jumbotron__screen">
        <div className="jumbotron__marquee" aria-hidden="true" />
        <p className={`jumbotron__headline${big ? ' jumbotron__headline--big' : ''}`}>{headline}</p>
        {detail ? <p className="jumbotron__detail">{detail}</p> : null}
        <button ref={closeRef} type="button" className="btn btn--ghost-light jumbotron__close" onClick={onClose}>
          Back to the game
        </button>
      </div>
    </div>
  );
}
