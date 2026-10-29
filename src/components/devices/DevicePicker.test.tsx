import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { getDevices } from '../../lib/spotify/api';
import type { SpotifyDevice } from '../../lib/spotify/types';
import DevicePicker from './DevicePicker';

vi.mock('../../lib/spotify/api', () => ({ getDevices: vi.fn() }));

function device(id: string, name: string, extra: Partial<SpotifyDevice> = {}): SpotifyDevice {
  return {
    id,
    name,
    type: 'Speaker',
    is_active: false,
    is_private_session: false,
    is_restricted: false,
    volume_percent: 50,
    ...extra,
  };
}

const list = vi.mocked(getDevices);

beforeEach(() => {
  list.mockReset();
});

async function open(onTransfer = vi.fn(), thisDeviceId: string | null = 'tab') {
  render(<DevicePicker thisDeviceId={thisDeviceId} onTransfer={onTransfer} />);
  fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
  await screen.findByRole('list', { name: 'Devices' });
  return onTransfer;
}

describe('DevicePicker', () => {
  it('lists remote devices, which stay usable when the SDK is unavailable', async () => {
    list.mockResolvedValue([device('phone', 'Phone'), device('tv', 'Living room TV')]);
    await open(vi.fn(), null);
    expect(screen.getByRole('button', { name: /Phone/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Living room TV/ })).toBeInTheDocument();
  });

  it('hides restricted devices and ones without an id', async () => {
    list.mockResolvedValue([
      device('phone', 'Phone'),
      device('locked', 'Locked speaker', { is_restricted: true }),
      { ...device('x', 'No id'), id: null },
    ]);
    await open();
    expect(screen.queryByRole('button', { name: /Locked speaker/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /No id/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Phone/ })).toBeInTheDocument();
  });

  it('fetches the device list again before transferring to a remote device', async () => {
    list.mockResolvedValue([device('phone', 'Phone')]);
    const onTransfer = await open();
    fireEvent.click(screen.getByRole('button', { name: /Phone/ }));
    await waitFor(() => expect(onTransfer).toHaveBeenCalledWith('phone'));
    expect(list).toHaveBeenCalledTimes(2);
  });

  it('does not transfer to a device that has gone away', async () => {
    list.mockResolvedValueOnce([device('phone', 'Phone')]).mockResolvedValueOnce([]);
    const onTransfer = await open();
    fireEvent.click(screen.getByRole('button', { name: /Phone/ }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/no longer available/i);
    expect(onTransfer).not.toHaveBeenCalled();
  });

  it('transfers to this tab straight away, inside the click, so audio can be unlocked', async () => {
    list.mockResolvedValue([device('tab', 'Vynl', { is_active: true })]);
    const onTransfer = await open();
    fireEvent.click(screen.getByRole('button', { name: /This tab/ }));
    expect(onTransfer).toHaveBeenCalledWith('tab');
    expect(list).toHaveBeenCalledTimes(1);
  });

  it('shows an error when devices cannot be listed', async () => {
    list.mockRejectedValue(new Error('nope'));
    render(<DevicePicker thisDeviceId="tab" onTransfer={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Devices' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(/couldn't load devices/i);
  });
});
