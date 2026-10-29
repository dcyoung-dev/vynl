import { signOut } from '../auth/session';
import { disconnect } from '../player/sdk';
import { storageKey } from './persist';

export const LAST_ACCOUNT_KEY = 'vynl:last-account';

/** KTD9: which account's namespace to load on startup, before `GET /me` answers. */
export function getLastAccount(): string | null {
  return localStorage.getItem(LAST_ACCOUNT_KEY);
}

export function setLastAccount(accountId: string): void {
  localStorage.setItem(LAST_ACCOUNT_KEY, accountId);
}

/**
 * KTD9 "Forget me on this browser": everything sign-out does, plus the account's saved queue,
 * `vynl:last-account` when it points at that account, and the SDK player. Other accounts are left alone.
 */
export function forgetAccount(accountId: string | null): void {
  signOut();
  if (accountId !== null) {
    localStorage.removeItem(storageKey(accountId));
    if (getLastAccount() === accountId) localStorage.removeItem(LAST_ACCOUNT_KEY);
  }
  disconnect();
}
