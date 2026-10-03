// One typed client interface generated from the contracts `endpoints` registry, with
// two interchangeable transports: `http` (the real API) and `mock` (in-browser fake).

import {
  ApiError as ApiErrorSchema,
  endpoints,
  type EndpointName,
  type ErrorCode,
  type PathParams,
  type RequestBody,
  type ResponseBody,
} from '@7gs/contracts';

export type ApiMode = 'mock' | 'http';

type ParamsOption<N extends EndpointName> = keyof PathParams<N> extends never
  ? { params?: undefined }
  : { params: PathParams<N> };

type BodyOption<N extends EndpointName> = RequestBody<N> extends undefined
  ? { body?: undefined }
  : { body: RequestBody<N> };

export type CallOptions<N extends EndpointName> = ParamsOption<N> &
  BodyOption<N> & {
    headers?: Record<string, string>;
    signal?: AbortSignal;
  };

type RequiredKeys<T> = { [K in keyof T]-?: object extends Pick<T, K> ? never : K }[keyof T];

/** Options may be omitted when an endpoint has no path params and no body. */
export type CallArgs<N extends EndpointName> =
  RequiredKeys<CallOptions<N>> extends never ? [options?: CallOptions<N>] : [options: CallOptions<N>];

export interface ApiClient {
  readonly mode: ApiMode;
  call<N extends EndpointName>(name: N, ...args: CallArgs<N>): Promise<ResponseBody<N>>;
  /** The transport's clock. The mock runs a demo clock; http uses the device clock. */
  now(): Date;
}

/** Loosely typed view used inside transports, where generics get in the way. */
export interface RawCallOptions {
  params?: Record<string, string | number>;
  body?: unknown;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

export interface ApiErrorIssue {
  path: string;
  message: string;
}

/** Contract codes, plus client-side ones for "never reached the API" and opaque 5xx. */
export type ClientErrorCode = ErrorCode | 'NETWORK' | 'SERVER';

/** A failed API call. `status` 0 means the request never reached the server. */
export class ApiError extends Error {
  readonly status: number;
  readonly code: ClientErrorCode;
  readonly reason: string | undefined;
  readonly issues: ApiErrorIssue[] | undefined;

  constructor(
    status: number,
    code: ClientErrorCode,
    message: string,
    extra: { reason?: string; issues?: ApiErrorIssue[] } = {},
  ) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.reason = extra.reason;
    this.issues = extra.issues;
  }

  get isNetwork(): boolean {
    return this.code === 'NETWORK';
  }

  /** Builds an ApiError from an error response body (the contract `ApiError` shape). */
  static fromResponse(status: number, body: unknown): ApiError {
    const parsed = ApiErrorSchema.safeParse(body);
    if (parsed.success) {
      const { code, message, reason, issues } = parsed.data.error;
      return new ApiError(status, code, message, { reason, issues });
    }
    if (status >= 500) return new ApiError(status, 'SERVER', `Server error (${status})`);
    const fallback: ErrorCode =
      status === 401 ? 'UNAUTHORIZED' : status === 404 ? 'NOT_FOUND' : status === 409 ? 'CONFLICT' : 'VALIDATION_FAILED';
    return new ApiError(status, fallback, `Request failed (${status})`);
  }
}

export function isApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

/** True for failures where retrying later could succeed (offline, timeouts, 5xx). */
export function isRetryable(error: unknown): boolean {
  if (!isApiError(error)) return true;
  return error.isNetwork || error.status >= 500 || error.status === 408 || error.status === 429;
}

/**
 * Wraps a transport so every response is checked against its contract schema. Used in
 * development and tests so drift between the web app, the mock and the API is loud.
 */
export function withResponseValidation(client: ApiClient, onIssue?: (message: string) => void): ApiClient {
  return {
    mode: client.mode,
    now: () => client.now(),
    async call(name, ...args) {
      const data = await client.call(name, ...args);
      const parsed = endpoints[name].response.safeParse(data);
      if (!parsed.success) {
        const detail = parsed.error.issues
          .slice(0, 5)
          .map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`)
          .join('; ');
        const message = `Response for ${name} did not match the contract: ${detail}`;
        onIssue?.(message);
        throw new ApiError(0, 'VALIDATION_FAILED', message);
      }
      return parsed.data as typeof data;
    },
  };
}
