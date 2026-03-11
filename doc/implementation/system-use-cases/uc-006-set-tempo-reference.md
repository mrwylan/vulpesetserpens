# UC-006 — Set Tempo Reference

> **Creator note:** This use case was elevated to a must-have for v1 following a creator-perspective review. Producers almost always know the BPM of their sample — it is stamped in the filename, the sample pack metadata, or their own session notes. Accepting a user-supplied BPM value costs almost nothing to implement but unlocks musically-aware result annotations (bar counts), improved period scoring in UC-003, and more readable filenames in UC-005. It requires no automatic BPM detection — the creator types the value; the system uses it. BPM input is specifically relevant to the producer and musician profiles; it is not expected to be used by sound designers working with micro-duration sustain loops.

## Trigger

The user types a numeric BPM value into the "Tempo" input field visible in the application UI, and either presses Enter or tabs away from the field (on blur).

## Preconditions

- The application is loaded. A tempo reference may be set at any time — before or after a file is loaded, and before or after loop candidates are detected.
- The tempo input field is always visible and editable regardless of application state.

## Main Flow

1. The user focuses the tempo input field (a numeric text input, labelled "BPM" or "Tempo").
2. The user types a numeric BPM value (e.g., "120", "93.5").
3. On input commit (Enter key or blur event), the system validates the value:
   - Acceptable range: 20–300 BPM (inclusive). Values outside this range are rejected with an inline validation message.
   - Decimal values are accepted (e.g., "93.5" for swing grooves or non-standard tempos).
4. If the value is valid, the system stores it in application state as `tempoReference` (a float in BPM).
5. If loop candidates are already present in the candidate list (i.e., UC-003 has already completed), the system recomputes the bar/beat annotations for all candidates using the new tempo without re-running loop detection. Specifically, for each candidate, compute:
   - `beatsPerBar = 4` (assumed 4/4; see Alternate Flows for other time signatures)
   - `secondsPerBeat = 60.0 / tempoReference`
   - `secondsPerBar = secondsPerBeat * beatsPerBar`
   - `approximateBars = candidate.duration / secondsPerBar`
   - Round `approximateBars` to the nearest power of two (0.5, 1, 2, 4, 8, 16) to produce a `barAnnotation` string: e.g., "≈ 2 bars", "≈ 4 bars", "≈ 0.5 bars".
   - Store `barAnnotation` and `approximateBars` on the candidate object (in the main thread state; do not re-post to the worker).
6. The candidate list UI re-renders to show bar/beat annotations on each candidate's duration display.
7. The waveform metadata display is updated to show the tempo: e.g., "4.32 s · 44100 Hz · Stereo · 120 BPM".
8. If loop detection is re-triggered after a tempo reference is set, the worker receives the `tempoReference` value and uses it to bias the `S_period` score in Phase 4e of UC-003: expected bar lengths at the given BPM are treated as preferred period lengths with high confidence, supplementing (not replacing) the autocorrelation-derived preferred lengths.

## Alternate Flows

### AF-1: User clears the tempo field

If the user deletes the value and leaves the field empty (or enters "0"), the system clears `tempoReference` from application state. Bar annotations are removed from the candidate list. The `S_period` scoring reverts to autocorrelation-only mode.

### AF-2: User changes the tempo after it was already set

The system immediately updates `tempoReference` and re-computes bar annotations for all existing candidates. The behavior is identical to Main Flow steps 5–7. No re-analysis is required.

### AF-3: No candidates yet when tempo is set

Steps 5–6 are skipped (no candidates to annotate). The stored `tempoReference` value will be used when UC-003 runs next.

### AF-4: Time signature other than 4/4

For v1, the tool assumes 4/4 time (4 beats per bar). If a user working in 3/4 or 6/8 enters their BPM, the bar counts shown will be for 4-beat bars and may not match musical phrase lengths in those time signatures. The bar annotation display should note "(4/4 assumed)" to avoid confusion. Supporting variable time signatures is deferred to a future UC.

## Failure / Error Cases

### FC-1: Non-numeric input

- Detection: `isNaN(parseFloat(inputValue))` or input contains non-numeric characters beyond a single decimal point.
- Response: display an inline validation error adjacent to the field: "Please enter a numeric BPM value (e.g., 120)." The stored `tempoReference` is not updated. The field retains the invalid text so the user can correct it.

### FC-2: Out-of-range value

- Detection: parsed float is less than 20 or greater than 300.
- Response: display an inline validation error: "BPM must be between 20 and 300." The stored `tempoReference` is not updated.

## Acceptance Criteria

1. Typing "120" into the BPM field and pressing Enter stores `tempoReference = 120.0` in application state within 50 ms.
2. If candidates are present, bar annotations update immediately after a valid BPM is entered — no page reload or re-analysis required.
3. A candidate with `duration = 4.0 s` at 120 BPM is annotated "≈ 2 bars".
4. A candidate with `duration = 8.0 s` at 120 BPM is annotated "≈ 4 bars".
5. A candidate with `duration = 2.0 s` at 60 BPM is annotated "≈ 0.5 bar". (60 BPM in 4/4 = 1 beat/s = 4 s/bar; 2.0 s ÷ 4.0 s/bar = 0.5 bars.)
6. An input of "0" or an empty field clears the tempo reference and removes bar annotations.
7. An input of "301" displays a validation error and does not update `tempoReference`.
8. An input of "abc" displays a validation error and does not update `tempoReference`.
9. The tempo reference is visible in the waveform metadata display when set.
10. When the tempo reference is set before analysis runs, the worker uses it to compute preferred bar lengths for `S_period` scoring. A 4-bar loop at the given BPM scores higher in `S_period` than an arbitrary-length loop.
11. Decimal BPM values (e.g., "93.5") are accepted and stored correctly.

## Test Coverage

### Unit (Vitest)
- AC-3: `computeBarAnnotation(4.0, 120)` returns `"≈ 2 bars"`
- AC-4: `computeBarAnnotation(8.0, 120)` returns `"≈ 4 bars"`
- AC-5: `computeBarAnnotation(2.0, 60)` returns `"≈ 2 bars"`
- AC-7: BPM validation function returns an error for input `301` and does not mutate `tempoReference`
- AC-8: BPM validation function returns an error for input `"abc"` and does not mutate `tempoReference`
- AC-11: BPM validation function accepts `"93.5"` and stores `93.5` as a float
- AC-10: period scoring function, given expected bar lengths derived from a known BPM, assigns a higher `S_period` to a loop whose duration aligns with a 4-bar boundary than to an arbitrary-length loop

### E2E (Playwright)
- AC-1: typing "120" and pressing Enter causes `tempoReference` to equal `120.0` in app state within 50 ms (verified via JS evaluation)
- AC-2: with candidates present, bar annotations appear in the candidate list immediately after a valid BPM is entered — no page reload
- AC-6: deleting the BPM field value and pressing Enter removes bar annotations from the candidate list
- AC-9: the waveform metadata area displays the entered BPM value after a valid entry

## Notes / Constraints

- The BPM field should be positioned close to the waveform or the candidate list — not buried in a settings panel. Producers and musicians reference it frequently during a session; sound designers can ignore it. A compact inline label + number input above or below the waveform is appropriate.
- The field should display the current `tempoReference` value on load if one was set earlier in the session. (Since the app has no persistence, this only applies within a single browser session.)
- BPM entry must not trigger a re-run of the full loop detection algorithm. Bar annotation computation is a lightweight post-processing step that runs on the main thread against the existing candidate data.
- The tempo reference is passed to the analysis worker only when detection is (re-)triggered — not retroactively. Bar annotations on existing candidates are computed on the main thread without re-invoking the worker.
- The BPM input should use `type="number"` with `min="20"` and `max="300"` and `step="0.5"` attributes for browser-native validation hints, but the system must also perform its own JavaScript validation (the `type="number"` constraint alone is not sufficient, as it can be bypassed by pasting).
