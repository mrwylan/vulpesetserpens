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
7. The system creates a new `DerivedCandidate` entry representing the processed result:
   - `sourceId`: the `id` of the source `LoopCandidate` this was derived from.
   - `startSample = 0`, `endSample = outputLength` (offsets into the processed buffer, not the original `AudioBuffer`).
   - `duration = outputLength / sampleRate`.
   - `processedChannelData`: the new `Float32Array[]` for each channel (playback and export read from this instead of the original `AudioBuffer`).
   - `derivedBy = 'cut-move-crossfade'`.
   - If BPM is set, compute `barAnnotation` and `approximateBars` from the new duration.
8. The new `DerivedCandidate` is **appended** to the end of the **Post-Processing Results** list, which is a separate application state array (`derivedCandidates`) independent of the main `candidates` array. The main candidate list is not modified. The new derived candidate is selected automatically within the post-processing section.
9. The post-processing results row becomes visible (if it was previously hidden) and scrolls to show the newly added card.
10. The main waveform overlay retains the source candidate's loop region highlighted. A thin vertical marker at `cutSample` is drawn on the waveform in a neutral colour (e.g., `--color-text-disabled`) to show where the cut was applied.
11. If audio was playing, playback stops and the player resets to the beginning of the new derived candidate.

## Alternate Flows

### AF-1: No upward zero-crossing within ±10 ms of the ideal cut point

The system uses the ideal cut index `idealCut = startSample + Math.round(L * 2/3)` directly without snapping. A subtle notice is shown in the UI: "No zero-crossing found near the cut point — cut applied at exact 2/3 position." Processing continues normally.

### AF-2: Sound Designer profile not active

The "Cut · Move · Crossfade" button is not rendered for Musician or Producer profiles. This flow cannot be triggered.

### AF-3: Processed candidate selected — user clicks "Cut · Move · Crossfade" again

The operation can be applied to any main-list candidate regardless of how many derived candidates already exist. Each invocation adds a new card to the post-processing results row, using the source candidate's original audio data as input. The source candidate's `id` links each derived card back to its origin. Re-applying from the same source is allowed; this produces successive phase-rotated variants side by side in the post-processing row.

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

1. With Sound Designer profile active and a candidate selected, a "Cut · Move · Crossfade" button is visible on the candidate's card in the main candidate row.
2. With Musician or Producer profiles active, the "Cut · Move · Crossfade" button is absent from all candidate cards.
3. After clicking the button, a new derived candidate card appears in the post-processing results row within 500 ms. The main candidate list is unchanged.
4. The new derived candidate's `duration` equals `(L - round(L/24)) / sampleRate` ± 1 sample tolerance (where `L = endSample - startSample` of the source candidate).
5. The cut point lands on an upward zero-crossing: `sourceSamples[cutSample - 1] < 0 && sourceSamples[cutSample] >= 0`, or falls within ±10 ms of `startSample + round(L * 2/3)` when no crossing is available.
6. The output buffer contains exactly three contiguous sections as specified: B head (full amplitude), crossfade zone (`round(L/24)` samples), A tail (full amplitude).
7. In the crossfade zone, the first sample is weighted `(B_tail[0] * 1.0 + A_head[0] * 0.0)` and the last sample is weighted `(B_tail[n-1] * (1/overlap) + A_head[n-1] * ((overlap-1)/overlap))`, matching the slope formula.
8. Playing a derived candidate (UC-004) uses the `processedChannelData`, not the original `AudioBuffer` region.
9. Exporting a derived candidate (UC-005) produces a WAV file whose `data` chunk contains exactly `outputLength * numChannels * bytesPerSample` bytes of the processed audio.
10. Each derived candidate card in the post-processing row displays the "CMX" badge, the `duration`, and source candidate reference (e.g., "from #2"), along with Play and Export buttons.
11. The source candidate in the main row is unchanged after the operation (same `startSample`, `endSample`, `duration`, `score`).
12. Clicking "Cut · Move · Crossfade" on the same or a different source candidate appends an additional card to the post-processing row; cards already in the row are unaffected.
13. With loop region length `L < 48` samples, the button is disabled and shows the FC-1 message on hover/focus.
14. The post-processing results row is hidden (not rendered) when `derivedCandidates` is empty; it becomes visible as soon as the first derived candidate is added.
15. A vertical cut-point marker appears on the waveform at the `cutSample` position when the source candidate is selected, and disappears when a different main candidate is selected.

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

- AC-1: with Sound Designer active, the "Cut · Move · Crossfade" button is present on the candidate card in the main row.
- AC-2: with Musician or Producer active, the button is absent from all candidate cards.
- AC-3: clicking the button makes the post-processing results row visible and adds one derived candidate card to it.
- AC-4: the derived candidate card's displayed duration equals the source candidate's duration minus one overlap period (≈1/24), within ±2 ms.
- AC-10: the derived candidate card shows the "CMX" badge and a "from #N" source reference label.
- AC-11: the source candidate in the main row retains its original duration and score unchanged.
- AC-12: clicking "Cut · Move · Crossfade" a second time (on any main candidate) appends a second card to the post-processing row; the first derived card is unchanged.
- AC-14: before any CMX operation, the post-processing row is absent from the DOM.
- AC-9: exporting a derived candidate triggers a WAV download whose file size corresponds to the processed duration at the source sample rate and channel count.

## Notes / Constraints

- `cutMoveCrossfade` is a **pure function** in `src/audio/`: `cutMoveCrossfade(channelData: Float32Array[], cutSample: number, overlapSamples: number): Float32Array[]`. It takes pre-extracted channel data (not an `AudioBuffer`), performs no I/O, and returns new `Float32Array[]`. It is safe to call from the main thread — the output buffer is at most `L` samples, which for the Sound Designer profile maximum of 1 s at 48 kHz is 48 000 samples per channel.
- A new `DerivedCandidate` type is added to `src/types.ts` (separate from `LoopCandidate`):
  ```ts
  interface DerivedCandidate {
    id: string                        // unique id (e.g. crypto.randomUUID())
    sourceId: string                  // id of the LoopCandidate this was derived from
    derivedBy: 'cut-move-crossfade'
    processedChannelData: Float32Array[]
    startSample: number               // always 0
    endSample: number                 // = outputLength
    duration: number                  // seconds
    barAnnotation?: string
    approximateBars?: number
  }
  ```
  `LoopCandidate` is not modified — keeping the two types separate avoids polluting the detection type with post-processing concerns.
- Application state gains a `derivedCandidates: DerivedCandidate[]` array (initially empty, reset to `[]` when a new file is loaded or re-analysis runs). Playback (`useAudioPlayer`) and export (`encodeWav`, `encodeAiff`) must accept a `DerivedCandidate` in addition to a `LoopCandidate` — they branch on whether the audio source is `processedChannelData` (derived) or a subarray of the original `AudioBuffer` (detected).
- Zero-crossing snap uses the `upCrossings` array already stored in application state from UC-003. The snap radius is ±10 ms = `Math.round(0.01 * sampleRate)` samples. The snap function must search the `upCrossings` array for the entry with the smallest absolute difference to `idealCut`, then check whether the distance is within the radius.
- The crossfade is a **linear slope** (equal-power is not required here). The intent is to silence the B tail and raise the A head monotonically — a simple linear weight is correct and matches how hardware samplers handle splice crossfades.
- The button label "Cut · Move · Crossfade" uses interpunct (·) separators, not hyphens, to communicate the three-step nature of the operation as a cohesive action rather than a compound noun.
- The "Cut · Move · Crossfade" button must only be rendered when `creatorProfile === 'sound-designer'`. Use a conditional render in the candidate card component, not a CSS `display: none` — the button must be absent from the accessibility tree for non-sound-designer profiles.
- Processing happens synchronously on the main thread. For the Sound Designer duration limit of 1 s, this is at most ~48 000 samples per channel — negligible computation time.
- The post-processing results row is a sibling section to `<CandidateSection>` in the component tree (see ui-layout-spec.md), rendered only when `derivedCandidates.length > 0` and `creatorProfile === 'sound-designer'`. It is not a nested sub-list inside `<CandidateSection>`.
- `derivedCandidates` must be reset to `[]` when the user loads a new file (`handleClose` / `handleFileSelected`) or when re-analysis runs (profile change, BPM change), as the processed audio is based on the old source buffer.
