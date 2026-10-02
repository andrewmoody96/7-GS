// When check-offs count, when a game locks, and when it goes final (GAME_DESIGN §4).

import { CHECKOFF_CLOCK_SKEW_MS, FINALIZE_SETTLE_MINUTES } from './constants';
import type { LocalDate } from './dates';
import type { GameStatus, LineupRole } from './enums';
import { endOfLocalDay, startOfLocalDay, zonedTimeToInstant } from './time';

export const CHECKOFF_REJECTIONS = [
  'GAME_FINAL',
  'NOT_IN_LINEUP',
  'BEFORE_GAME_DAY',
  'AFTER_MIDNIGHT',
  'CLIENT_CLOCK_AHEAD',
] as const;
export type CheckoffRejection = (typeof CHECKOFF_REJECTIONS)[number];

export interface CheckoffInput {
  playedDate: LocalDate;
  timeZone: string;
  gameStatus: GameStatus;
  role: LineupRole;
  /** When the device says the task was completed (may be replayed from an offline queue). */
  clientAt: Date;
  /** When the server received it. */
  receivedAt: Date;
}

export type CheckoffValidation = { ok: true } | { ok: false; reason: CheckoffRejection };

export function validateCheckoff(input: CheckoffInput): CheckoffValidation {
  const no = (reason: CheckoffRejection): CheckoffValidation => ({ ok: false, reason });
  if (input.gameStatus === 'final') return no('GAME_FINAL');
  if (input.role !== 'lineup') return no('NOT_IN_LINEUP');
  const client = input.clientAt.getTime();
  if (client > input.receivedAt.getTime() + CHECKOFF_CLOCK_SKEW_MS) return no('CLIENT_CLOCK_AHEAD');
  if (client < startOfLocalDay(input.playedDate, input.timeZone).getTime()) return no('BEFORE_GAME_DAY');
  if (client >= endOfLocalDay(input.playedDate, input.timeZone).getTime()) return no('AFTER_MIDNIGHT');
  return { ok: true };
}

/** When the finalizer may close the game: local midnight plus the settle window. */
export function finalizeAfter(playedDate: LocalDate, timeZone: string): Date {
  return new Date(endOfLocalDay(playedDate, timeZone).getTime() + FINALIZE_SETTLE_MINUTES * 60_000);
}

/** The scheduled first-pitch instant, or null when the game locks only on first check-off. */
export function scheduledLockAt(playedDate: LocalDate, lockTime: string | null, timeZone: string): Date | null {
  return lockTime === null ? null : zonedTimeToInstant(playedDate, lockTime, timeZone);
}

/**
 * The game's lock instant: its recorded lock (first check-off or manual), or the
 * scheduled lock time once it has passed. null while the lineup is still editable.
 */
export function effectiveLockedAt(input: {
  lockedAt: Date | null;
  playedDate: LocalDate;
  lockTime: string | null;
  timeZone: string;
  now: Date;
}): Date | null {
  const scheduled = scheduledLockAt(input.playedDate, input.lockTime, input.timeZone);
  const candidates = [input.lockedAt, scheduled && scheduled.getTime() <= input.now.getTime() ? scheduled : null]
    .filter((d): d is Date => d !== null)
    .sort((a, b) => a.getTime() - b.getTime());
  return candidates[0] ?? null;
}
