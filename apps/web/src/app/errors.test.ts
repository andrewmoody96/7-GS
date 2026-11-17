import { describe, expect, it } from 'vitest';
import { ApiError } from '../api/client';
import { errorMessage } from './errors';

describe('error messages', () => {
  it('calls a server bug what it is, not a conflict', () => {
    const internal = ApiError.fromResponse(500, { error: { code: 'CONFLICT', message: 'x', reason: 'INTERNAL' } });
    expect(errorMessage(internal)).toBe('Something went wrong on our side. Try again in a minute.');
    const conflict = ApiError.fromResponse(409, { error: { code: 'CONFLICT', message: 'x' } });
    expect(errorMessage(conflict)).toMatch(/conflicts with a recent change/);
  });
});
