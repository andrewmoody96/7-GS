import { describe, expect, it } from 'vitest';
import {
  addDays,
  calendarPosition,
  gamesInSeason,
  headStartGames,
  isGameDay,
  plannableWeeks,
  seasonWindow,
  seriesStatus,
  weekday,
  weekPosition,
} from '../src';

const SIGNUP = '2026-10-02'; // a Friday

describe('season calendar', () => {
  it('opens season 1 on the first Monday on or after sign-up', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    expect(s1.start).toBe('2026-10-05');
    expect(weekday(s1.start)).toBe(1);
  });

  it('runs 12 series then a 1-week Review Week', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    expect(s1.playEnd).toBe(addDays(s1.start, 83));
    expect(s1.playEnd).toBe('2026-12-27');
    expect(weekday(s1.playEnd)).toBe(7);
    expect(s1.offseasonStart).toBe(addDays(s1.playEnd, 1));
    expect(s1.offseasonEnd).toBe(addDays(s1.playEnd, 7));
    expect(weekday(s1.offseasonEnd)).toBe(7);
  });

  it('starts each season 13 weeks after the last', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    const s2 = seasonWindow(SIGNUP, 2);
    expect(s2.start).toBe(addDays(s1.offseasonEnd, 1));
    expect(s2.start).toBe(addDays(s1.start, 91));
  });

  it('opens on sign-up day when the user signs up on a Monday', () => {
    expect(seasonWindow('2026-10-05', 1).start).toBe('2026-10-05');
  });

  it('places Spring Training before opening day', () => {
    expect(calendarPosition(SIGNUP, '2026-10-02')).toEqual({
      phase: 'preseason',
      seasonNumber: 1,
      openingDay: '2026-10-05',
      daysUntilOpeningDay: 3,
    });
    expect(isGameDay(SIGNUP, '2026-10-04')).toBe(false);
  });

  it('numbers series and games during the season', () => {
    expect(calendarPosition(SIGNUP, '2026-10-05')).toEqual({
      phase: 'season',
      seasonNumber: 1,
      seriesNumber: 1,
      gameNumber: 1,
      seriesStart: '2026-10-05',
      seriesEnd: '2026-10-11',
    });
    const lastGame = calendarPosition(SIGNUP, seasonWindow(SIGNUP, 1).playEnd);
    expect(lastGame).toMatchObject({ phase: 'season', seriesNumber: 12, gameNumber: 7 });
  });

  it('reports Review Week and the next opening day', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    const s2 = seasonWindow(SIGNUP, 2);
    expect(calendarPosition(SIGNUP, s1.offseasonStart)).toEqual({
      phase: 'offseason',
      seasonNumber: 1,
      nextSeasonStart: s2.start,
    });
    expect(calendarPosition(SIGNUP, s2.start)).toMatchObject({
      phase: 'season',
      seasonNumber: 2,
      seriesNumber: 1,
      gameNumber: 1,
    });
  });

  it('fits four seasons and four Review Weeks in 52 weeks', () => {
    const s5 = seasonWindow(SIGNUP, 5);
    expect(s5.start).toBe(addDays(seasonWindow(SIGNUP, 1).start, 364));
  });

  it('rejects invalid season numbers', () => {
    expect(() => seasonWindow(SIGNUP, 0)).toThrow(RangeError);
  });
});

describe('Head Start (starting before Opening Day)', () => {
  // Signed up Wednesday 30 September 2026 and chose to start that day.
  const EARLY = { startDate: '2026-09-30', headStartFrom: '2026-09-30' };

  it('plays the days left this week as series 0, with weekday-aligned game numbers', () => {
    expect(calendarPosition(EARLY, '2026-09-30')).toEqual({
      phase: 'season',
      seasonNumber: 1,
      seriesNumber: 0,
      gameNumber: 3,
      seriesStart: '2026-09-28',
      seriesEnd: '2026-10-04',
    });
    expect(calendarPosition(EARLY, '2026-10-04')).toMatchObject({ seriesNumber: 0, gameNumber: 7 });
    expect(isGameDay(EARLY, '2026-09-29')).toBe(false);
  });

  it('still opens series 1 on the following Monday', () => {
    expect(calendarPosition(EARLY, '2026-10-05')).toMatchObject({ phase: 'season', seriesNumber: 1, gameNumber: 1, seriesStart: '2026-10-05' });
    expect(seasonWindow(EARLY, 1)).toMatchObject({ start: '2026-09-30', playEnd: '2026-12-27' });
    expect(seasonWindow(EARLY, 2).start).toBe('2027-01-04');
  });

  it('adds its games to the season total', () => {
    expect(headStartGames(EARLY)).toBe(5);
    expect(gamesInSeason(EARLY, 1)).toBe(89);
    expect(gamesInSeason(EARLY, 2)).toBe(84);
    expect(gamesInSeason('2026-09-30', 1)).toBe(84);
  });

  it('can start later in the same week, but never after Opening Day', () => {
    const friday = { startDate: '2026-09-30', headStartFrom: '2026-10-02' };
    expect(calendarPosition(friday, '2026-10-01').phase).toBe('preseason');
    expect(calendarPosition(friday, '2026-10-02')).toMatchObject({ phase: 'season', seriesNumber: 0, gameNumber: 5 });
    expect(headStartGames({ startDate: '2026-09-30', headStartFrom: '2026-10-06' })).toBe(0);
  });

  it('finds the Head Start week by its Monday and lets it be planned', () => {
    expect(weekPosition(EARLY, '2026-09-28')).toMatchObject({ seriesNumber: 0 });
    expect(weekPosition(EARLY, '2026-10-05')).toMatchObject({ seriesNumber: 1 });
    expect(weekPosition('2026-09-30', '2026-09-28')).toBeNull();
    expect(plannableWeeks(EARLY, '2026-09-30')).toEqual(['2026-09-28']);
    expect(plannableWeeks(EARLY, '2026-10-02')).toEqual(['2026-09-28', '2026-10-05']);
  });

  it('is never scored as a series', () => {
    const games = [3, 4, 5, 6, 7].map((gameNumber) => ({ gameNumber, result: 'W' as const }));
    expect(seriesStatus(games, { unscored: true })).toMatchObject({
      wins: 5,
      losses: 0,
      result: null,
      complete: true,
      situation: 'complete',
      sweepWatch: false,
      label: 'Head Start 5–0',
    });
    expect(seriesStatus(games.slice(0, 2).concat([{ gameNumber: 5, result: null as never }]), { unscored: true })).toMatchObject({
      remaining: 1,
      complete: false,
      situation: 'normal',
    });
  });
});
