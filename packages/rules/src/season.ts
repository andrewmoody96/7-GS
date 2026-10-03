// Season standings and pace toward the user's win goal (GAME_DESIGN §5).

import { GAMES_PER_SEASON } from './constants';
import type { GameResult, ResultDetail } from './enums';
import { scoreline } from './score';

export interface SeasonGame {
  result: GameResult | null;
  resultDetail?: ResultDetail | null;
  runs: number;
  threshold: number;
}

export interface SeasonRecord {
  played: number;
  wins: number;
  losses: number;
  rallyWins: number;
  /** null before the first final game. */
  winPct: number | null;
  /** Scoreboard runs for minus runs against, over final games (never a tie per game). */
  runDifferential: number;
}

export function seasonRecord(games: readonly SeasonGame[]): SeasonRecord {
  let wins = 0;
  let losses = 0;
  let rallyWins = 0;
  let runDifferential = 0;
  for (const g of games) {
    if (g.result === null) continue;
    if (g.result === 'W') wins++;
    else losses++;
    if (g.resultDetail === 'rally') rallyWins++;
    const line = scoreline(g);
    runDifferential += line.us - line.them;
  }
  const played = wins + losses;
  return {
    played,
    wins,
    losses,
    rallyWins,
    winPct: played === 0 ? null : Math.round((wins / played) * 1000) / 1000,
    runDifferential,
  };
}

export interface SeasonPace {
  played: number;
  remaining: number;
  /** Wins a team exactly on goal pace would have by now. */
  expectedWins: number;
  /** Positive = behind goal pace, negative = ahead. One decimal. */
  gamesBehind: number;
  onPace: boolean;
  /** null before the first final game. */
  projectedWins: number | null;
  winsNeeded: number;
  goalStillPossible: boolean;
}

export function seasonPace(wins: number, losses: number, winGoal: number): SeasonPace {
  const played = wins + losses;
  const remaining = Math.max(0, GAMES_PER_SEASON - played);
  const expectedWins = (winGoal * played) / GAMES_PER_SEASON;
  const gamesBehind = Math.round((expectedWins - wins) * 10) / 10;
  const winsNeeded = Math.max(0, winGoal - wins);
  return {
    played,
    remaining,
    expectedWins: Math.round(expectedWins * 10) / 10,
    gamesBehind: gamesBehind === 0 ? 0 : gamesBehind,
    onPace: gamesBehind <= 0,
    projectedWins: played === 0 ? null : Math.round((wins / played) * GAMES_PER_SEASON),
    winsNeeded,
    goalStillPossible: winsNeeded <= remaining,
  };
}
