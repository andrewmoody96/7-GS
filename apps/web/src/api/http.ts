// The real API: same-origin `/v1` (the Vite dev server proxies it to :8787).

import { buildPath, endpoints, type EndpointName } from '@7gs/contracts';
import { ApiError, type ApiClient, type CallArgs, type RawCallOptions } from './client';

export interface HttpClientOptions {
  /** Prefix for every path, e.g. 'https://api.example.com'. Defaults to same origin. */
  baseUrl?: string;
  fetch?: typeof fetch;
}

export function createHttpClient(options: HttpClientOptions = {}): ApiClient {
  const baseUrl = options.baseUrl ?? '';
  const doFetch = options.fetch ?? ((...args: Parameters<typeof fetch>) => fetch(...args));

  async function call<N extends EndpointName>(name: N, ...args: CallArgs<N>) {
    const def = endpoints[name];
    const opts = (args[0] ?? {}) as RawCallOptions;
    const url = baseUrl + buildPath(def.path, opts.params ?? {});
    const headers: Record<string, string> = { accept: 'application/json', ...opts.headers };
    let body: string | undefined;
    if (opts.body !== undefined) {
      headers['content-type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    let response: Response;
    try {
      response = await doFetch(url, {
        method: def.method,
        credentials: 'include',
        headers,
        body,
        signal: opts.signal,
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') throw error;
      throw new ApiError(0, 'NETWORK', 'You appear to be offline.');
    }

    const text = await response.text();
    let json: unknown = null;
    if (text) {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    if (!response.ok) throw ApiError.fromResponse(response.status, json);
    return json as never;
  }

  return { mode: 'http', call, now: () => new Date() };
}
