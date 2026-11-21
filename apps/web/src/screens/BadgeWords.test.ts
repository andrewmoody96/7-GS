import { ACHIEVEMENTS } from '@7gs/rules';
import { afterEach, describe, expect, it } from 'vitest';
import { applyTheme, baseball, basketball, hockey } from '../vocab';
import { inSport } from './Badges';

afterEach(() => applyTheme('baseball'));

describe('badges in each sport’s words', () => {
  it.each([
    ['baseball', baseball],
    ['basketball', basketball],
    ['hockey', hockey],
  ] as const)('%s: only real badges, every icon and name its own', (_, words) => {
    const ids = new Set(ACHIEVEMENTS.map((a) => a.id));
    for (const id of Object.keys(words.badges)) expect(ids.has(id)).toBe(true);
    const shown = ACHIEVEMENTS.map((a) => ({ ...a, ...words.badges[a.id] }));
    expect(new Set(shown.map((a) => a.icon)).size).toBe(ACHIEVEMENTS.length);
    expect(new Set(shown.map((a) => a.name)).size).toBe(ACHIEVEMENTS.length);
  });

  it.each(['basketball', 'hockey'] as const)('%s: no baseball words left in a badge', (theme) => {
    applyTheme(theme);
    for (const a of ACHIEVEMENTS.map(inSport)) {
      expect(`${a.name} ${a.description}`).not.toMatch(/first pitch|rally cap|runs to win|rainout|perfect game/i);
      expect(a.icon).not.toMatch(/⚾|🧢/u);
    }
  });

  it('follows the sport the account is using', () => {
    const firstPitch = ACHIEVEMENTS.find((a) => a.id === 'first-pitch')!;
    expect(inSport(firstPitch)).toMatchObject({ name: 'First Pitch', icon: '⚾' });
    applyTheme('basketball');
    expect(inSport(firstPitch)).toMatchObject({ name: 'Tip-Off', icon: '🏀' });
    applyTheme('hockey');
    expect(inSport(firstPitch)).toMatchObject({ name: 'Puck Drop', icon: '🏒' });
    // What earns it never changes.
    expect(inSport(firstPitch)).toMatchObject({ metric: 'daysOpened', target: 1, tier: 'rookie' });
  });
});
