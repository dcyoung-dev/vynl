export { AuthLostError } from '../auth/session';

/** Any Spotify Web API failure that isn't one of the named states below. */
export class SpotifyApiError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly reason?: string,
  ) {
    super(message);
    this.name = 'SpotifyApiError';
  }
}

/** `403` from `GET /me`: the account isn't on the app's development-mode allowlist (KTD16). */
export class NotAllowlistedError extends SpotifyApiError {
  constructor(message = 'This Spotify account is not allowlisted for Vynl') {
    super(403, message);
    this.name = 'NotAllowlisted';
  }
}

/** A player call refused because the account isn't Premium (KTD16). */
export class PremiumRequiredError extends SpotifyApiError {
  constructor(message = 'Spotify Premium is required') {
    super(403, message, 'PREMIUM_REQUIRED');
    this.name = 'PremiumRequired';
  }
}

/** `429` with `QUOTA_EXCEEDED`: the shared development-mode quota ran out (KTD3). Not retried. */
export class QuotaExceededError extends SpotifyApiError {
  constructor(message = "Spotify's request limit for Vynl was reached — try again shortly") {
    super(429, message, 'QUOTA_EXCEEDED');
    this.name = 'QuotaExceeded';
  }
}
