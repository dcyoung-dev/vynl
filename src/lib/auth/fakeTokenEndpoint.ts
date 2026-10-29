import { vi } from 'vitest';

export interface FakeTokenResponse {
  status?: number;
  body: unknown;
}

export interface RecordedTokenRequest {
  url: string;
  method: string | undefined;
  contentType: string | null;
  body: URLSearchParams;
}

/**
 * Stubs global `fetch` with a scripted Spotify token endpoint and records every request.
 * Responses are served in order; `release()` lets held responses resolve when `hold` is set.
 */
export function stubTokenEndpoint(responses: FakeTokenResponse[], { hold = false } = {}) {
  const requests: RecordedTokenRequest[] = [];
  const pending: Array<() => void> = [];

  const fetchStub = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    requests.push({
      url: String(input),
      method: init?.method,
      contentType: new Headers(init?.headers).get('content-type'),
      body: new URLSearchParams(String(init?.body ?? '')),
    });
    const next = responses.shift() ?? { status: 500, body: { error: 'no_scripted_response' } };
    if (hold) await new Promise<void>((resolve) => pending.push(resolve));
    return new Response(JSON.stringify(next.body), {
      status: next.status ?? 200,
      headers: { 'content-type': 'application/json' },
    });
  });

  vi.stubGlobal('fetch', fetchStub);

  return {
    requests,
    release() {
      pending.splice(0).forEach((resolve) => resolve());
    },
  };
}

export function tokenResponse(overrides: Record<string, unknown> = {}): FakeTokenResponse {
  return {
    body: {
      access_token: 'access-new',
      token_type: 'Bearer',
      expires_in: 3600,
      refresh_token: 'refresh-new',
      scope: 'streaming',
      ...overrides,
    },
  };
}
