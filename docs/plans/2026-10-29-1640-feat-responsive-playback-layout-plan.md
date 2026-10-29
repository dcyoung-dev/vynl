---
title: Responsive Playback Layout - Plan
type: feat
date: 2026-10-29
topic: responsive-playback-layout
artifact_contract: ce-unified-plan/v1
product_contract_source: user-request
execution: code
---

# Responsive Playback Layout - Plan

## Goal Capsule

- **Objective:** Listeners can see the current album's tracks and upcoming albums without losing easy access to playback and device controls on narrow screens.
- **Means:** Recompose the player into a desktop turntable-and-queue column with a track-list rail, and a mobile layout with a right-side track-list drawer (KTD1).
- **Product authority:** This request governs layout placement; the existing Spotify Vinyl Player plan governs behavior not changed here.
- **Execution profile:** One focused UI change using the existing React and Tailwind patterns.
- **Stop conditions:** None; this work does not change Spotify integration, authentication, or persisted state.
- **Finishing and shipping:** `ce-work` implements and verifies the plan; the repository owner reviews and merges the change.

## Product Contract

### Summary

This follow-up places the Up next queue below the turntable and the current album's track list in a right rail on wider screens. On mobile, the track list moves into a right-side drawer, and the Devices option sits beside playback controls.

### Problem Frame

The current app puts the queue in a side column and the current album's track list below the turntable. On narrow screens, both lists compete with the player for vertical space, while the device picker sits apart from the playback controls.

### Requirements

- R1. On wider screens, the Up next queue appears below the turntable in its main column, and the current album's track list appears in a right rail.
- R2. On mobile, the track list stays out of the page flow until a visible Tracks control opens it from the right; a close control and Escape dismiss it and return focus to the Tracks control.
- R3. The Devices option appears beside playback controls wherever the existing playback status allows device selection.
- R4. Track selection, current-track indication, queue actions, and device transfers keep their existing behavior.

### Key Decisions

- **Use an explicit mobile track-list control.** The Tracks control opens the right-side drawer, which closes with Escape or its close control and returns focus to the opener rather than relying on a swipe-only gesture. Governs R2. (session-settled: user-approved — chosen over swipe-only opening: a visible control is discoverable and supports keyboard access)
- **Refine layout without changing player behavior.** This plan supersedes the queue and track-list placement in R11 and the mobile-layout deferral in `docs/plans/2026-10-29-1403-feat-spotify-vinyl-player-plan.md`; the source plan remains unchanged.

### Scope Boundaries

- **In scope:** Responsive placement of the turntable, queue, track list, playback controls, and Devices option.
- **Out of scope:** Playback or queue logic, Spotify requests, persistence, authentication, and changes to the browse drawer.

### Acceptance Examples

- AE1. **Covers R1, R3.** Given an album is loaded on a wider screen, when the player renders, then the turntable and Up next queue occupy the main column, the track list is beside them on the right, and Devices is beside the playback controls.
- AE2. **Covers R2, R4.** Given an album is loaded on mobile, when the listener opens Tracks and selects a track, then the list slides in from the right, the chosen track becomes current, and the drawer can be dismissed with Escape or its close control.

## Planning Contract

### Key Technical Decisions

- KTD1. Reuse `TrackList` in a desktop rail and a mobile drawer; follow `BrowseDrawer` for the mobile control's accessible expanded state, Escape handling, and focus return.
- KTD2. Keep device eligibility and transfer callbacks in `App`, where status is already known; compose `Controls` and `DevicePicker` in one playback row instead of adding Spotify behavior to either component.
- KTD3. Use the existing Tailwind responsive utilities and palette classes; do not add a styling dependency or change the project's breakpoint system.

### Sources and Research

- `docs/plans/2026-10-29-1403-feat-spotify-vinyl-player-plan.md` defines the unchanged album, playback, queue, and device behavior referenced by this plan.
- `src/components/App.tsx` owns the current shell layout and device eligibility.
- `src/components/turntable/Turntable.tsx` currently composes the turntable, controls, and track list.
- `src/components/browse/BrowseDrawer.tsx` and `src/components/browse/BrowseDrawer.test.tsx` establish the existing drawer's close, Escape, and focus-return pattern.

## Implementation Units

### U1. Add the responsive track-list panel

- **Goal:** Present the current album's tracks in a desktop rail and an accessible mobile drawer.
- **Requirements:** R2, R4.
- **Dependencies:** None.
- **Files:** `src/components/turntable/TrackListPanel.tsx` (create), `src/components/turntable/TrackListPanel.test.tsx` (create), `src/components/turntable/TrackList.tsx`, `src/components/browse/BrowseDrawer.tsx` (pattern reference).
- **Approach:**
  1. Reuse `TrackList` for the ordered track rows, current-track indication, and optional move-needle callback.
  2. Render a desktop-only static rail and a mobile-only drawer with a visible Tracks opener; keep the two responsive views mutually hidden at their inactive breakpoints.
  3. Preserve read-only behavior when track selection is unavailable, and omit the mobile opener when there is no album to list.
  4. Close the mobile drawer with its close control or Escape and return focus to the opener.
- **Patterns to follow:** `TrackList` for track selection and `BrowseDrawer` for `aria-expanded`, `aria-controls`, Escape handling, and focus restoration.
- **Test scenarios:**
  - With tracks supplied, the panel renders every track in order and marks the supplied current index.
  - When the mobile Tracks control is activated, the drawer exposes the same tracks and indicates that it is expanded.
  - Selecting a track calls the move-needle callback with its zero-based index and preserves the current-track indication contract.
  - Escape and the close control dismiss the mobile drawer and return focus to the Tracks control.
  - With track selection disabled, rows remain read-only; with no album, the opener is absent.
- **Verification:** The desktop rail remains available independently of mobile drawer state, and the mobile drawer is absent from the accessible page until opened.

### U2. Recompose the responsive player shell

- **Goal:** Place the queue below the turntable, position the track-list panel to its right on wider screens, and group Devices with playback controls.
- **Requirements:** R1, R3, R4.
- **Dependencies:** U1.
- **Files:** `src/components/App.tsx`, `src/components/App.test.tsx`, `src/components/turntable/Turntable.tsx`, `src/components/turntable/Turntable.test.tsx`.
- **Approach:**
  1. Compose the wider-screen shell with a main column for the turntable and Up next queue, and the U1 track-list panel in the right rail.
  2. Move control-row composition to `App` so the existing `Controls` and eligible `DevicePicker` render beside one another; retain the current status gates and callbacks.
  3. Remove the inline track-list placement from `Turntable` and pass the current album's tracks and selection state to the U1 panel.
  4. Keep the mobile main column in reading order, with the track list available only through the U1 drawer.
- **Patterns to follow:** Existing shell composition in `App`, status gating through `CAN_PICK_DEVICE`, and existing `Turntable` and `QueuePanel` behavior.
- **Test scenarios:**
  - With an album loaded, the rendered shell places Up next after the turntable in the main column and exposes the track-list rail alongside it at the wider-screen breakpoint.
  - Playback controls and Devices share a control group when device selection is allowed; the Devices option remains absent for statuses that currently hide it.
  - Choosing a track through the panel calls the existing controller move-needle action, and a follower still sees read-only tracks with no playback controls.
  - Queue ordering and queue actions remain available after the queue moves below the turntable.
- **Execution note:** Because this change is primarily layout and responsive styling, include a visual smoke check at mobile and desktop widths alongside component tests.
- **Verification:** The existing playback, queue, and device interactions work from the new layout without changing their controller behavior.

## Verification Contract

- Run the affected Vitest coverage and the full suite with `bun run test`.
- Run `bun run check` and `bun run build`.
- With an album loaded, inspect `http://127.0.0.1:4321/vynl/` at a narrow mobile width and a desktop width: verify the queue and track-list placement, the mobile drawer's open/close behavior, and the playback-controls/Devices grouping.

## Definition of Done

- Wider screens show Up next below the turntable and the current album's tracks in a right rail.
- Mobile screens hide the track list from the page flow until Tracks opens the right-side drawer, with keyboard dismissal and focus return working.
- Devices appears beside playback controls when allowed, and existing track, queue, and device actions remain unchanged.
- The affected tests, `bun run check`, `bun run build`, and the responsive visual smoke check pass.