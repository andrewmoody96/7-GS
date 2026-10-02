import { describe, expect, it } from 'vitest';
import {
  currentWinStreak,
  isIronMan,
  longestWinStreak,
  seasonPace,
  seasonRecord,
  seriesStatus,
  taskStreaks,
  type GameResult,
  type SeriesGameState,
} from '../src';

function games(results: (GameResult | null)[], extra: Partial<SeriesGameState> = {}): SeriesGameState[] {
  return results.map((result, i) => ({ gameNumber: i + 1, result, ...extra }));
}

describe('seriesStatus', () => {
  it('labels a series in progress', () => {
    expect(seriesStatus(games([null, null, null, null, null, null, null])).label).toBe('Series tied 0–0');
    expect(seriesStatus(games(['W', 'W', 'L', null, null, null, null]))).toMatchObject({
      label: 'Leads 2–1',
      situation: 'normal',
    });
    expect(seriesStatus(games(['L', 'L', 'W', null, null, null, null])).label).toBe('Trails 1–2');
  });

  it('flags clinch, elimination and Game 7 situations', () => {
    expect(seriesStatus(games(['W', 'W', 'W', 'L', null, null, null])).situation).toBe('clinch');
    expect(seriesStatus(games(['L', 'L', 'L', 'W', null, null, null])).situation).toBe('elimination');
    expect(seriesStatus(games(['W', 'L', 'W', 'L', 'W', 'L', null])).situation).toBe('game7');
  });

  it('decides the series at 4 wins but keeps playing', () => {
    const s = seriesStatus(games(['W', 'W', 'L', 'W', 'W', null, null]));
    expect(s).toMatchObject({ result: 'won', decidedAfter: 5, situation: 'decided', label: 'Clinched 4–1', remaining: 2 });
  });

  it('reports the final week record once all 7 are played', () => {
    const s = seriesStatus(games(['W', 'W', 'L', 'W', 'W', 'L', 'W']));
    expect(s).toMatchObject({ result: 'won', complete: true, label: 'Won series 5–2', decidedAfter: 5 });
    expect(seriesStatus(games(['L', 'L', 'L', 'L', 'W', 'W', 'L'])).label).toBe('Lost series 2–5');
    expect(seriesStatus(games(['L', 'L', 'L', 'L', null, null, null])).label).toBe('Eliminated 0–4');
  });

  it('spots sweep watch and comebacks', () => {
    expect(seriesStatus(games(['W', 'W', 'W', null, null, null, null])).sweepWatch).toBe(true);
    const comeback = seriesStatus(games(['L', 'W', 'L', 'L', 'W', 'W', 'W']));
    expect(comeback).toMatchObject({ result: 'won', comeback: true });
    expect(seriesStatus(games(['L', 'L', 'W', 'W', 'L', 'W', 'W'])).comeback).toBe(false);
  });

  it('orders doubleheaders by played date and slot', () => {
    // Game 2 was rained out and made up as the second game on Wednesday.
    const s = seriesStatus([
      { gameNumber: 1, playedDate: '2026-10-05', slot: 1, result: 'W' },
      { gameNumber: 2, playedDate: '2026-10-07', slot: 2, postponed: true, result: 'W' },
      { gameNumber: 3, playedDate: '2026-10-07', slot: 1, result: 'W' },
      { gameNumber: 4, playedDate: '2026-10-08', slot: 1, result: 'W' },
    ]);
    expect(s.decidedAfter).toBe(4);
  });
});

describe('Iron Man', () => {
  it('requires all 7 games as scheduled and at least 5 wins', () => {
    expect(isIronMan(games(['W', 'W', 'L', 'W', 'W', 'L', 'W']))).toBe(true);
    expect(isIronMan(games(['W', 'W', 'L', 'W', 'L', 'L', 'W']))).toBe(false);
    const withRainout = games(['W', 'W', 'W', 'W', 'W', 'W', 'W']);
    withRainout[2] = { ...withRainout[2]!, postponed: true };
    expect(isIronMan(withRainout)).toBe(false);
  });
});

describe('streaks', () => {
  it('counts trailing wins', () => {
    expect(currentWinStreak(['W', 'L', 'W', 'W'])).toBe(2);
    expect(currentWinStreak([])).toBe(0);
    expect(longestWinStreak(['W', 'W', 'W', 'L', 'W'])).toBe(3);
  });

  it('tracks task streaks over lineup appearances only', () => {
    expect(taskStreaks([true, true, false, true, true, true])).toEqual({ current: 3, longest: 3 });
    expect(taskStreaks([true, false])).toEqual({ current: 0, longest: 1 });
  });
});

describe('season standings', () => {
  it('aggregates wins, losses, rally wins and run differential', () => {
    const record = seasonRecord([
      { result: 'W', resultDetail: 'clean', runs: 6, threshold: 4 },
      { result: 'W', resultDetail: 'rally', runs: 3, threshold: 4 },
      { result: 'L', resultDetail: 'short', runs: 2, threshold: 5 },
      { result: null, runs: 0, threshold: 3 },
    ]);
    expect(record).toEqual({ played: 3, wins: 2, losses: 1, rallyWins: 1, winPct: 0.667, runDifferential: -2 });
  });

  it('measures pace against the win goal', () => {
    // Goal 120 of 175. After 35 games, goal pace is 24 wins.
    expect(seasonPace(20, 15, 120)).toMatchObject({ expectedWins: 24, gamesBehind: 4, onPace: false, projectedWins: 100 });
    expect(seasonPace(26, 9, 120)).toMatchObject({ gamesBehind: -2, onPace: true });
    expect(seasonPace(0, 0, 120)).toMatchObject({ gamesBehind: 0, onPace: true, projectedWins: null });
  });

  it('knows when the goal is out of reach', () => {
    expect(seasonPace(10, 150, 120)).toMatchObject({ winsNeeded: 110, remaining: 15, goalStillPossible: false });
  });
});
