import { beforeEach, describe, expect, it, vi } from 'vitest';
import { forgetAccount, getLastAccount, setLastAccount } from './account';

const disconnect = vi.fn();
vi.mock('../player/sdk', () => ({ disconnect: () => disconnect() }));

beforeEach(() => {
  localStorage.clear();
  disconnect.mockClear();
});

describe('last account', () => {
  it('is null until one is set, then returns it', () => {
    expect(getLastAccount()).toBeNull();
    setLastAccount('alice');
    expect(getLastAccount()).toBe('alice');
    expect(localStorage.getItem('vynl:last-account')).toBe('alice');
  });
});

describe('forgetAccount', () => {
  it('removes the tokens and that account, clears last-account, and disconnects the SDK', () => {
    localStorage.setItem('vynl:auth', '{}');
    localStorage.setItem('vynl:v1:alice', '{}');
    setLastAccount('alice');

    forgetAccount('alice');

    expect(localStorage.getItem('vynl:auth')).toBeNull();
    expect(localStorage.getItem('vynl:v1:alice')).toBeNull();
    expect(getLastAccount()).toBeNull();
    expect(disconnect).toHaveBeenCalled();
  });

  it('leaves other accounts and a different last-account alone', () => {
    localStorage.setItem('vynl:v1:alice', '{}');
    localStorage.setItem('vynl:v1:bob', '{"keep":true}');
    setLastAccount('bob');

    forgetAccount('alice');

    expect(localStorage.getItem('vynl:v1:bob')).toBe('{"keep":true}');
    expect(getLastAccount()).toBe('bob');
  });
});
