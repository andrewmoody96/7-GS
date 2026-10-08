import type { z } from 'zod';
import type * as S from './schemas';

export * from './primitives';
export * from './schemas';
export * from './endpoints';

// Inferred types, e.g. `import type { Game } from '@7gs/contracts'`.
export type CalendarPositionDto = z.infer<typeof S.CalendarPosition>;
export type CalendarDto = z.infer<typeof S.Calendar>;
export type AllowancesDto = z.infer<typeof S.Allowances>;
export type MeDto = z.infer<typeof S.Me>;
export type MePatchDto = z.infer<typeof S.MePatch>;
export type SessionDto = z.infer<typeof S.Session>;
export type TaskDto = z.infer<typeof S.Task>;
export type TaskCreateDto = z.input<typeof S.TaskCreate>;
export type TaskUpdateDto = z.infer<typeof S.TaskUpdate>;
export type StarterDto = z.infer<typeof S.Starter>;
export type StarterPutDto = z.infer<typeof S.StarterPut>;
export type LineupEntryDto = z.infer<typeof S.LineupEntry>;
export type GameSummaryDto = z.infer<typeof S.GameSummary>;
export type GameDto = z.infer<typeof S.Game>;
export type OpponentDto = z.infer<typeof S.Opponent>;
export type SeriesDto = z.infer<typeof S.Series>;
export type TodayDto = z.infer<typeof S.Today>;
export type LineupPatchDto = z.infer<typeof S.LineupPatch>;
export type RainoutQuoteDto = z.infer<typeof S.RainoutQuote>;
export type RallyOddsBreakdownDto = z.infer<typeof S.RallyOddsBreakdown>;
export type RallyRollDto = z.infer<typeof S.RallyRoll>;
export type RallyQuoteDto = z.infer<typeof S.RallyQuote>;
export type RallyResultDto = z.infer<typeof S.RallyResult>;
export type SeasonDto = z.infer<typeof S.Season>;
export type ApiErrorDto = z.infer<typeof S.ApiError>;
export type WeekDto = z.infer<typeof S.Week>;
export type WeekSummaryDto = z.infer<typeof S.WeekSummary>;
export type WeekListDto = z.infer<typeof S.WeekList>;
export type IlHoldDto = z.infer<typeof S.IlHold>;
export type SuspensionQuoteDto = z.infer<typeof S.SuspensionQuote>;
