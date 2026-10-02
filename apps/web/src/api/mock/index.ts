import type { ApiClient, RawCallOptions } from '../client';
import { MockBackend, type MockBackendOptions } from './backend';

export { MockBackend, type MockBackendOptions } from './backend';
export { SCENARIOS, type ScenarioName } from './db';
export { DEMO_EMAIL, DEMO_TEAM } from './seed';

/** The mock transport: same `call` surface as the HTTP client, backed by MockBackend. */
export function createMockClient(backend: MockBackend): ApiClient {
  return {
    mode: 'mock',
    now: () => backend.now(),
    call: (name, ...args) => backend.handle(name, (args[0] ?? {}) as RawCallOptions) as never,
  };
}

export function createMockApi(options: MockBackendOptions = {}): { api: ApiClient; backend: MockBackend } {
  const backend = new MockBackend(options);
  return { api: createMockClient(backend), backend };
}
