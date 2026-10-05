// Series state and broadcast-style labels (GAME_DESIGN §5). All 7 games are always
// played; the series is decided by whoever reaches 4 wins first.

import { RAINOUT, SERIES_LENGTH, WINS_TO_CLINCH } from './constants';
import type { LocalDate } from './dates';
import type { GameResult, SeriesResult } from './enums';

export interface SeriesGameState {
  gameNumber: number;
  playedDate?: LocalDate;
  slot?: number;
  postponed?: boolean;
  /** null until the game is final, and for a no-decision (suspended) final. */
  result: GameResult | null;
  /** Final with no decision (a suspended game that couldn't be resumed). */
  noDecision?: boolean;
  /** Scoreboard runs for minus against (rules.scoreline); breaks a tied series. */
  runDiff?: number;
}

export type SeriesSituation =
  | 'normal'
  | 'clinch' // one win from taking the series
  | 'elimination' // one loss from losing the series
  | 'game7' // tied 3–3
  | 'decided' // result known, games still to play
  | 'complete';

export interface SeriesStatus {
  wins: number;
  losses: number;
  played: number;
  remaining: number;
  result: SeriesResult | null;
  /** Chronological game count when the series was decided (e.g. 5 for a 4–1 clinch). */
  decidedAfter: number | null;
  complete: boolean;
  situation: SeriesSituation;
  /** No losses yet and at least 3 wins, with games left. */
  sweepWatch: boolean;
  /** Won after trailing 0–3 or 1–3. */
  comeback: boolean;
  /** Finals with no decision (suspended games). */
  noDecisions: number;
  label: string;
}

function chronological(games: readonly SeriesGameState[]): SeriesGameState[] {
  return [...games].sort((a, b) => {
    const da = a.playedDate ?? '';
    const db = b.playedDate ?? '';
    if (da && db && da !== db) return da < db ? -1 : 1;
    if (da === db && (a.slot ?? 1) !== (b.slot ?? 1)) return (a.slot ?? 1) - (b.slot ?? 1);
    return a.gameNumber - b.gameNumber;
  });
}

export function seriesStatus(games: readonly SeriesGameState[]): SeriesStatus {
  let wins = 0;
  let losses = 0;
  let result: SeriesResult | null = null;
  let decidedAfter: number | null = null;
  let trailedBadly = false;
  let played = 0;
  let noDecisions = 0;
  let runDiff = 0;

  for (const game of chronological(games)) {
    if (game.noDecision) noDecisions++;
    if (game.result === null) continue;
    runDiff += game.runDiff ?? 0;
    played++;
    if (game.result === 'W') wins++;
    else losses++;
    if (losses === WINS_TO_CLINCH - 1 && wins <= 1) trailedBadly = true;
    if (result === null && wins === WINS_TO_CLINCH) {
      result = 'won';
      decidedAfter = played;
    } else if (result === null && losses === WINS_TO_CLINCH) {
      result = 'lost';
      decidedAfter = played;
    }
  }

  const complete = played + noDecisions >= SERIES_LENGTH;
  const remaining = Math.max(0, SERIES_LENGTH - played - noDecisions);
  // A no-decision can leave a finished series tied: run differential breaks it.
  let split = false;
  if (complete && result === null) {
    if (wins !== losses) result = wins > losses ? 'won' : 'lost';
    else if (runDiff !== 0) result = runDiff > 0 ? 'won' : 'lost';
    else split = true;
  }

  let situation: SeriesSituation;
  if (complete) situation = 'complete';
  else if (result !== null) situation = 'decided';
  else if (wins === 3 && losses === 3) situation = 'game7';
  else if (losses === 3) situation = 'elimination';
  else if (wins === 3) situation = 'clinch';
  else situation = 'normal';

  const score = `${wins}–${losses}`;
  let label: string;
  if (complete && split) label = `Series split ${score}`;
  else if (complete) label = result === 'won' ? `Won series ${score}` : `Lost series ${score}`;
  else if (result === 'won') label = `Clinched ${score}`;
  else if (result === 'lost') label = `Eliminated ${score}`;
  else if (wins === losses) label = `Series tied ${score}`;
  else label = wins > losses ? `Leads ${score}` : `Trails ${score}`;

  return {
    wins,
    losses,
    played,
    remaining,
    result,
    decidedAfter,
    complete,
    situation,
    sweepWatch: !complete && losses === 0 && wins >= 3,
    comeback: result === 'won' && trailedBadly,
    noDecisions,
    label,
  };
}

/** Iron Man (GAME_DESIGN §7): all 7 games played as scheduled (no rainouts or suspensions), 5+ wins. */
export function isIronMan(games: readonly SeriesGameState[]): boolean {
  const status = seriesStatus(games);
  return (
    status.complete &&
    status.wins >= RAINOUT.ironManMinWins &&
    games.every((g) => !g.postponed && !g.noDecision)
  );
}
