import { vi } from 'vitest';

export interface FakeResponse {
  status?: number;
  /** Serialised as JSON. Omit for an empty body (for example a `204`). */
  body?: unknown;
  headers?: Record<string, string>;
}

export interface RecordedRequest {
  url: URL;
  method: string;
  headers: Headers;
  /** The parsed JSON body, or `undefined` when the request had none. */
  body: unknown;
}

/**
 * Stubs global `fetch` with scripted responses served in order and records every request.
 * An unscripted request gets a `500` so a test fails loudly instead of hanging.
 */
export function stubFetch(...responses: FakeResponse[]) {
  const requests: RecordedRequest[] = [];

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = init?.body;
    requests.push({
      url: new URL(String(input)),
      method: (init?.method ?? 'GET').toUpperCase(),
      headers: new Headers(init?.headers),
      body: typeof raw === 'string' ? JSON.parse(raw) : undefined,
    });

    const next = responses.shift() ?? { status: 500, body: { error: { status: 500, message: 'no scripted response' } } };
    const hasBody = next.body !== undefined;
    return new Response(hasBody ? JSON.stringify(next.body) : null, {
      status: next.status ?? 200,
      headers: { ...(hasBody ? { 'content-type': 'application/json' } : {}), ...next.headers },
    });
  });

  vi.stubGlobal('fetch', fetchStub);

  return { fetch: fetchStub, requests };
}
