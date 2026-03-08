# UC-004 — Audition Loop

## Trigger

The user clicks a "Play" control associated with a specific loop candidate in the candidate list UI, or presses a keyboard shortcut to play/stop the currently selected candidate.

> **Musician note:** Keyboard shortcuts are essential for rapid auditioning. A producer may cycle through 10 candidates quickly to find the right one. Having to move the mouse to a button for each play/stop cycle breaks the listening focus. At minimum, the Space bar should toggle play/stop for the currently selected candidate, and the Up/Down arrow keys should cycle selection through the candidate list.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- At least one loop candidate is present in the candidate list (produced by UC-003).
- The browser's `AudioContext` exists and its `state` is either `"running"` or `"suspended"` (resumable). If suspended, it must be resumed before playback begins.
- No precondition on whether audio is already playing — switching candidates during playback is a supported flow (see Alternate Flows).

## Main Flow

1. The user clicks "Play" on a candidate. The system records that candidate as the "selected candidate" in application state.
2. If any audio is currently playing (another loop or the same loop), the system stops it immediately: disconnect and discard the current `AudioBufferSourceNode` and cancel any scheduled crossfade gain ramps. (See Alternate Flows AF-1 for the switch-while-playing case.)
3. If `audioContext.state === 'suspended'`, call `audioContext.resume()` and wait for the promise to resolve before continuing.
4. Extract the loop region from the `AudioBuffer`:
   - `startSample` and `endSample` are taken from the selected candidate object.
   - Compute `loopDuration = (endSample - startSample) / audioContext.sampleRate`.
5. If the candidate's `crossfadeDuration > 0` (as determined by UC-003, Phase 5), prepare a crossfade buffer. Otherwise, skip crossfade setup.
   - For crossfade: create an `AudioBuffer` of length `crossfadeSamples = Math.round(crossfadeDuration * sampleRate)` containing the blend of the loop-end region and loop-start region (see Notes for the blend formula). This crossfade buffer will be scheduled to play at the exact moment the loop wraps.
6. Create a primary `AudioBufferSourceNode`:
   - Set `sourceNode.buffer` to the main `AudioBuffer`.
   - Set `sourceNode.loopStart = startSample / sampleRate`.
   - Set `sourceNode.loopEnd = endSample / sampleRate`.
   - Set `sourceNode.loop = true`.
   - Connect `sourceNode` to `audioContext.destination`.
7. Call `sourceNode.start(0, startSample / sampleRate)` — the second argument offsets playback to begin at the loop start point, avoiding any pre-roll audio.
8. If a crossfade buffer was prepared (step 5), schedule a `GainNode`-based crossfade at each loop wrap point (see Notes / Constraints for scheduling approach).
9. Update UI state: the selected candidate's row in the candidate list displays a "playing" indicator (e.g., animated waveform icon or pulsing dot). The "Play" button for the selected candidate changes to a "Stop" button. All other candidates show their default "Play" button state.
10. Store a reference to the active `sourceNode` in application state so it can be stopped later.
11. While looping is active, a playback position indicator (a moving vertical line on the waveform overlay) advances across the loop region to show the current read head position within the loop. This is drawn using `requestAnimationFrame` and reflects `audioContext.currentTime` relative to `sourceNode`'s scheduled start time.

> **Musician note:** A moving playhead on the waveform is a small addition but extremely useful — it lets the musician see exactly where the loop is playing within the waveform, which helps confirm that the loop boundaries are landing where expected and gives a visual reference when deciding to manually adjust (see UC-007).

## Alternate Flows

### AF-1: Switch to a different candidate while playing

1. The user clicks "Play" on a different candidate (or presses Down/Up arrow to change selection) while a loop is already playing.
2. The system stops the current `sourceNode` immediately (`sourceNode.stop(0)`, then disconnect and discard it).
3. The system proceeds from Main Flow step 3 with the newly selected candidate.
4. The UI updates: the previously playing candidate reverts to "Play" state; the new candidate shows "playing" state.

> **Musician note:** Switching candidates should be near-instantaneous. The gap between the old loop stopping and the new loop starting must be imperceptible — target under 20 ms. If a musician is rapidly cycling through candidates by pressing arrow keys, any perceivable silence or click between switches will derail the listening evaluation. Gapless switch is more important than crossfade polish here.

### AF-2: User clicks "Stop" (or clicks "Play" on the currently playing candidate)

1. The system calls `sourceNode.stop(0)` and disconnects the node.
2. The active `sourceNode` reference is cleared from application state.
3. The UI reverts the selected candidate's button to "Play" state and removes the "playing" indicator.
4. The `audioContext` is left running (do not suspend it).

### AF-3: User loads a new file while auditioning

This is handled by UC-001 AF-2: audio is stopped as part of the state-clearing process before the new file is loaded. This use case does not need to handle it independently, but the stop logic must be accessible as a standalone function callable from outside UC-004's own UI.

### AF-4: Candidate list is re-ranked or updated

If UC-003 results are refreshed (e.g., re-analysis triggered), the currently playing loop continues uninterrupted. The UI re-renders the candidate list without disrupting the `AudioBufferSourceNode`. The playing candidate remains highlighted in the new list if it still exists; if the candidate has been removed from the new list, playback is stopped and the UI reflects the idle state.

## Failure / Error Cases

### FC-1: `AudioContext` cannot be resumed

- Detection: `audioContext.resume()` promise rejects.
- Response: display an error message: "Audio playback is unavailable. Please interact with the page and try again." Do not attempt to create or start a source node.

### FC-2: `AudioBufferSourceNode.start()` throws

- Detection: any exception thrown from `sourceNode.start()`, most commonly `InvalidStateError` if the node has already been started.
- Response: discard the node. Display: "Playback failed to start. Please try again." Log the exception to the console.

### FC-3: `AudioContext` has been closed

- Detection: `audioContext.state === 'closed'`.
- Response: this is an unrecoverable state. Display a message: "Audio system is unavailable. Please reload the page." Disable all playback controls.

### FC-4: Loop region is zero-length or inverted

- Detection: `endSample <= startSample` in the selected candidate.
- Response: disable the Play button for that candidate and mark the candidate with a warning icon and tooltip: "This loop region is invalid." Do not attempt playback.

### FC-5: startSample or endSample is out of range

- Detection: `startSample < 0` or `endSample > audioBuffer.length`.
- Response: clamp values to `[0, audioBuffer.length]` and log a warning. Proceed with playback using clamped values. If clamping results in a zero-length region, treat as FC-4.

## Acceptance Criteria

1. Clicking "Play" on a candidate begins looped audio playback within 100 ms of the click event.
2. The loop plays seamlessly — no audible gap, click, or pop is heard at the loop wrap point for any candidate with `score >= 0.7`.
3. For candidates where `crossfadeDuration > 0`, the crossfade eliminates or substantially reduces the audible artifact at the wrap point compared to a hard cut.
4. Clicking "Stop" halts playback immediately (within one audio render quantum, typically ~3 ms at 44100 Hz with a 128-sample buffer).
5. Clicking "Play" on a second candidate while the first is playing causes the first to stop and the second to start within 100 ms, with no overlap or silence gap longer than 50 ms between them.
6. After stopping playback, clicking "Play" on the same or a different candidate restarts successfully.
7. The "playing" visual indicator is shown exactly for the candidate that is currently playing, and no other.
8. The playback loop does not drift — after 60 seconds of continuous looping, the loop wrap point is still the same sample as when playback began (no clock drift introduced by repeated start/stop scheduling).
9. The `AudioContext` is not suspended or closed by UC-004 stop operations.
10. If the browser's autoplay policy prevents `audioContext.resume()`, a descriptive error is shown and the application does not crash.
11. Pressing Space while the application is focused toggles play/stop for the currently selected candidate.
12. Pressing Down arrow while a candidate is selected moves selection to the next candidate in the list; pressing Up arrow moves to the previous. If a loop is currently playing and the selection changes, the new candidate begins playing immediately.
13. While a loop is playing, a moving playhead indicator is visible on the waveform at the current read position, updating at least 30 times per second.

## Test Coverage

### Unit (Vitest)
- AC-8: loop scheduling logic does not accumulate drift — given a synthetic sequence of scheduled wrap events, the computed loop start time remains constant across iterations

### E2E (Playwright)
- AC-1: clicking "Play" on a candidate card causes the "playing" indicator to appear within 100 ms
- AC-4: clicking "Stop" removes the "playing" indicator immediately
- AC-5: clicking "Play" on a second candidate while the first is playing causes the first indicator to disappear and the second to appear within 100 ms
- AC-6: after stopping and clicking "Play" again, the "playing" indicator reappears without error
- AC-7: only the currently playing candidate shows the "playing" indicator; all others show the "Play" button state
- AC-9: after stop, `audioContext.state` is still `"running"` (verified via JS evaluation in Playwright)
- AC-10: simulating autoplay-policy block (by not using the `--autoplay-policy=no-user-gesture-required` flag in a targeted test) causes a descriptive error message to appear
- AC-11: pressing Space while the page is focused toggles the "playing" indicator on the selected candidate
- AC-12: pressing Down arrow moves the visual selection highlight to the next candidate; if playing, the new candidate's "playing" indicator appears
- AC-13: while a loop is playing, a moving vertical line is visible on the waveform canvas updating at least 30 times per second (measured via `requestAnimationFrame` timestamps captured in Playwright)

## Notes / Constraints

> **Musician note:** A volume (gain) control for the audition output should be provided — not as a primary feature, but as a practical necessity. Musicians often audition samples while a DAW or other audio is playing in the background, and being able to quickly trim the loop volume prevents clipping or ear fatigue. A simple slider or knob that adjusts the `GainNode` gain (range 0.0–1.0, defaulting to 1.0) is sufficient. This does not affect the exported file — it is audition-only.

> **Musician note:** Loop iteration count should be visible. Showing "Loop 1", "Loop 2", etc. as the loop wraps around is a lightweight but useful indicator that lets the musician confirm the loop is actually looping (not just playing a long single pass) and that the stitch point sounds right every time around. Increment a counter each time the read head passes the loop start, derived from elapsed time.

- Use the `AudioBufferSourceNode` built-in loop mechanism (`sourceNode.loop = true`, `sourceNode.loopStart`, `sourceNode.loopEnd`) rather than manually scheduling repeated plays. This is the most accurate and drift-free looping mechanism available in the Web Audio API.
- `AudioBufferSourceNode` instances are single-use: once `.stop()` is called or the node ends, it cannot be restarted. Always create a new node for each playback start.
- The `loopStart` and `loopEnd` properties take values in seconds (not samples). Always convert: `loopStart = startSample / audioContext.sampleRate`.
- `sourceNode.start(when, offset)`: `when` should be `0` (or `audioContext.currentTime`) for immediate start. The `offset` parameter positions the read head within the buffer at the loop start point so the user does not hear audio before the loop region.
- Crossfade implementation for candidates where `crossfadeDuration > 0`: the recommended approach is to create a second `AudioBufferSourceNode` that plays the crossfade region and a `GainNode` pair that ramps one down and the other up at the wrap point. However, because `AudioBufferSourceNode`'s built-in loop does not natively support crossfading, a simpler acceptable alternative for v1 is: detect the wrap point by listening to the `sourceNode` ended event of a non-looping node and re-scheduling, using `GainNode.gain.linearRampToValueAtTime()` over the crossfade window. The crossfade blend is: `out(t) = end_region(t) * (1 - t/T) + start_region(t) * (t/T)` where `T` is the crossfade duration in samples and `t` goes from 0 to T.
- A `GainNode` must sit between the `AudioBufferSourceNode` and the destination to allow volume control and future muting without stopping and restarting the source. Topology: `sourceNode → gainNode → audioContext.destination`.
- Do not call `sourceNode.disconnect()` before calling `sourceNode.stop()`. Call `stop()` first, then disconnect in the `sourceNode.onended` callback (or immediately after `stop()` — either is safe).
- Maintain a single "playback controller" object in application state that holds the reference to the active source node, gain node, and selected candidate. This makes the stop logic accessible from AF-3 and from UC-001 without tight coupling.
- The `AudioContext` sample rate may differ from the `AudioBuffer`'s sample rate if the context was created with a different target sample rate. In modern browsers, `AudioContext` defaults to the device sample rate and `decodeAudioData` resamples the buffer to match, so `audioBuffer.sampleRate === audioContext.sampleRate` is expected to always be true after decoding. Nonetheless, use `audioContext.sampleRate` (not a stored constant) when converting samples to seconds for `loopStart`/`loopEnd`.
