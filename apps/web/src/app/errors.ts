import { RAINOUT_INELIGIBLE_REASONS, RALLY_INELIGIBLE_REASONS, SUSPENSION_INELIGIBLE_REASONS } from '@7gs/rules';
import { isApiError } from '../api/client';
import { vocab } from '../vocab';

const rallyReasons = new Set<string>(RALLY_INELIGIBLE_REASONS);
const rainoutReasons = new Set<string>(RAINOUT_INELIGIBLE_REASONS);
const suspensionReasons = new Set<string>(SUSPENSION_INELIGIBLE_REASONS);

/** A user-facing message for any error thrown by the API client. */
export function errorMessage(error: unknown): string {
  if (!isApiError(error)) return 'Something went wrong. Try again.';
  if (error.code === 'NETWORK') return 'You’re offline. Try again when you’re back in range.';
  if (error.code === 'SERVER') return 'The ballpark’s systems are down. Try again in a minute.';
  if (error.reason && rallyReasons.has(error.reason)) {
    return vocab.rallyReason[error.reason as keyof typeof vocab.rallyReason];
  }
  if (error.reason === 'WEEK_LOCKED') return `${vocab.week.lockedTitle}. ${vocab.week.lockedBlurb}`;
  if (error.reason && suspensionReasons.has(error.reason) && !rainoutReasons.has(error.reason) && !rallyReasons.has(error.reason)) {
    return vocab.suspension.reason[error.reason as keyof typeof vocab.suspension.reason];
  }
  if (error.reason && rainoutReasons.has(error.reason)) {
    return vocab.rainoutReason[error.reason as keyof typeof vocab.rainoutReason];
  }
  if (error.code === 'NOT_ELIGIBLE' || error.code === 'VALIDATION_FAILED') {
    return error.message || vocab.error[error.code];
  }
  return vocab.error[error.code];
}
