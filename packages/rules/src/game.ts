// Deciding a game (GAME_DESIGN §4). The same function gives the live projection during
// the day and the final result at midnight.

import type { GameResult, LineupRole, ResultDetail } from './enums';

export interface EntryState {
  points: number;
  required: boolean;
  role: LineupRole;
  completed: boolean;
  /** "Warning track": a must-hit the user marked as partly done. */
  partial?: boolean;
}

export interface GameRules {
  /** Runs to win. Contracts enforce >= 1, so an empty lineup can't win. */
  threshold: number;
  minTasks: number | null;
}

export interface GameEvaluation {
  runs: number;
  tasksDone: number;
  /** Lineup tasks that count toward the game (excludes bench and subbed-out). */
  lineupSize: number;
  requiredTotal: number;
  missedRequired: number;
  runsNeeded: number;
  tasksNeeded: number;
  runsMet: boolean;
  minMet: boolean;
  result: GameResult;
  detail: Exclude<ResultDetail, 'rally' | 'suspended'>;
  /** The loss can be appealed with a Rally Cap (at most one missed must-hit). */
  rallyEligible: boolean;
  /** Exactly one must-hit was missed and it was marked partial. */
  partialOnMissed: boolean;
}

export function evaluateGame(entries: readonly EntryState[], rules: GameRules): GameEvaluation {
  const lineup = entries.filter((e) => e.role === 'lineup');
  const done = lineup.filter((e) => e.completed);
  const missed = lineup.filter((e) => e.required && !e.completed);

  const runs = done.reduce((sum, e) => sum + e.points, 0);
  const tasksDone = done.length;
  const missedRequired = missed.length;
  const runsMet = runs >= rules.threshold;
  const minMet = rules.minTasks === null || tasksDone >= rules.minTasks;

  let detail: GameEvaluation['detail'];
  if (missedRequired >= 2) detail = 'no_appeal';
  else if (missedRequired === 1) detail = 'forfeit';
  else if (!runsMet || !minMet) detail = 'short';
  else detail = 'clean';

  const result: GameResult = detail === 'clean' ? 'W' : 'L';

  return {
    runs,
    tasksDone,
    lineupSize: lineup.length,
    requiredTotal: lineup.filter((e) => e.required).length,
    missedRequired,
    runsNeeded: Math.max(0, rules.threshold - runs),
    tasksNeeded: rules.minTasks === null ? 0 : Math.max(0, rules.minTasks - tasksDone),
    runsMet,
    minMet,
    result,
    detail,
    rallyEligible: result === 'L' && missedRequired <= 1,
    partialOnMissed: missedRequired === 1 && missed[0]?.partial === true,
  };
}
