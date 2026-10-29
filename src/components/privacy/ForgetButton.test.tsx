import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ForgetButton from './ForgetButton';

const disconnect = vi.fn();
vi.mock('../../lib/player/sdk', () => ({ disconnect: () => disconnect() }));

beforeEach(() => {
  localStorage.clear();
  disconnect.mockClear();
});

describe('ForgetButton', () => {
  it('removes the last account and sign-in, and says so', () => {
    localStorage.setItem('vynl:auth', '{}');
    localStorage.setItem('vynl:last-account', 'alice');
    localStorage.setItem('vynl:v1:alice', '{}');
    localStorage.setItem('vynl:v1:bob', '{}');
    render(<ForgetButton />);
    fireEvent.click(screen.getByRole('button', { name: 'Forget me on this browser' }));
    expect(localStorage.getItem('vynl:auth')).toBeNull();
    expect(localStorage.getItem('vynl:v1:alice')).toBeNull();
    expect(localStorage.getItem('vynl:last-account')).toBeNull();
    expect(localStorage.getItem('vynl:v1:bob')).not.toBeNull();
    expect(screen.getByRole('status')).toHaveTextContent(/forgotten/i);
  });
});
