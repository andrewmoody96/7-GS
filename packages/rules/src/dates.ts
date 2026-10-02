// Local calendar dates as 'YYYY-MM-DD' strings. Game days are calendar dates in the
// user's time zone, never instants, so all arithmetic here is time-zone free.

export type LocalDate = string;

/** 1 = Monday … 7 = Sunday (ISO weekday). */
export type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

const DAY_MS = 86_400_000;
const LOCAL_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function toUtcMs(date: LocalDate): number {
  const m = LOCAL_DATE_RE.exec(date);
  if (!m) throw new RangeError(`Invalid LocalDate: ${date}`);
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  if (fromUtcMs(ms) !== date) throw new RangeError(`Invalid LocalDate: ${date}`);
  return ms;
}

function pad(n: number, width = 2): string {
  return String(n).padStart(width, '0');
}

function fromUtcMs(ms: number): LocalDate {
  const dt = new Date(ms);
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function formatLocalDate(year: number, month: number, day: number): LocalDate {
  return `${pad(year, 4)}-${pad(month)}-${pad(day)}`;
}

export function isLocalDate(value: string): boolean {
  try {
    toUtcMs(value);
    return true;
  } catch {
    return false;
  }
}

export function addDays(date: LocalDate, days: number): LocalDate {
  return fromUtcMs(toUtcMs(date) + days * DAY_MS);
}

/** Whole days from `b` to `a` (positive when `a` is later). */
export function diffDays(a: LocalDate, b: LocalDate): number {
  return Math.round((toUtcMs(a) - toUtcMs(b)) / DAY_MS);
}

export function compareDates(a: LocalDate, b: LocalDate): number {
  toUtcMs(a);
  toUtcMs(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

export function weekday(date: LocalDate): Weekday {
  const day = new Date(toUtcMs(date)).getUTCDay();
  return (day === 0 ? 7 : day) as Weekday;
}

/** The Monday that starts the series containing `date`. */
export function startOfWeek(date: LocalDate): LocalDate {
  return addDays(date, 1 - weekday(date));
}

export function nextMondayOnOrAfter(date: LocalDate): LocalDate {
  const w = weekday(date);
  return w === 1 ? date : addDays(date, 8 - w);
}

/** 'YYYY-MM', used to key monthly allowances. */
export function monthKey(date: LocalDate): string {
  toUtcMs(date);
  return date.slice(0, 7);
}
