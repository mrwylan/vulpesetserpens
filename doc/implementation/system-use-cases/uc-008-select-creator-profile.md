# UC-008 — Select Creator Profile

> **Creator note:** The three profiles introduced in the Vision (sound designer, musician, producer) work at fundamentally different time scales. Without profile awareness, the detection algorithm must use a single duration window that inevitably compromises one profile to serve another: a 0.5 s minimum suits producers but silently excludes every micro-loop a sound designer cares about; a 20 ms minimum floods a producer's results with sub-bar fragments they cannot use. A one-time profile selection costs the creator almost nothing — one click before upload — and unlocks results that are immediately relevant to their actual workflow.

## Trigger

The user sees the empty state (drop zone screen) and selects one of the three creator profile options before or after dropping a file.

## Preconditions

- The application is in the empty state (no file loaded or file cleared).
- The profile selector is rendered as part of the empty state screen.

## Main Flow

1. On first load the application displays the profile selector with three options:
   - **Sound Designer** — "Micro sustain loops · 20 ms – 1 s"
   - **Musician** — "Note & chord loops · 100 ms – 10 s" *(pre-selected default)*
   - **Producer** — "Beat & phrase loops · 0.5 s – 60 s"
2. The currently selected profile has a distinct visual active state (accent border + background tint).
3. The user clicks one of the profile options. The selection updates immediately with no page reload.
4. The selected profile is stored in application state as `creatorProfile`.
5. The drop zone and file-picker remain available and functional regardless of which profile is selected.
6. When the user drops or selects a file (UC-001), the analysis is run with the profile's duration constraints:

   | Profile | `minDuration` | `maxDuration` |
   |---------|--------------|--------------|
   | Sound designer | 0.02 s (20 ms) | 1.0 s |
   | Musician | 0.1 s | 10.0 s |
   | Producer | 0.5 s | 60.0 s |

7. The active profile label is shown in the header bar (Row 2, adjacent to audio metadata) while a file is loaded, so the creator always knows which mode is active.

## Alternate Flows

### AF-1: Profile changed while results are visible

If the user changes profile after results are already displayed (e.g., via the header indicator or by returning to the drop zone), the application re-runs analysis of the currently loaded audio buffer with the new profile's constraints. The existing candidates are replaced by the new results. A brief "re-analysing…" indicator replaces the candidate list during the re-run.

### AF-2: Profile changed during analysis

If the user changes profile while analysis is in progress, the in-flight worker is cancelled and a new analysis starts immediately with the new profile parameters.

### AF-3: No profile explicitly selected

The Musician profile is pre-selected on load. The tool is fully usable without the user explicitly choosing — the pre-selection represents the broadest-appeal default.

## Failure / Error Cases

There are no failure cases specific to profile selection. The selector is purely presentational state; invalid or missing values fall back to the Musician profile defaults.

## Acceptance Criteria

1. On first load, the profile selector is visible in the drop zone with three labelled options; Musician is pre-selected.
2. Clicking a profile option changes the active visual state to the clicked option within 50 ms.
3. After selecting Sound Designer and uploading `sine-220hz-4s.wav`, every candidate in the result list has `duration ≤ 1.0 s`.
4. After selecting Producer and uploading `sine-220hz-4s.wav`, every candidate has `duration ≥ 0.5 s`.
5. After selecting Musician and uploading `sine-220hz-4s.wav`, every candidate has `duration ≥ 0.1 s` and `≤ 10.0 s`.
6. The active profile label is displayed in the header metadata row when a file is loaded.
7. Changing profile while results are shown triggers re-analysis; the candidate list is replaced.
8. The profile selection persists when the user loads a second file without explicitly changing it.

## Test Coverage

### Unit (Vitest)

- `detectLoops` called with `minDuration=0.02, maxDuration=1.0` returns no candidates with `duration > 1.0 s` on a 4-second sine wave.
- `detectLoops` called with `minDuration=0.5, maxDuration=60.0` returns no candidates with `duration < 0.5 s` on the same input.
- `detectLoops` called with `minDuration=0.1, maxDuration=10.0` returns only candidates in the `[0.1, 10.0]` range.

### E2E (Playwright)

- AC-1: profile selector with three options is visible on first load; Musician is pre-selected.
- AC-2: clicking Sound Designer applies the active state to the Sound Designer option.
- AC-3: with Sound Designer selected, all result candidates have `duration ≤ 1.0 s`.
- AC-4: with Producer selected, all result candidates have `duration ≥ 0.5 s`.
- AC-6: profile label appears in header after file load.
- AC-7: changing profile while results are shown triggers re-analysis.

## Notes / Constraints

- Profile selection maps directly to `minDuration` and `maxDuration` parameters passed to `detectLoops`. No other scoring changes are required in v1 — duration filtering is the primary differentiator.
- The profile selector must not block or delay file upload. The drop zone and the profile selector coexist on the same screen; the creator can drop a file immediately even without explicitly clicking a profile.
- The `minDuration` and `maxDuration` values from the profile override the constants in `detectLoops.ts`. The absolute minimum (20 ms) is still enforced as a hard floor regardless of profile — no profile can request a lower minimum.
- Re-analysis on profile change reuses the `AudioBuffer` already decoded in memory; it does not re-read the file. The same `analyze()` call path used during initial load is used.
- The profile is session-only state. It is not persisted between browser sessions.
