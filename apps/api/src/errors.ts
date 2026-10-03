// Every error leaves the API in the contracts' ApiError shape:
// { error: { code, message, reason?, issues? } }.

import type { ErrorCode } from '@7gs/contracts';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import type { z } from 'zod';

export interface Issue {
  path: string;
  message: string;
}

export class ApiException extends Error {
  constructor(
    readonly status: ContentfulStatusCode,
    readonly code: ErrorCode,
    message: string,
    readonly reason?: string,
    readonly issues?: Issue[],
  ) {
    super(message);
    this.name = 'ApiException';
  }

  toBody(): { error: { code: ErrorCode; message: string; reason?: string; issues?: Issue[] } } {
    return {
      error: {
        code: this.code,
        message: this.message,
        ...(this.reason !== undefined ? { reason: this.reason } : {}),
        ...(this.issues !== undefined ? { issues: this.issues } : {}),
      },
    };
  }
}

export function unauthorized(message = 'Sign in to continue.'): ApiException {
  return new ApiException(401, 'UNAUTHORIZED', message);
}

export function notFound(what: string): ApiException {
  return new ApiException(404, 'NOT_FOUND', `${what} not found.`);
}

export function validationFailed(issues: Issue[], message = 'The request is invalid.'): ApiException {
  return new ApiException(400, 'VALIDATION_FAILED', message, undefined, issues);
}

export function zodIssues(error: z.ZodError): Issue[] {
  return error.issues.map((issue) => ({
    path: issue.path.map(String).join('.'),
    message: issue.message,
  }));
}

/** 409 with a specific code, e.g. conflict('GAME_LOCKED', 'First pitch has passed…'). */
export function conflict(code: ErrorCode, message: string, reason?: string): ApiException {
  return new ApiException(409, code, message, reason);
}
