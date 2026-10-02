// Inline SVG icons (24px grid, currentColor). Decorative unless given a title.

import type { ReactNode, SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="24"
      height="24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

/** Home plate: Today. */
export const IconToday = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 4h14v8l-7 8-7-8z" />
    <path d="M9 9h6" />
  </Icon>
);

/** Seven boxes: the Series strip. */
export const IconSeries = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="5" height="5" rx="1" />
    <rect x="9.5" y="6" width="5" height="5" rx="1" />
    <rect x="16" y="6" width="5" height="5" rx="1" />
    <rect x="3" y="13" width="5" height="5" rx="1" />
    <rect x="9.5" y="13" width="5" height="5" rx="1" />
    <path d="M16 15.5h5" />
  </Icon>
);

/** Clipboard with a play: Film Room. */
export const IconFilmRoom = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="4" width="14" height="17" rx="2" />
    <path d="M9 4V3h6v1" />
    <circle cx="9.5" cy="10" r="1.5" />
    <path d="M13 9l3 3m0-3l-3 3" />
    <path d="M9.5 12v3.5l5 1.5" />
  </Icon>
);

/** Pennant: Season. */
export const IconSeason = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 21V3" />
    <path d="M5 4l14 4.5L5 13" />
  </Icon>
);

export const IconCheck = (p: IconProps) => (
  <Icon {...p} strokeWidth={3}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const IconX = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const IconLock = (p: IconProps) => (
  <Icon {...p}>
    <rect x="5" y="11" width="14" height="10" rx="2" />
    <path d="M8 11V8a4 4 0 0 1 8 0v3" />
  </Icon>
);

export const IconRain = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 15a4 4 0 1 1 .9-7.9A5 5 0 0 1 17.5 8 3.5 3.5 0 0 1 17 15z" />
    <path d="M8 18l-1 2M12 18l-1 2M16 18l-1 2" />
  </Icon>
);

export const IconPlus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const IconMinus = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14" />
  </Icon>
);

export const IconUp = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 15l6-6 6 6" />
  </Icon>
);

export const IconDown = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9l6 6 6-6" />
  </Icon>
);

export const IconChevronRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6l6 6-6 6" />
  </Icon>
);

export const IconArrowRight = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const IconSwap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M7 4L3 8l4 4" />
    <path d="M3 8h13" />
    <path d="M17 20l4-4-4-4" />
    <path d="M21 16H8" />
  </Icon>
);

export const IconFlame = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 21c4 0 7-2.7 7-6.6 0-3.6-2.6-5.6-4.2-8.4-.6 2-1.7 3.3-3.1 4.1.2-2.9-1-5.6-3.7-7.1.4 3.4-2.9 5.8-2.9 10.6C5 18.3 8 21 12 21z" />
  </Icon>
);

export const IconCap = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 15a8 8 0 0 1 16 0z" />
    <path d="M20 15h2" />
    <path d="M12 7v-1" />
  </Icon>
);

export const IconInfo = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5M12 8h.01" />
  </Icon>
);

export const IconWarning = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 3l9.5 17h-19z" />
    <path d="M12 10v4M12 17h.01" />
  </Icon>
);

export const IconBandage = (p: IconProps) => (
  <Icon {...p}>
    <rect x="2.5" y="8.5" width="19" height="7" rx="3.5" transform="rotate(-45 12 12)" />
    <path d="M10.5 10.5h.01M13.5 13.5h.01M13.5 10.5h.01M10.5 13.5h.01" />
  </Icon>
);

export const IconSettings = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
  </Icon>
);

export const IconEdit = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9l-4-4L4 16z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const IconDice = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 2.5l8.5 5v9L12 21.5l-8.5-5v-9z" />
    <path d="M12 12l8.5-4.5M12 12L3.5 7.5M12 12v9.5" />
  </Icon>
);
