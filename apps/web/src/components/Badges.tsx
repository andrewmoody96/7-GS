import type { OpponentDto } from '@7gs/contracts';
import { generateOpponent } from '@7gs/rules';
import { initials } from '../lib/format';

interface OpponentBadgeProps {
  opponent: OpponentDto;
  size?: number;
}

/** A generic shield badge redrawn from the opponent's seed (no real team marks). */
export function OpponentBadge({ opponent, size = 40 }: OpponentBadgeProps) {
  const generated = generateOpponent(opponent.seed);
  const [primary, secondary] = opponent.colors;
  const abbr = generated.abbreviation;
  return (
    <svg
      className="badge badge--opponent"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${opponent.name} badge`}
    >
      <path d="M20 2.5l15 5v11.2c0 9.3-6.3 15.7-15 18.8C11.3 34.4 5 28 5 18.7V7.5z" fill={primary} stroke={secondary} strokeWidth="2" />
      <path d="M8.5 10.2L20 6.4l11.5 3.8" fill="none" stroke={secondary} strokeWidth="1.2" opacity="0.7" />
      <text
        x="20"
        y={abbr.length > 2 ? 24.5 : 25.5}
        textAnchor="middle"
        fill={secondary}
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize={abbr.length > 2 ? 11 : 13}
        letterSpacing="0.5"
      >
        {abbr}
      </text>
    </svg>
  );
}

/** The user's own club: a chalk monogram on outfield green. */
export function TeamBadge({ name, size = 40 }: { name: string; size?: number }) {
  const abbr = initials(name, 2) || 'YOU';
  return (
    <svg className="badge badge--team" width={size} height={size} viewBox="0 0 40 40" role="img" aria-label={`${name} badge`}>
      <circle cx="20" cy="20" r="18" fill="var(--outfield-600)" stroke="var(--chalk-100)" strokeWidth="2" />
      <circle cx="20" cy="20" r="14.5" fill="none" stroke="var(--chalk-100)" strokeWidth="0.8" strokeDasharray="1.6 2" opacity="0.8" />
      <text
        x="20"
        y="25"
        textAnchor="middle"
        fill="var(--chalk-50)"
        fontFamily="var(--font-display)"
        fontWeight="700"
        fontSize="14"
      >
        {abbr}
      </text>
    </svg>
  );
}
