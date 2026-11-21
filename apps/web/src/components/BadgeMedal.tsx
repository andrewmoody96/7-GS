// A badge's medal: its icon in a ring colored by tier (bronze → Hall of Fame), greyed out
// until it's earned.

import type { Achievement } from '@7gs/rules';

export function BadgeMedal({ achievement, earned, size = 56 }: { achievement: Achievement; earned: boolean; size?: number }) {
  return (
    <span
      className={`medal medal--${achievement.tier}${earned ? ' is-earned' : ''}`}
      style={{ width: size, height: size, fontSize: size * 0.44 }}
      aria-hidden="true"
    >
      <span className="medal__icon">{achievement.icon}</span>
    </span>
  );
}
