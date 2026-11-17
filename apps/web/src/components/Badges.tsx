import type { OpponentDto } from "@7gs/contracts";
import { generateOpponent } from "@7gs/rules";
import { initials } from "../lib/format";
import { useMeQuery } from "../app/queries";
import { useId } from "react";

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
      <path
        d="M20 2.5l15 5v11.2c0 9.3-6.3 15.7-15 18.8C11.3 34.4 5 28 5 18.7V7.5z"
        fill={primary}
        stroke={secondary}
        strokeWidth="2"
      />
      <path
        d="M8.5 10.2L20 6.4l11.5 3.8"
        fill="none"
        stroke={secondary}
        strokeWidth="1.2"
        opacity="0.7"
      />
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

/**
 * The user's own club: a chalk monogram on outfield green, or, once they've set a team
 * photo, the photo in the same ring with the monogram over its lower part (on a dark fade
 * so it reads on any photo). `photo` overrides the account's photo (for previews).
 */
export function TeamBadge({
  name,
  size = 40,
  photo,
  plain = false,
}: {
  name: string;
  size?: number;
  photo?: string | null;
  /** Just the photo, without the initials (where the team name is shown beside it). */
  plain?: boolean;
}) {
  const me = useMeQuery();
  const id = useId();
  const src = photo !== undefined ? photo : (me.data?.avatar ?? null);
  const abbr = initials(name, 2) || "YOU";
  if (src) {
    const clip = `${id}-clip`;
    const fade = `${id}-fade`;
    return (
      <svg
        className="badge badge--team badge--photo"
        width={size}
        height={size}
        viewBox="0 0 40 40"
        role="img"
        aria-label={`${name} badge`}
      >
        <defs>
          <clipPath id={clip}>
            <circle cx="20" cy="20" r="18" />
          </clipPath>
          <linearGradient id={fade} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0.45" stopColor="#000" stopOpacity="0" />
            <stop offset="1" stopColor="#000" stopOpacity="0.7" />
          </linearGradient>
        </defs>
        <g clipPath={`url(#${clip})`}>
          <image
            href={src}
            x="2"
            y="2"
            width="36"
            height="36"
            preserveAspectRatio="xMidYMid slice"
          />
          {plain ? null : (
            <rect x="2" y="2" width="36" height="36" fill={`url(#${fade})`} />
          )}
        </g>
        <circle
          cx="20"
          cy="20"
          r="18"
          fill="none"
          stroke="var(--chalk-100)"
          strokeWidth={plain ? 1 : 2}
        />
        {plain ? null : (
          <text
            x="20"
            y="33"
            textAnchor="middle"
            fill="var(--chalk-50)"
            fontFamily="var(--font-display)"
            fontWeight="700"
            fontSize="9"
            letterSpacing="0.6"
          >
            {abbr}
          </text>
        )}
      </svg>
    );
  }
  return (
    <svg
      className="badge badge--team"
      width={size}
      height={size}
      viewBox="0 0 40 40"
      role="img"
      aria-label={`${name} badge`}
    >
      <circle
        cx="20"
        cy="20"
        r="18"
        fill="var(--outfield-600)"
        stroke="var(--chalk-100)"
        strokeWidth="2"
      />
      <circle
        cx="20"
        cy="20"
        r="14.5"
        fill="none"
        stroke="var(--chalk-100)"
        strokeWidth="0.8"
        strokeDasharray="1.6 2"
        opacity="0.8"
      />
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
