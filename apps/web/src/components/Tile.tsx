/** A hand-turned scoreboard numeral. Changing `value` replays the flip. */
export function Tile({ value, size = 'm', label }: { value: number | string; size?: 's' | 'm' | 'l'; label?: string }) {
  return (
    <span className={`tile tile--${size}`} aria-label={label}>
      <span key={String(value)} className="tile__face" aria-hidden={label ? true : undefined}>
        {value}
      </span>
    </span>
  );
}
