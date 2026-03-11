# UC-007 — Adjust Loop Points Manually

> **Creator note:** This use case was identified as missing during a creator-perspective review. Automatic loop detection is a starting point, not an ending point. Every creator — whether a sound designer fine-tuning a sustain loop by a single zero-crossing, a musician catching the exact onset of a note, or a producer aligning to a phrase boundary the algorithm missed — will at some point need to nudge a loop boundary. Without manual adjustment, the tool forces the creator to accept the algorithm's best guess or abandon the tool for a DAW or sampler editor. A simple drag-to-adjust interface on the waveform turns the tool from a one-shot generator into an iterative creative instrument.

## Trigger

The user drags a loop boundary marker (start or end) on the waveform visualization, or uses fine-adjust controls (nudge buttons or keyboard shortcuts) to move the selected candidate's start or end point.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- At least one loop candidate exists in the candidate list and is currently selected.
- The waveform canvas is rendered with the selected candidate's loop boundary markers visible (see UC-002 AF-1).

## Main Flow

### Dragging a boundary marker

1. The user moves the pointer over a loop boundary marker on the waveform (a thin vertical line at the `startSample` or `endSample` position of the selected candidate). The cursor changes to a horizontal-resize cursor to signal draggability.
2. The user clicks and begins dragging the marker horizontally. The marker follows the pointer in real time.
3. As the marker moves, the system continuously snaps it to the nearest upward zero-crossing within ±5 ms of the current pointer position (the same zero-crossings computed during UC-003 Phase 2). Snapping is a default-on behavior that can be temporarily overridden by holding Alt/Option.
4. The waveform overlay re-renders in real time as the marker moves, updating the highlighted loop region and the boundary marker position.
5. If a loop is currently playing (UC-004 active), the system updates `sourceNode.loopStart` or `sourceNode.loopEnd` in real time as the marker moves. The playing loop adjusts without stopping and restarting — the creator hears the effect of the adjustment immediately.
6. On mouse/pointer release, the system commits the new position:
   - If snapping is active, the committed position is the nearest upward zero-crossing to the final pointer position.
   - If snapping is overridden, the committed position is the exact sample under the pointer position, converted from pixel coordinates to sample index: `newSample = Math.round(pointerXRatio * audioBuffer.length)`, where `pointerXRatio = pointerX / canvas.clientWidth`.
7. The system updates the selected candidate object in application state: `candidate.startSample` or `candidate.endSample` is replaced with the new value. `startTime`, `endTime`, `duration`, and any bar annotation are recomputed from the new values.
8. The candidate list UI re-renders to show the updated duration and time values for the adjusted candidate.
9. The system marks the candidate as "user-modified" (a boolean flag `userModified: true`) so that it can be visually distinguished from algorithm-generated candidates. The score field is no longer meaningful after manual adjustment; it may be displayed with a note "manually adjusted".

### Nudge buttons (fine adjustment)

10. The user clicks a "◀" (nudge left) or "▶" (nudge right) button adjacent to the start or end time display, or presses Comma/Period while a boundary is focused.
11. Each nudge press moves the boundary by exactly one zero-crossing step in the specified direction (moving to the next or previous upward zero-crossing in the `upCrossings` array from UC-003).
12. Steps 5–9 apply after each nudge, except that the update is committed immediately without a drag/release cycle.

## Alternate Flows

### AF-1: Dragging start past end (or end past start)

If the user drags the start marker to a position that would place `startSample >= endSample - minSamples` (where `minSamples` corresponds to `minDuration = 0.02 s`, i.e., 20 ms), the marker stops moving at that minimum-distance boundary. The loop duration floor prevents an invalid or degenerate loop region.

### AF-2: No audio is playing during adjustment

Steps 5 of the Main Flow (real-time loopStart/loopEnd update) is skipped. The adjustment still commits and the waveform overlay updates. The creator can then press Play to hear the adjusted loop from the new boundaries.

### AF-3: Snapping overridden (Alt/Option held)

The marker can be placed at any sample position, not just zero-crossings. This is useful for drum loops where a precise transient onset (which may not be at a zero-crossing) is the desired boundary. The UI displays a subtle indicator that snapping is disabled. After releasing Alt, snapping re-engages for the next drag.

### AF-4: User wants to reset to algorithm-generated values

A "Reset" button adjacent to the adjusted candidate restores `startSample` and `endSample` to the values originally produced by UC-003 for that candidate. The `userModified` flag is cleared.

### AF-5: Multiple candidates exist; user is adjusting the selected one

Manual adjustment only affects the currently selected candidate. Other candidates in the list are unaffected and retain their algorithm-generated values. The adjusted candidate may be re-ranked visually (by duration change) but is not removed from the list.

## Failure / Error Cases

### FC-1: Pointer leaves the canvas during drag

- Detection: a `pointerleave` or `mouseleave` event fires on the canvas while a drag is in progress.
- Response: cancel the drag. Revert the marker to its pre-drag position (the last committed value). The loop continues playing (if active) from the previous boundary. The cursor returns to default.

### FC-2: No upward zero-crossings within the snap radius

- Detection: no entry in `upCrossings` falls within ±5 ms of the pointer position.
- Response: the marker does not snap and remains at the last snapped position. The system does not move the marker to an unsupported position while snapping is active. A subtle tooltip may indicate "No zero-crossing found nearby — hold Alt to place freely."

### FC-3: Adjusted region becomes invalid after edit

- Detection: after committing, `endSample <= startSample`.
- Response: this should be prevented by AF-1, but as a safety check, if the committed values produce an invalid region, revert both to their pre-drag values and display a warning: "The adjusted loop region would be empty or inverted. Adjustment was not applied."

## Acceptance Criteria

1. Dragging the start boundary marker left or right moves the loop start position visibly on the waveform in real time (no perceptible lag, targeting < 16 ms update latency).
2. When snapping is active, the marker always lands on an upward zero-crossing after release; the committed `startSample` value passes the zero-crossing check `samples[startSample - 1] < 0 && samples[startSample] >= 0`.
3. If a loop is playing during boundary adjustment, the playback loop boundary updates within one audio render quantum (approximately 3 ms at 44100 Hz / 128-sample buffer) of the pointer position changing.
4. After dragging the end boundary from 4.00 s to 3.80 s, the candidate's displayed duration changes to approximately 3.80 s − startTime.
5. The nudge buttons move the boundary by exactly one zero-crossing step per click.
6. The "Reset" button restores the original algorithm-generated start and end values for the candidate.
7. The adjusted candidate is visually marked as "manually adjusted" in the candidate list (e.g., a small pencil icon or "(adjusted)" label).
8. Holding Alt/Option while dragging allows the marker to be placed at any sample, not constrained to zero-crossings.
9. Dragging the start marker past the end marker (or vice versa) is blocked at the minimum-duration floor; the marker stops rather than crossing.
10. After manual adjustment, exporting the candidate (UC-005) uses the adjusted `startSample` / `endSample` values, not the original algorithm values.

## Test Coverage

### Unit (Vitest)
- AC-2: zero-crossing snap function, given a pointer sample index and a synthetic `upCrossings` array, returns the nearest crossing within ±5 ms and never returns a non-crossing index when snapping is active
- AC-5: nudge function increments or decrements the boundary to exactly the next or previous entry in the `upCrossings` array
- AC-9: boundary-constraint function clamps the start marker at `endSample - minSamples` and prevents it from crossing the end marker
- Pixel-to-sample conversion: `Math.round((pointerXRatio) * audioBuffer.length)` is correctly computed for boundary values (0, 0.5, 1.0)

### E2E (Playwright)
- AC-1: dragging a loop boundary marker updates its pixel position on the waveform canvas in real time with < 16 ms observed latency
- AC-2: after releasing the drag with snapping active, `candidate.startSample` satisfies `samples[startSample - 1] < 0 && samples[startSample] >= 0` (verified via JS evaluation)
- AC-4: after dragging the end marker to a new position, the displayed duration in the candidate list reflects the updated end time
- AC-6: clicking "Reset" restores the original algorithm-generated `startSample` and `endSample` (verified by comparing displayed values before adjustment and after reset)
- AC-7: after any manual adjustment, the candidate row displays a "manually adjusted" visual marker (e.g., pencil icon or "(adjusted)" label)
- AC-8: holding Alt while dragging allows the marker to be placed at a non-zero-crossing sample (verified by checking that the committed sample is not in `upCrossings`)
- AC-9: dragging the start marker past the end marker position is blocked — the marker stops at the minimum-duration floor
- AC-10: after manually adjusting a candidate, exporting it produces a WAV file whose `data` chunk length corresponds to the adjusted `endSample - startSample` (not the original algorithm values)
- AC-3: if a loop is playing while a boundary is dragged, the `sourceNode.loopStart` or `sourceNode.loopEnd` property updates within one audio render quantum (verified by observing audio glitch-free continuation in the E2E test)

## Notes / Constraints

- The zero-crossing list (`upCrossings`) computed during UC-003 must be retained in application state and made accessible to this use case. It must not be discarded after analysis completes. This is a state management constraint that must be reflected in the store/reducer design.
- Pixel-to-sample conversion: `sampleIndex = Math.round((pointerX / canvas.clientWidth) * audioBuffer.length)`. Account for `devicePixelRatio` if pointer events return CSS pixel coordinates — convert to the same coordinate space used for rendering.
- Real-time `loopStart`/`loopEnd` updates during playback: setting `sourceNode.loopStart` and `sourceNode.loopEnd` on a playing `AudioBufferSourceNode` takes effect immediately in the Web Audio API without needing to stop and restart the node. This is the correct approach for real-time adjustment during playback.
- The drag interaction must use the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) rather than mouse events. Use `canvas.setPointerCapture(event.pointerId)` on `pointerdown` to ensure `pointermove` events continue to fire even if the pointer exits the canvas during a drag — this allows the creator to drag quickly without losing control.
- Touch support is out of scope for v1 (desktop-first), but the Pointer Events API is compatible with touch devices and will enable touch support in a future iteration without additional refactoring.
- The drag hit area for a boundary marker should be larger than its visual size. A 24px-wide invisible hit zone centered on the marker line makes it much easier to grab, especially on high-DPI displays where the marker line may be only 1 CSS pixel wide.
- Manual adjustment does not trigger re-running the loop detection algorithm. It only updates the selected candidate's boundary values in existing application state.
