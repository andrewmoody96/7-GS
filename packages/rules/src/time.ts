// Converting between instants and wall-clock times in IANA time zones using Intl only.

import { addDays, compareDates, formatLocalDate, type LocalDate } from './dates';

const TIME_OF_DAY_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
const formatters = new Map<string, Intl.DateTimeFormat>();

function formatter(timeZone: string): Intl.DateTimeFormat {
  let f = formatters.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    formatters.set(timeZone, f);
  }
  return f;
}

interface WallClock {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

function wallClock(instant: Date, timeZone: string): WallClock {
  const parts = formatter(timeZone).formatToParts(instant);
  const get = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((p) => p.type === type)?.value);
  return {
    year: get('year'),
    month: get('month'),
    day: get('day'),
    hour: get('hour') % 24,
    minute: get('minute'),
    second: get('second'),
  };
}

/** Milliseconds to add to UTC to get wall-clock time in `timeZone` at `instant`. */
function offsetMs(instant: Date, timeZone: string): number {
  const w = wallClock(instant, timeZone);
  const wallAsUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second);
  return wallAsUtc - Math.floor(instant.getTime() / 1000) * 1000;
}

export function isValidTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat('en-US', { timeZone });
    return true;
  } catch {
    return false;
  }
}

export function isTimeOfDay(value: string): boolean {
  return TIME_OF_DAY_RE.test(value);
}

/** The user's calendar date at `instant`. */
export function localDateOf(instant: Date, timeZone: string): LocalDate {
  const w = wallClock(instant, timeZone);
  return formatLocalDate(w.year, w.month, w.day);
}

/** 'HH:MM' wall-clock time at `instant` in `timeZone`. */
export function localTimeOf(instant: Date, timeZone: string): string {
  const w = wallClock(instant, timeZone);
  return `${String(w.hour).padStart(2, '0')}:${String(w.minute).padStart(2, '0')}`;
}

/**
 * The instant when the wall clock in `timeZone` reads `time` on `date`.
 * If that wall time is skipped by a DST jump, returns the first instant after the gap.
 */
export function zonedTimeToInstant(date: LocalDate, time: string, timeZone: string): Date {
  const m = TIME_OF_DAY_RE.exec(time);
  if (!m) throw new RangeError(`Invalid time of day: ${time}`);
  const [y, mo, d] = date.split('-').map(Number) as [number, number, number];
  const wall = Date.UTC(y, mo - 1, d, Number(m[1]), Number(m[2]));

  let instant = wall - offsetMs(new Date(wall), timeZone);
  const secondOffset = offsetMs(new Date(instant), timeZone);
  if (wall - secondOffset !== instant) instant = wall - secondOffset;

  // Inside a DST gap the result lands before the requested wall time; step forward.
  const target = `${date} ${time}`;
  for (let i = 0; i < 12; i++) {
    const at = new Date(instant);
    const label = `${localDateOf(at, timeZone)} ${localTimeOf(at, timeZone)}`;
    if (label >= target) break;
    instant += 15 * 60 * 1000;
  }
  return new Date(instant);
}

/** First instant of `date` in `timeZone`. */
export function startOfLocalDay(date: LocalDate, timeZone: string): Date {
  return zonedTimeToInstant(date, '00:00', timeZone);
}

/** First instant after `date` ends in `timeZone` (the next local midnight). */
export function endOfLocalDay(date: LocalDate, timeZone: string): Date {
  return startOfLocalDay(addDays(date, 1), timeZone);
}

/** True when `instant` falls on `date` in `timeZone`. */
export function isOnLocalDate(instant: Date, date: LocalDate, timeZone: string): boolean {
  return compareDates(localDateOf(instant, timeZone), date) === 0;
}
