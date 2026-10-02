import { describe, expect, it } from 'vitest';
import { addDays, calendarPosition, isGameDay, seasonWindow, weekday } from '../src';

const SIGNUP = '2026-10-02'; // a Friday

describe('season calendar', () => {
  it('opens season 1 on the first Monday on or after sign-up', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    expect(s1.start).toBe('2026-10-05');
    expect(weekday(s1.start)).toBe(1);
  });

  it('runs 25 series then a 1-week Review Week', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    expect(s1.playEnd).toBe(addDays(s1.start, 174));
    expect(weekday(s1.playEnd)).toBe(7);
    expect(s1.offseasonStart).toBe(addDays(s1.playEnd, 1));
    expect(s1.offseasonEnd).toBe(addDays(s1.playEnd, 7));
    expect(weekday(s1.offseasonEnd)).toBe(7);
  });

  it('starts each season 26 weeks after the last', () => {
    const s1 = seasonWindow(SIGNUP, 1);
    const s2 = seasonWindow(SIGNUP, 2);
    expect(s2.start).toBe(addDays(s1.offseasonEnd, 1));
    expect(s2.start).toBe(addDays(s1.start, 182));
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
    expect(lastGame).toMatchObject({ phase: 'season', seriesNumber: 25, gameNumber: 7 });
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

  it('fits two seasons and two Review Weeks in 52 weeks', () => {
    const s3 = seasonWindow(SIGNUP, 3);
    expect(s3.start).toBe(addDays(seasonWindow(SIGNUP, 1).start, 364));
  });

  it('rejects invalid season numbers', () => {
    expect(() => seasonWindow(SIGNUP, 0)).toThrow(RangeError);
  });
});
