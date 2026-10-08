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
  /** Suspended games that ended with no decision. */
  noDecisions: number;
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
  let noDecisions = 0;
  for (const g of games) {
    if (g.resultDetail === 'suspended') noDecisions++;
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
    noDecisions,
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

/**
 * Pace toward `winGoal`. No-decisions (suspended games) shrink the season's decidable
 * games, so the goal stays the same over fewer games.
 */
export function seasonPace(wins: number, losses: number, winGoal: number, noDecisions = 0): SeasonPace {
  const played = wins + losses;
  const decidable = Math.max(1, GAMES_PER_SEASON - noDecisions);
  const remaining = Math.max(0, decidable - played);
  const expectedWins = (winGoal * played) / decidable;
  const gamesBehind = Math.round((expectedWins - wins) * 10) / 10;
  const winsNeeded = Math.max(0, winGoal - wins);
  return {
    played,
    remaining,
    expectedWins: Math.round(expectedWins * 10) / 10,
    gamesBehind: gamesBehind === 0 ? 0 : gamesBehind,
    onPace: gamesBehind <= 0,
    projectedWins: played === 0 ? null : Math.round((wins / played) * decidable),
    winsNeeded,
    goalStillPossible: winsNeeded <= remaining,
  };
}
