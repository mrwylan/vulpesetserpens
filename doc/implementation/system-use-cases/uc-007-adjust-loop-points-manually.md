# UC-007 — Adjust Loop Points Manually

> **Musician note:** This use case was identified as missing during a musician-perspective review. Automatic loop detection is a starting point, not an ending point. Every experienced producer who works with samples will at some point want to nudge a loop boundary by a few milliseconds — to catch the beginning of a transient, avoid a room noise artifact, or align with a musical phrase boundary that the algorithm missed. Without manual adjustment, the tool forces the musician to accept the algorithm's best guess or abandon the tool entirely for a DAW. A simple drag-to-adjust interface on the waveform turns the tool from a one-shot generator into an iterative creative instrument.

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
5. If a loop is currently playing (UC-004 active), the system updates `sourceNode.loopStart` or `sourceNode.loopEnd` in real time as the marker moves. The playing loop adjusts without stopping and restarting — the musician hears the effect of the adjustment immediately.
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

If the user drags the start marker to a position that would place `startSample >= endSample - minSamples` (where `minSamples` corresponds to 0.5 s), the marker stops moving at that minimum-distance boundary. The loop duration floor prevents an invalid or degenerate loop region.

### AF-2: No audio is playing during adjustment

Steps 5 of the Main Flow (real-time loopStart/loopEnd update) is skipped. The adjustment still commits and the waveform overlay updates. The musician can then press Play to hear the adjusted loop from the new boundaries.

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

## Notes / Constraints

- The zero-crossing list (`upCrossings`) computed during UC-003 must be retained in application state and made accessible to this use case. It must not be discarded after analysis completes. This is a state management constraint that must be reflected in the store/reducer design.
- Pixel-to-sample conversion: `sampleIndex = Math.round((pointerX / canvas.clientWidth) * audioBuffer.length)`. Account for `devicePixelRatio` if pointer events return CSS pixel coordinates — convert to the same coordinate space used for rendering.
- Real-time `loopStart`/`loopEnd` updates during playback: setting `sourceNode.loopStart` and `sourceNode.loopEnd` on a playing `AudioBufferSourceNode` takes effect immediately in the Web Audio API without needing to stop and restart the node. This is the correct approach for real-time adjustment during playback.
- The drag interaction must use the Pointer Events API (`pointerdown`, `pointermove`, `pointerup`, `pointercancel`) rather than mouse events. Use `canvas.setPointerCapture(event.pointerId)` on `pointerdown` to ensure `pointermove` events continue to fire even if the pointer exits the canvas during a drag — this allows the musician to drag quickly without losing control.
- Touch support is out of scope for v1 (desktop-first), but the Pointer Events API is compatible with touch devices and will enable touch support in a future iteration without additional refactoring.
- The drag hit area for a boundary marker should be larger than its visual size. A 24px-wide invisible hit zone centered on the marker line makes it much easier to grab, especially on high-DPI displays where the marker line may be only 1 CSS pixel wide.
- Manual adjustment does not trigger re-running the loop detection algorithm. It only updates the selected candidate's boundary values in existing application state.
