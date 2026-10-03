// Display formatting. Game dates are local calendar dates, so they're formatted as UTC
// midnights to avoid any time-zone shift; instants use the user's IANA zone.

import { scoreline, type LocalDate, type ScoreInput } from '@7gs/rules';

const MINUS = '−';

function utcDate(date: LocalDate): Date {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d));
}

const cache = new Map<string, Intl.DateTimeFormat>();
function fmt(key: string, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  let f = cache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', options);
    cache.set(key, f);
  }
  return f;
}

/** "Fri, Oct 2" */
export function formatDate(date: LocalDate): string {
  return fmt('date', { timeZone: 'UTC', weekday: 'short', month: 'short', day: 'numeric' }).format(utcDate(date));
}

/** "Friday, October 2" */
export function formatDateLong(date: LocalDate): string {
  return fmt('dateLong', { timeZone: 'UTC', weekday: 'long', month: 'long', day: 'numeric' }).format(utcDate(date));
}

/** "Oct 2" */
export function formatMonthDay(date: LocalDate): string {
  return fmt('md', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(utcDate(date));
}

/** "Fri" */
export function weekdayShort(date: LocalDate): string {
  return fmt('wd', { timeZone: 'UTC', weekday: 'short' }).format(utcDate(date));
}

/** "Friday" */
export function weekdayLong(date: LocalDate): string {
  return fmt('wdl', { timeZone: 'UTC', weekday: 'long' }).format(utcDate(date));
}

/** "Sep 28 – Oct 4" */
export function formatRange(start: LocalDate, end: LocalDate): string {
  return `${formatMonthDay(start)} – ${formatMonthDay(end)}`;
}

/** "9:02 AM" for an instant, in the user's zone. */
export function formatTime(instant: string | Date, timeZone?: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return fmt(`time:${timeZone ?? ''}`, { timeZone, hour: 'numeric', minute: '2-digit' }).format(d);
}

/** "Sat 11:59 AM" for an instant, in the user's zone. */
export function formatDayTime(instant: string | Date, timeZone?: string): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  return fmt(`daytime:${timeZone ?? ''}`, { timeZone, weekday: 'short', hour: 'numeric', minute: '2-digit' }).format(d);
}

/**
 * An exclusive deadline as people say it: the rules close the Rally Cap window at
 * 12:00 (exclusive), which the design calls "11:59 a.m.", so show the last minute.
 */
export function formatDeadline(instant: string | Date, timeZone?: string, withDay = false): string {
  const d = typeof instant === 'string' ? new Date(instant) : instant;
  const last = new Date(d.getTime() - 60_000);
  return withDay ? formatDayTime(last, timeZone) : formatTime(last, timeZone);
}

/** "09:00" → "9:00 AM" */
export function formatTimeOfDay(time: string): string {
  const [h, m] = time.split(':').map(Number) as [number, number];
  const suffix = h >= 12 ? 'PM' : 'AM';
  const hour = h % 12 === 0 ? 12 : h % 12;
  return `${hour}:${String(m).padStart(2, '0')} ${suffix}`;
}

/** Baseball-style win percentage: 0.697 → ".697", 1 → "1.000". */
export function formatWinPct(pct: number | null): string {
  if (pct === null) return '.000';
  return pct >= 1 ? '1.000' : pct.toFixed(3).replace(/^0/, '');
}

/** "+16", "−4", "0" */
export function signed(n: number): string {
  if (n > 0) return `+${n}`;
  if (n < 0) return `${MINUS}${Math.abs(n)}`;
  return '0';
}

/** "2–1" with an en dash, the way series scores are written. */
export function score(a: number, b: number): string {
  return `${a}–${b}`;
}

/** Scoreboard score, yours first. Finals are never tied (see rules `scoreline`). */
export function gameScore(game: ScoreInput): string {
  const line = scoreline(game);
  return score(line.us, line.them);
}

/** "a", "a and b", "a, b and c" */
export function joinList(parts: readonly string[]): string {
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts.at(-1)}`;
}

/** Initials for a team badge: "Early Risers" → "ER". */
export function initials(name: string, max = 3): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .map((w) => w[0]?.toUpperCase() ?? '')
    .join('')
    .slice(0, max);
}
