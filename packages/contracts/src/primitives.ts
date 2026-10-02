import { isLocalDate, isTimeOfDay, isValidTimeZone, LIMITS } from '@7gs/rules';
import { z } from 'zod';

export const Id = z.uuid();
export const LocalDate = z.string().refine(isLocalDate, 'Expected a calendar date as YYYY-MM-DD');
export const MonthKey = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Expected YYYY-MM');
export const TimeOfDay = z.string().refine(isTimeOfDay, 'Expected a 24-hour time as HH:MM');
export const Instant = z.iso.datetime({ offset: true });
export const TimeZone = z.string().refine(isValidTimeZone, 'Unknown IANA time zone');
export const HexColor = z.string().regex(/^#[0-9A-Fa-f]{6}$/);

export const Weekday = z.number().int().min(1).max(7);
export const Points = z.number().int().min(1).max(LIMITS.pointsMax);
/** At least 1, so an empty or untouched lineup can never win. */
export const Threshold = z.number().int().min(1).max(LIMITS.thresholdMax);
export const MinTasks = z.number().int().min(1).max(LIMITS.minTasksMax).nullable();
export const Count = z.number().int().min(0);
