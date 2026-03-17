# UC-010 — Cut-Move-Crossfade Post-Processing

> **Creator note:** Sound designers building sustain loops often find that the algorithm surfaces a technically clean loop whose *timbre* feels wrong because the attack transient of the recorded note sits at the loop start. The sample sounds like it re-attacks on every cycle instead of sustaining smoothly. Cut-Move-Crossfade solves this by rotating the phase of the loop region: the material is split, the pieces reordered, and a short crossfade bridges the new junction. The result is a loop that starts mid-sustain rather than at the attack, and the crossfade hides the splice. This is a standard sample-preparation technique in hardware and software samplers — implementing it as a one-click operation, with the cut snapped to a zero-crossing and the crossfade length calculated automatically, removes the friction that currently forces sound designers to open a DAW for this step.

## Trigger

The user clicks the "Cut · Move · Crossfade" button, which is visible on the selected candidate's detail panel when the **Sound Designer** creator profile is active.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- At least one loop candidate exists and is currently selected.
- The **Sound Designer** creator profile is active (`creatorProfile === 'sound-designer'`).
- The selected candidate's loop region is at least 48 samples long (so that the 1/24 overlap is at least 2 samples).

## Main Flow

1. The user clicks the "Cut · Move · Crossfade" button.
2. The system reads the selected candidate's `startSample`, `endSample`, and `duration` from application state. Let `L = endSample - startSample` (loop length in samples).
3. **Cut** — Compute the cut point:
   - Compute the ideal cut index: `idealCut = startSample + Math.round(L * 2 / 3)`.
   - Find the nearest upward zero-crossing to `idealCut` within the `upCrossings` array (the same crossing list stored from UC-003). If no crossing exists within ±10 ms of `idealCut`, use `idealCut` directly (unsnapped fallback).
   - Let `cutSample` be the resolved cut index.
   - Partition the loop into two parts:
     - **Part A** — the first 2/3: original channel data from `[startSample, cutSample)` — `lenA = cutSample - startSample` samples.
     - **Part B** — the last 1/3: original channel data from `[cutSample, endSample)` — `lenB = endSample - cutSample` samples.
4. **Move** — Reorder to [B][A]:
   - The new sequence places Part B first, then Part A.
   - Compute the overlap length: `overlap = Math.max(2, Math.round(L / 24))` samples.
   - The overlap region is at the junction between B and A: the last `overlap` samples of B cross-fade with the first `overlap` samples of A.
5. **Crossfade** — Build the output buffer in three contiguous sections:
   - **Section 1 — B head** (full amplitude): samples `[0, lenB - overlap)` of Part B. Length: `lenB - overlap` samples.
   - **Section 2 — Junction crossfade** (overlap zone): `overlap` samples long. For each index `t` in `[0, overlap)`:
     ```
     weight = t / overlap                       // 0.0 at start → approaches 1.0 at end
     b_idx  = (lenB - overlap) + t              // last `overlap` samples of B
     a_idx  = t                                 // first `overlap` samples of A
     out[t] = B[b_idx] * (1 - weight)          // B fades out (silencing)
            + A[a_idx] * weight                 // A fades in (raising)
     ```
   - **Section 3 — A tail** (full amplitude): samples `[overlap, lenA)` of Part A. Length: `lenA - overlap` samples.
   - Applied identically across all channels. The output is computed as new `Float32Array` channel data — it is not a subarray of the original `AudioBuffer`.
6. The output length in samples is `(lenB - overlap) + overlap + (lenA - overlap)` = `L - overlap` = `L - round(L/24)` ≈ `23L/24`. The output duration in seconds is `outputLength / sampleRate`.
7. The system creates a new `LoopCandidate` entry representing the processed result:
   - `startSample = 0`, `endSample = outputLength` (relative to the processed buffer, not the original).
   - `duration = outputLength / sampleRate`.
   - `processedChannelData`: the new `Float32Array[]` for each channel (stored on the candidate; playback and export use this instead of the original `AudioBuffer` when present).
   - `score`, `beatScore`, `crossfadeDuration` all set to `0` — this is a manually produced result, not a scored detection output.
   - `userModified = true`, `derivedBy = 'cut-move-crossfade'` (a new string literal type alongside `'manual'`).
   - If BPM is set, compute `barAnnotation` and `approximateBars` from the new duration.
8. The new candidate is **appended** to the top of the candidate list (rank 1) and selected automatically. The original candidate remains in the list unchanged (rank shifts down by 1).
9. The waveform overlay updates to show the new candidate's loop region (which spans the full processed buffer from 0 to `outputLength`).
10. If audio was playing, playback stops and the player resets to the beginning of the new candidate.

## Alternate Flows

### AF-1: No upward zero-crossing within ±10 ms of the ideal cut point

The system uses the ideal cut index `idealCut = startSample + Math.round(L * 2/3)` directly without snapping. A subtle notice is shown in the UI: "No zero-crossing found near the cut point — cut applied at exact 2/3 position." Processing continues normally.

### AF-2: Sound Designer profile not active

The "Cut · Move · Crossfade" button is not rendered for Musician or Producer profiles. This flow cannot be triggered.

### AF-3: Processed candidate selected — user clicks "Cut · Move · Crossfade" again

The operation is applied again to the already-processed candidate's `processedChannelData`, treating it as the source signal. Successive applications are allowed; each produces a new candidate prepended to the list.

### AF-4: No candidates exist yet

The button is in a disabled state (not clickable) until at least one candidate is selected.

## Failure / Error Cases

### FC-1: Loop region too short for a meaningful overlap

- Detection: `L < 48` samples (i.e., the overlap floor `round(L/24)` would be less than 2 samples).
- Response: display an inline error adjacent to the button: "Loop region is too short for Cut-Move-Crossfade (minimum 48 samples)." The button appears disabled for this candidate.

### FC-2: Computed output buffer has zero or negative length

- Detection: `L - overlap <= 0` after computing `overlap`.
- Response: same as FC-1. Do not attempt to build the output buffer.

### FC-3: Memory allocation failure (extremely long loop at high sample rate)

- Detection: `new Float32Array(outputLength)` throws a `RangeError`.
- Response: display an error: "Not enough memory to process this loop region." Log the error. Leave application state unchanged.

## Acceptance Criteria

1. With Sound Designer profile active and a candidate selected, a "Cut · Move · Crossfade" button is visible on the candidate detail panel.
2. With Musician or Producer profiles active, the "Cut · Move · Crossfade" button is absent from the UI.
3. After clicking the button, a new candidate appears at rank 1 in the candidate list within 500 ms; the original candidate shifts to rank 2.
4. The new candidate's `duration` equals `(L - round(L/24)) / sampleRate` ± 1 sample tolerance (where `L = endSample - startSample` of the source candidate).
5. The cut point lands on an upward zero-crossing: `sourceSamples[cutSample - 1] < 0 && sourceSamples[cutSample] >= 0`, or falls within ±10 ms of `startSample + round(L * 2/3)` when no crossing is available.
6. The output buffer contains exactly three contiguous sections as specified: B head (full amplitude), crossfade zone (`round(L/24)` samples), A tail (full amplitude).
7. In the crossfade zone, the first sample is weighted `(B_tail[0] * 1.0 + A_head[0] * 0.0)` and the last sample is weighted `(B_tail[n-1] * (1/overlap) + A_head[n-1] * ((overlap-1)/overlap))`, matching the slope formula.
8. Playing the new candidate (UC-004) uses the processed channel data, not the original `AudioBuffer` region.
9. Exporting the new candidate (UC-005) produces a WAV file whose `data` chunk contains exactly `outputLength * numChannels * bytesPerSample` bytes of the processed audio.
10. The new candidate is marked `userModified: true` and `derivedBy: 'cut-move-crossfade'`; the candidate list displays a visual indicator (e.g., a "⟳" or "CMX" badge) to distinguish it from detected candidates.
11. The original source candidate is unchanged after the operation (same `startSample`, `endSample`, `duration`, `score` as before).
12. Applying Cut-Move-Crossfade to the new processed candidate (AF-3) produces a second derived candidate at rank 1; the first processed candidate shifts to rank 2.
13. With loop region length `L < 48` samples, the button is disabled and shows the FC-1 message on hover/focus.

## Test Coverage

### Unit (Vitest)

- AC-4: `cutMoveCrossfade(channelData, sampleRate, cutSample, overlapSamples)` returns channel data of length `L - overlapSamples` for a synthetic mono buffer of known length.
- AC-6 (B head): the first `lenB - overlap` samples of the output match the corresponding samples of Part B verbatim.
- AC-6 (A tail): the last `lenA - overlap` samples of the output match samples `[overlap, lenA)` of Part A verbatim.
- AC-7: at crossfade index `t=0`, output equals `B_tail[0] * 1.0 + A_head[0] * 0.0`; at `t = overlap - 1`, output equals `B_tail[overlap-1] * (1/overlap) + A_head[overlap-1] * ((overlap-1)/overlap)`.
- AC-5 (snap): `snapToCutPoint(idealCut, upCrossings, snapRadiusSamples)` returns the closest crossing within radius or `idealCut` itself when none is found.
- AC-13: `cutMoveCrossfade` called with `L = 40` (< 48) throws or returns `null` with a descriptive error string.
- Stereo: `cutMoveCrossfade` applied to a 2-channel input produces 2-channel output; both channels are processed independently.

### E2E (Playwright)

- AC-1: with Sound Designer active, the "Cut · Move · Crossfade" button is present in the DOM on the selected candidate panel.
- AC-2: with Musician or Producer active, the button is absent.
- AC-3: clicking the button adds a new candidate at rank 1; the previous rank-1 candidate becomes rank 2.
- AC-4: the rank-1 candidate's displayed duration equals the source candidate's duration minus one overlap period (1/24), within ±2 ms.
- AC-10: the rank-1 candidate row shows the CMX visual badge distinguishing it from auto-detected candidates.
- AC-11: the source candidate (now rank 2) retains its original duration and score unchanged.
- AC-9: exporting the processed candidate triggers a WAV download whose file size corresponds to the processed duration at the source sample rate and channel count.

## Notes / Constraints

- `cutMoveCrossfade` is a **pure function** in `src/audio/`: `cutMoveCrossfade(channelData: Float32Array[], cutSample: number, overlapSamples: number): Float32Array[]`. It takes pre-extracted channel data (not an `AudioBuffer`), performs no I/O, and returns new `Float32Array[]`. It is safe to call from the main thread — the output buffer is at most `L` samples, which for the Sound Designer profile maximum of 1 s at 48 kHz is 48 000 samples per channel.
- The `LoopCandidate` type must be extended with an optional `processedChannelData?: Float32Array[]` field. When this field is present, playback (`useAudioPlayer`) must create an `AudioBuffer` from it instead of slicing the original source `AudioBuffer`. Export (`encodeWav`, `encodeAiff`) must also read from `processedChannelData` when present.
- The `derivedBy` field is a new optional string literal union on `LoopCandidate`: `'cut-move-crossfade' | 'manual'` (where `'manual'` was previously implicit via `userModified`). Existing manual-adjustment code does not need to be changed — the `derivedBy` field is additive.
- Zero-crossing snap uses the `upCrossings` array already stored in application state from UC-003. The snap radius is ±10 ms = `Math.round(0.01 * sampleRate)` samples. The snap function must search the `upCrossings` array for the entry with the smallest absolute difference to `idealCut`, then check whether the distance is within the radius.
- The crossfade is a **linear slope** (equal-power is not required here). The intent is to silence the B tail and raise the A head monotonically — a simple linear weight is correct and matches how hardware samplers handle splice crossfades.
- The button label "Cut · Move · Crossfade" uses interpunct (·) separators, not hyphens, to communicate the three-step nature of the operation as a cohesive action rather than a compound noun.
- The "Cut · Move · Crossfade" button must only be rendered when `creatorProfile === 'sound-designer'`. Use a conditional render in the candidate detail component, not a CSS `display: none` — the button must be absent from the accessibility tree for non-sound-designer profiles.
- Processing happens synchronously on the main thread. For the Sound Designer duration limit of 1 s, this is at most ~48 000 samples per channel — negligible computation time.
