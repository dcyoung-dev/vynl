# Playback spike (U6)

Run on 2026-10-29 against a real Premium account, using the temporary page `/vynl/spike/`. Test album: `spotify:album:7jtE0xbYPrmEefrEqKWFha`. Its first track is "Break The Cycle" and its last is "Et Tu, Brute?" (about 198s). The second device was the Spotify desktop app on a MacBook, because no phone was needed. The tab was a WebKit webview with the tab visible.

## Outcome

Album end **can** be told apart from autoplay, so the Goal Capsule stop condition did not trigger. Two settled mechanisms need correcting, though:

- **KTD5's end signals are wrong.** At album end, Spotify does not pause at position 0, and it does not change `context.uri`. See the corrected rule below.
- **KTD7's mirroring check is incomplete.** It must also compare the current track's album, because autoplay keeps the album as the context.

## Run 1: album end in the tab (SDK device)

- `setRepeatOff(vynlDeviceId)` was **accepted while the SDK device was still inactive**. KTD4's order (repeat off, then play) stands.
- About 0.4s after the last track started, the SDK's `track_window.next_tracks` went from 0 to 1. Autoplay had queued its next track.
- At the expected end (last-track start plus duration), autoplay started a different album's track (Green Day, "When I Come Around") **with no gap**. It started within about 100ms of the expected end.
- Afterwards, both the SDK state and `GET /me/player` still reported **`context.uri` as the original album**. Only `track_window.current_track.album.uri` and `item.album.uri` changed.
- The player never showed a paused state at position 0.

## Run 2a: album end on a remote device, tab visible

- `setRepeatOff(macDeviceId)` on an **inactive** remote device **transferred playback to it**, and the SDK state went `null` at once. **U8 must not call repeat-off on a remote device unless that device is already the active one.**
- At the expected end, the desktop app **looped back to track 1 of the same album**, even though `repeat_state` was `off` and the context hadn't changed. There was no autoplay.

## Run 2b: remote device, tab hidden for more than 5 minutes

Not measured, and the owner chose to skip it. The defaults stay conservative:

- The remote grace window stays at 90s.
- The worker posts a tick every second. If the gap between ticks is over `WORKER_GAP_MS`, the tab was frozen or throttled, and the controller polls straight away instead of waiting for its next interval.

## Run 3: transfer to Vynl and back

- **Transfer to Vynl** (`transferPlayback(vynl, {play: true})`): the SDK state arrived about 210ms after the request. It was playing at the same track and position, with the same context. The API call returned at about 220ms. The next poll showed `device: Vynl`.
- **Transfer to the Mac:** the SDK state went `null` about 290ms after the request. The next poll showed the Mac playing at the same track and position, with the same album context.
- A `null` SDK state means "the tab is no longer the active device", not "nothing is playing". U8 should poll to find out which.

## Run 4: playlist started on the Mac mid-album

The next poll showed the Mac with a new `context.uri` (first another album, then `spotify:playlist:…`), and `item.album.uri` changed with it. Outside the grace window, that maps to playing elsewhere (R21).

## Run 5: same album started on the Mac

The next poll showed the Mac with `context.uri` set to Vynl's album, and `item.album.uri` the same. The track was "The Cold Hard Truth", partway through the album. That maps to mirroring (R20).

## Corrected rules for U8

**End signal (replaces KTD5's list).** Each album playback keeps its instance ID and its "advanced" flag. The expected end is the last track's start plus its duration. Within the grace window around the expected end, any of the following on **the device that was playing** counts as the album ending:

1. The current track is no longer the album's last track: its album URI differs (autoplay, as in run 1), or it is an earlier track of the same album (the loop in run 2a).
2. The player is paused at position 0 on the last track. This is kept as a fallback; it wasn't seen.
3. `context.uri` changes to something else.

The first signal advances the queue once. A different context on a **different** device always means playing elsewhere.

**Empty queue at album end.** In the tab, autoplay starts gaplessly, so detecting the end and then pausing lets about half a second of the next track play. That's acceptable for AE3. A tighter option for later is to pause just before the expected end when the queue is empty.

**Mirroring (corrects KTD7).** Vynl is mirroring when `context.uri` equals the started album **and** `item.album.uri` equals it too, outside the end window. If the context matches but the track's album doesn't, autoplay has continued past the album. Outside the window, treat that as playing elsewhere.

**Repeat off.** Call `setRepeatOff` only on the Vynl SDK device, before playing (run 1), or on a remote device that is already active. Never use it to target an inactive device (run 2a).

## Constants

These are in `src/lib/playback/constants.ts`. The measurements support the plan defaults, and the remote values stay conservative because run 2b wasn't measured.

| Constant | Value | Reason |
|---|---|---|
| `GRACE_MS_LOCAL` | 20 000 | Autoplay or loop appeared within about 100ms of the expected end in the tab. |
| `GRACE_MS_REMOTE` | 90 000 | Has to cover a 20s hidden-tab poll plus up to a minute of background throttling (run 2b not measured). |
| `REMOTE_LEAD_MS` | 500 | A command takes about 200–300ms to take effect (run 3). |
| `POLL_MS_SDK_VISIBLE` | 60 000 | SDK events drive everything. |
| `POLL_MS_REMOTE_VISIBLE` | 5 000 | Plan default. Runs 4 and 5 were caught on the next poll. |
| `POLL_MS_REMOTE_HIDDEN` | 20 000 | Plan default. |
| `POLL_MS_IDLE` | 30 000 | Plan default, for idle or playing elsewhere. |
| `WORKER_TICK_MS` | 1 000 | How often the scheduler worker posts a tick. |
| `WORKER_GAP_MS` | 2 500 | A larger gap between 1s ticks means the tab was frozen, so poll now. |
