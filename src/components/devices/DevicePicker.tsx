import { useId, useState } from 'react';
import { getDevices } from '../../lib/spotify/api';
import type { SpotifyDevice } from '../../lib/spotify/types';
import { secondaryButton } from '../browse/AlbumCard';

export interface DevicePickerProps {
  /** The tab's own Spotify Connect device ID, or null while the SDK isn't ready (or is blocked). */
  thisDeviceId: string | null;
  onTransfer: (deviceId: string) => void;
}

type Listed = { id: string; name: string };

/** Restricted devices can't be controlled from the Web API, so they are not offered. */
function usable(devices: SpotifyDevice[]): Listed[] {
  return devices.flatMap((d) => (d.id && !d.is_restricted ? [{ id: d.id, name: d.name }] : []));
}

/** Lists the listener's Spotify devices so the record can be sent to one (R19). */
export default function DevicePicker({ thisDeviceId, onTransfer }: DevicePickerProps) {
  const listId = useId();
  const [open, setOpen] = useState(false);
  const [devices, setDevices] = useState<Listed[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh(): Promise<Listed[] | null> {
    try {
      const listed = usable(await getDevices());
      setDevices(listed);
      setError(null);
      return listed;
    } catch {
      setError("Couldn't load devices from Spotify.");
      return null;
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) void refresh();
  }

  async function choose(id: string) {
    // The tab itself is chosen synchronously: the controller unlocks audio inside this click.
    if (id === thisDeviceId) {
      onTransfer(id);
      setOpen(false);
      return;
    }
    const fresh = await refresh();
    if (!fresh) return;
    if (!fresh.some((d) => d.id === id)) {
      setError('That device is no longer available.');
      return;
    }
    onTransfer(id);
    setOpen(false);
  }

  return (
    <div className="flex flex-col items-center gap-2 text-vanilla-custard">
      <button type="button" className={secondaryButton} aria-expanded={open} aria-controls={listId} onClick={toggle}>
        Devices
      </button>
      <div id={listId} hidden={!open} className="w-full max-w-xs">
        {error !== null && (
          <p role="alert" className="text-sm text-honey-bronze">
            {error}
          </p>
        )}
        {devices !== null && devices.length === 0 && error === null && (
          <p className="text-sm">No devices found. Open Spotify on a device to see it here.</p>
        )}
        {devices !== null && devices.length > 0 && (
          <ul aria-label="Devices" className="flex flex-col gap-1">
            {devices.map((d) => (
              <li key={d.id}>
                <button type="button" className={`${secondaryButton} w-full text-left`} onClick={() => void choose(d.id)}>
                  {d.id === thisDeviceId ? `This tab (${d.name})` : d.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
