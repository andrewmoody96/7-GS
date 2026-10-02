// Picks the transport for this build: VITE_API_MODE=mock|http (default mock while the
// API is built in parallel). `vite --mode http` also selects http. The mock backend is
// loaded with a dynamic import, so it's a separate chunk that http mode never runs.

import { withResponseValidation, type ApiClient, type ApiMode } from './client';
import { createHttpClient } from './http';
import type { MockBackend } from './mock/backend';
import { isScenario } from './mock/scenarios';

export * from './client';

export function resolveApiMode(env: { VITE_API_MODE?: string; MODE?: string } = import.meta.env): ApiMode {
  const raw = env.VITE_API_MODE ?? (env.MODE === 'http' ? 'http' : 'mock');
  return raw === 'http' ? 'http' : 'mock';
}

let mockBackend: MockBackend | null = null;

/** The demo backend when running in mock mode (for the demo controls), else null. */
export function getMockBackend(): MockBackend | null {
  return mockBackend;
}

export async function createApi(mode: ApiMode = resolveApiMode()): Promise<ApiClient> {
  let client: ApiClient;
  if (mode === 'mock') {
    const { MockBackend, createMockClient } = await import('./mock');
    const backend = new MockBackend({ latencyMs: 160 });
    // ?demo=<scenario> jumps straight to a scenario (handy for screenshots and demos).
    const requested = new URLSearchParams(window.location.search).get('demo');
    if (requested && isScenario(requested) && requested !== backend.scenario) backend.reset(requested);
    mockBackend = backend;
    client = createMockClient(backend);
  } else {
    client = createHttpClient();
  }
  // Check every response against the contract while developing.
  return import.meta.env.DEV ? withResponseValidation(client, (message) => console.error(message)) : client;
}
