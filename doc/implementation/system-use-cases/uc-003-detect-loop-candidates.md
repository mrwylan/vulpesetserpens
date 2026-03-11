# UC-003 — Detect Loop Candidates

## Trigger

An "audio-loaded" event (or equivalent state change) fires after UC-001 completes. Loop detection is initiated automatically — no additional user action is required.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- The `AudioBuffer` has a duration greater than `minDuration` (0.02 seconds / 20 ms) and a sample rate greater than 0.

## Main Flow

The detection algorithm runs entirely in a Web Worker to avoid blocking the main thread. The `AudioBuffer`'s raw channel data is transferred to the worker as a `Float32Array` (or a copy thereof if transfer is not possible).

### Phase 1: Preparation

1. The system posts a "detection-started" event to the main thread, which the UI reflects as a progress/analysis indicator.
2. The worker receives the audio data as a mono signal. If the source has multiple channels, average corresponding samples across all channels element-wise to produce a single `Float32Array` of length `N` (the total sample count).
3. Determine the audio sample rate `sr` (e.g., 44100 or 48000 Hz).
4. Define the minimum loop duration as `minDuration = 0.02` seconds (20 ms) and the maximum loop duration as `maxDuration = min(audioBuffer.duration, 60.0)` seconds. Convert to sample counts: `minSamples = Math.round(minDuration * sr)`, `maxSamples = Math.round(maxDuration * sr)`.

> **Creator note:** The minimum of 0.02 s (20 ms) is chosen to serve the full range of creator profiles. Sound designers building instrument patches need sustain loops as short as a few oscillator cycles — at 100 Hz that is 10 ms; 20 ms covers bass-register content (50 Hz = one cycle at 20 ms) and is a safe practical floor. Musicians isolating notes and producers working with bar-length phrases are unaffected by this floor. The maximum of 60 seconds covers 16 bars at 60 BPM (the longest credible phrase loop) while keeping analysis tractable.

### Phase 2: Identify Zero-Crossing Candidates for Loop Boundaries

5. Build a list of all "upward zero-crossings" in the mono signal: positions `i` where `samples[i-1] < 0 && samples[i] >= 0`. Store as array `upCrossings`.
6. Build a list of all "downward zero-crossings": positions `i` where `samples[i-1] > 0 && samples[i] <= 0`. Store as array `downCrossings`.
7. Loop start candidates are drawn from `upCrossings`. Loop end candidates are drawn from `upCrossings` (matching slope: the signal resumes from a zero-crossing with the same upward slope direction at the loop boundary, ensuring phase continuity).

### Phase 3: Autocorrelation — Musical Period Estimation

8. Compute the normalized autocorrelation of the mono signal to identify likely periodic repeat lengths:
   a. To keep computation tractable, use only the first `analysisWindow = min(N, sr * 10)` samples for the autocorrelation (the first 10 seconds, or the entire signal if shorter).
   b. Compute autocorrelation `R[lag]` for lag values from `minSamples` to `maxSamples`. For each lag `L`:
      ```
      R[L] = Σ ( samples[i] * samples[i + L] ) for i in [0, analysisWindow - L)
      normalized by the energy: R[L] /= sqrt( Σ samples[i]² * Σ samples[i+L]² )
      ```
   c. Find local maxima of `R[lag]` — lags where `R[lag] > R[lag-1]` and `R[lag] > R[lag+1]` and `R[lag] > 0.3` (normalized correlation threshold). These represent candidate musical period lengths. Store as `preferredLengths`.
   d. If no preferred lengths are found, proceed without musical period preference (all zero-crossing pairs are scored on waveform continuity only).

### Phase 4: Score and Rank Candidate Pairs

9. For each pair `(startIdx, endIdx)` formed by taking a start from `upCrossings` and an end from `upCrossings` such that `minSamples <= (endIdx - startIdx) <= maxSamples`:
   a. **Avoid exhaustive search**: do not test all O(M²) pairs. Instead, for each `startIdx`, compute the set of target `endIdx` values = `startIdx + preferredLength ± toleranceSamples` for each `preferredLength` in `preferredLengths`, where `toleranceSamples = Math.round(0.05 * sr)` (50 ms). If no preferred lengths, sample the space: for each `startIdx`, test end points at regular 50 ms intervals within [minSamples, maxSamples] after the start.
      If no preferred lengths exist, sample the space: for each `startIdx`, test end points at regular **5 ms intervals** within `[minSamples, maxSamples]` after the start. A 5 ms step (not 50 ms) is required so that micro-duration candidates in the 20–200 ms range are adequately covered for the sound designer profile.
   b. For each candidate pair, snap `endIdx` to the nearest entry in `upCrossings` within `toleranceSamples` samples of the target. If no crossing is found within tolerance, skip.
   c. **Slope continuity score** `S_slope` (0.0–1.0): Compute the slope at the start crossing as `slope_start = samples[startIdx + 1] - samples[startIdx]` and at the end crossing as `slope_end = samples[endIdx + 1] - samples[endIdx]`. Score: `S_slope = 1.0 - clamp(|slope_start - slope_end| / maxExpectedSlope, 0, 1)`, where `maxExpectedSlope = 0.01` (empirical; tune if needed).
   d. **Waveform shape continuity score** `S_shape` (0.0–1.0): Extract a 20 ms window of samples immediately after `startIdx` (the "start tail") and a 20 ms window immediately before `endIdx` (the "end tail"). Compute the normalized cross-correlation of the two windows. The peak cross-correlation value (clamped to [0, 1]) is `S_shape`.
   e. **Musical period score** `S_period` (0.0–1.0): If `preferredLengths` is non-empty, `S_period = max( R[endIdx - startIdx] )` over all preferred lags within tolerance of the actual loop length. If the loop length does not land near any preferred lag, `S_period = 0.0`. If no preferred lengths exist, `S_period = 0.5` for all candidates (neutral).
   f. **Energy continuity score** `S_energy` (0.0–1.0): Compute the RMS of a 50 ms window immediately before `endIdx` and a 50 ms window immediately after `startIdx`. Score: `S_energy = 1.0 - clamp(|RMS_end_tail - RMS_start_tail| / maxExpectedRMSDelta, 0, 1)`, where `maxExpectedRMSDelta = 0.1`. This rewards candidates where the perceived loudness at the stitch point is continuous — an abrupt jump in level is audible even when the waveform is technically click-free.
   g. **Beat-alignment score** `S_beat` (0.0 or 1.0): Applies only when a BPM value is available (`bpm > 0`) **and** the active creator profile is `producer` or `musician`. Compute the beat grid: `beatPositions[n] = n × (60 / bpm)` seconds, for n = 0, 1, 2, …. For each candidate, compute the nearest beat position to `startTime` and the nearest beat position to `endTime`. If both are within the profile's snap window, `S_beat = 1.0`; otherwise `S_beat = 0.0`. Snap windows: ≤ 5 ms for `producer`, ≤ 20 ms for `musician`. For the `sound-designer` profile, always set `S_beat = 0.0` and exclude it from the composite (beat alignment is meaningless for micro sustain loops).
   h. **Composite score**: The weights depend on whether beat alignment is active:

      | Condition | Formula |
      |-----------|---------|
      | `sound-designer` profile, or BPM unavailable | `score = 0.35 × S_shape + 0.30 × S_slope + 0.20 × S_period + 0.15 × S_energy` |
      | `producer` or `musician` profile with BPM available | `score = 0.30 × S_shape + 0.25 × S_slope + 0.15 × S_period + 0.10 × S_energy + 0.20 × S_beat` |

      Higher is better. The beat-alignment bonus (20% weight) is significant enough to promote beat-aligned candidates above otherwise equivalent non-aligned candidates, but does not override strong waveform-quality signals.

> **Creator note:** The original scoring had no energy continuity term. A loop can pass zero-crossing and slope-match tests perfectly but still sound wrong if the volume level jumps suddenly at the stitch — for example, a loop that ends on a decaying tail and wraps back to a loud attack. The energy score penalizes these cases. The weights have been adjusted: shape and slope remain primary, but musical period and energy continuity share the remaining 35%. These weights are named constants and should be tuned empirically during testing with real sample material.

10. Collect all scored candidates and sort descending by `score`. Retain the top 10 candidates.

11. **Deduplication**: remove candidates whose start and end times both lie within **10 ms** of a higher-ranked candidate already in the output list. This prevents near-duplicate results clustering at the same audio region. A 10 ms tolerance (reduced from any larger value) is necessary so that distinct micro-duration loops that differ by only a few milliseconds are not incorrectly eliminated.

### Phase 5: Crossfade Boundary Preparation

12. For each of the top candidates, compute a recommended crossfade duration:
    - If `S_slope < 0.7` or `S_shape < 0.7`, recommend a 10 ms linear crossfade at the loop boundary.
    - Otherwise, recommend 0 ms crossfade (perfectly clean transition).
    - Store the crossfade duration on the candidate object.

### Phase 6: Return Results

13. The worker posts a "detection-complete" message to the main thread containing an array of candidate objects. Each candidate object includes:
    - `startSample` (integer): loop start in samples
    - `endSample` (integer): loop end in samples
    - `startTime` (float): `startSample / sr` in seconds
    - `endTime` (float): `endSample / sr` in seconds
    - `duration` (float): `endTime - startTime` in seconds
    - `score` (float, 0.0–1.0): composite quality score
    - `slopeScore` (float): `S_slope`
    - `shapeScore` (float): `S_shape`
    - `periodScore` (float): `S_period`
    - `energyScore` (float): `S_energy`
    - `beatScore` (float): `S_beat` (0.0 or 1.0; 0.0 when beat alignment is not applicable)
    - `crossfadeDuration` (float): recommended crossfade in seconds (0 or 0.01)
    - `rank` (integer): 1-based rank position

> **Creator note:** The candidate list UI should display the `duration` field in a legible format for all profiles. Sound designers need millisecond precision (e.g., "22 ms"); producers and musicians benefit from bar/beat annotations when a tempo reference is available (e.g., "≈ 2 bars @ 120 BPM"). At minimum, durations over one minute should be formatted as `mm:ss.ms`. If the user has entered a tempo reference via UC-006, the UI should annotate each candidate with its bar/beat count.

14. The main thread receives the candidates, stores them in application state, dispatches an "candidates-ready" event that triggers:
    - UC-002's overlay rendering pass (loop regions drawn on the waveform)
    - Rendering of the candidate list UI (see UC-004)

## Alternate Flows

### AF-1: Audio shorter than minimum loop duration

If `audioBuffer.duration < minDuration` (less than 0.02 seconds / 20 ms), skip all analysis phases and return an empty candidate list with a reason code `"TOO_SHORT"`.

### AF-2: No zero-crossings found

If `upCrossings.length < 2`, the audio may be DC-offset or effectively silent. Return an empty candidate list with reason code `"NO_CROSSINGS"`.

### AF-3: No candidates survive scoring threshold

If all candidate pairs produce `score < 0.3`, return the top 3 regardless (without threshold filtering) but mark them with a `lowConfidence: true` flag. The UI displays a warning: "No high-quality loop points found. Results shown are best available but may produce audible clicks."

## Failure / Error Cases

### FC-1: Web Worker not supported

- Detection: `typeof Worker === 'undefined'`.
- Response: run the detection algorithm synchronously on the main thread. Display a warning: "Your browser does not support background processing — the UI may be unresponsive during analysis." This is a degraded-but-functional path.

### FC-2: Worker throws an unhandled exception

- Detection: the `Worker` `error` event fires.
- Response: log the error. Display an error message: "Loop detection failed unexpectedly. Please try a different file." Clear the analysis indicator. Application remains in a state where the audio is still loaded and the waveform is still shown.

### FC-3: Detection takes longer than 30 seconds

- Detection: a timeout set on the main thread expires before the worker posts its result.
- Response: terminate the worker (`worker.terminate()`). Display: "Analysis timed out. The audio may be too complex to analyze." Return zero candidates.

### FC-4: Transferred ArrayBuffer is detached before worker finishes

- Detection: any `TypeError: Cannot perform %TypedArray%.prototype.set on a detached ArrayBuffer` in the worker.
- Response: catch the exception inside the worker; post an error message back to the main thread and treat as FC-2.

## Acceptance Criteria

1. For a 4/4 drum loop of 2, 4, or 8 bars at 120 BPM (approximately 2.0, 4.0, or 8.0 seconds), the top-ranked candidate's loop duration is within ±50 ms of the true musical period. Additionally, for a 4-bar loop at 80 BPM (approximately 12.0 seconds) the top candidate must also be within ±50 ms — this tests that slower-tempo material is not cut off by the maxDuration ceiling.
1a. For a synthetic repeating micro-loop (e.g., a sine wave at 50 Hz with a period of 20 ms), at least one returned candidate has a duration within ±5 ms of the true period. This tests that the sound designer use case is served — micro-duration sustain loops must be detectable.
2. For audio that has a clean, obvious loop region, the top candidate's `score` is >= 0.7.
3. All returned candidates have their `startSample` and `endSample` coinciding with upward zero-crossings in the mono signal (verifiable by checking `samples[startSample - 1] < 0 && samples[startSample] >= 0`).
4. No two candidates in the returned list have both `startTime` and `endTime` within 10 ms of each other.
5. The candidate list contains at most 10 entries.
6. Detection completes and posts results to the main thread within 10 seconds for audio files up to 5 minutes in length.
7. For a completely silent audio file (all zeros), the system returns an empty list or a list marked `lowConfidence: true`, and the UI shows an appropriate message without throwing.
8. For audio shorter than 0.02 seconds (20 ms), an empty list is returned with reason code `"TOO_SHORT"` and the UI displays a user-friendly explanation.
9. The waveform overlay is updated with loop candidate regions immediately after the "candidates-ready" event fires.
10. Each candidate object contains all required fields (`startSample`, `endSample`, `startTime`, `endTime`, `duration`, `score`, `slopeScore`, `shapeScore`, `periodScore`, `energyScore`, `beatScore`, `crossfadeDuration`, `rank`).
11. Running detection a second time on the same file (e.g., after replacing and re-uploading the same file) produces the same ranked list (algorithm is deterministic).
12. When a BPM is available and the active profile is `producer`, candidates whose start and end both fall within 5 ms of a beat position receive `beatScore = 1.0`; all others receive `beatScore = 0.0`.
13. When a BPM is available and the active profile is `musician`, candidates whose start and end both fall within 20 ms of a beat position receive `beatScore = 1.0`; all others receive `beatScore = 0.0`.
14. When the active profile is `sound-designer`, `beatScore` is always `0.0` regardless of whether a BPM is available.
15. When BPM is unavailable (field empty), `beatScore` is `0.0` for all profiles and the composite score formula without the beat term is used.

## Test Coverage

### Unit (Vitest)
- AC-3: zero-crossing detector returns indices where `samples[i-1] < 0 && samples[i] >= 0` for a synthetic sine wave
- AC-3: zero-crossing detector treats an exact `0.0` sample as non-negative (upward crossing when previous sample < 0)
- AC-1: on a synthetic sine with a known period (e.g., 44100 samples at 1 Hz), the top candidate duration is within ±50 ms of the true period
- AC-2: composite score for a clean periodic signal is >= 0.7
- AC-4: deduplication function removes candidates whose start and end are both within 10 ms of a higher-ranked entry
- AC-5: ranking function returns at most 10 candidates
- AC-10: each candidate object produced by the algorithm contains all required fields (`startSample`, `endSample`, `startTime`, `endTime`, `duration`, `score`, `slopeScore`, `shapeScore`, `periodScore`, `energyScore`, `beatScore`, `crossfadeDuration`, `rank`)
- AC-11: running the algorithm twice on the same Float32Array input produces identical ranked lists
- AC-12: with a known BPM and `producer` profile, a synthetic candidate pair landing exactly on beat boundaries receives `beatScore = 1.0`; a pair offset by 10 ms receives `beatScore = 0.0`
- AC-13: with the same BPM and `musician` profile, a pair offset by 10 ms still receives `beatScore = 1.0` (within 20 ms snap window)
- AC-14: with `sound-designer` profile, `beatScore` is always `0.0` regardless of BPM
- AC-15: the two composite score formulas (beat-active vs beat-inactive) sum to 1.0 (0.30 + 0.25 + 0.15 + 0.10 + 0.20 = 1.0 and 0.35 + 0.30 + 0.20 + 0.15 = 1.0)
- AC-7: algorithm returns an empty list (or `lowConfidence: true` entries) for an all-zero Float32Array
- AC-8: algorithm returns an empty list with reason code `"TOO_SHORT"` for a Float32Array shorter than 0.02 s (20 ms) at the given sample rate
- AC-1a: on a synthetic 50 Hz sine wave (period = 20 ms), at least one candidate has duration within ±5 ms of 20 ms
- Score weights sum to 1.0 (0.35 + 0.30 + 0.20 + 0.15 = 1.0)

### E2E (Playwright)
- AC-1: after uploading `sine-220hz-4s.wav` fixture, the top candidate duration is within ±50 ms of the known period
- AC-6: detection completes and candidate cards appear within 10 seconds of upload for a 5-minute fixture
- AC-7: uploading `noise-1s.wav` fixture results in an empty list or a low-confidence warning displayed in the UI
- AC-9: candidate overlay regions appear on the waveform canvas immediately after the "candidates-ready" event (verified by observing DOM changes)
- AC-12/13: with Producer profile selected and a BPM value entered, the top-ranked candidate's start and end times each fall within 5 ms of a computed beat position (verified by reading `data-start-time` and `data-end-time` attributes on the candidate card and comparing to beat grid)

## Notes / Constraints

- The detection algorithm runs in a dedicated Web Worker. The `AudioBuffer` cannot be transferred directly to a worker (it is not transferable). Instead, call `audioBuffer.getChannelData(i)` for each channel on the main thread and transfer the resulting `Float32Array` buffers using the structured-clone transfer list: `worker.postMessage({ channels: [...channelArrays] }, channelArrays.map(a => a.buffer))`.
- The normalized autocorrelation computed in Phase 3 is the key mechanism for musical period detection. It is computationally expensive for long windows. Limit the analysis window to 10 seconds as specified. For the cross-correlation of 20 ms windows in Phase 4d, use a direct O(n²) inner loop — the window is short enough (at 44100 Hz, 20 ms = 882 samples) that FFT-based correlation is not required.
- Zero-crossing detection must account for exact zeros: a sample value of exactly `0.0` should be treated as non-negative (i.e., belonging to the "upward" or "at zero and continuing upward" category). Use strict `< 0` for the previous sample.
- The `maxExpectedSlope` constant used in slope scoring (Phase 4c) is empirical. At 44100 Hz, a sine wave at 440 Hz (concert A) has a maximum sample-to-sample slope of approximately `2π × 440 / 44100 ≈ 0.0627`. For general audio, slopes much larger than `0.01` indicate steep transients. Tuning this value affects how harshly the slope mismatch is penalized.
- The composite score weights (0.4 shape, 0.35 slope, 0.25 period) are initial values and may require tuning during testing. Define them as named constants at the top of the worker script.
- Candidate objects are plain serializable JavaScript objects (no class instances, no functions, no circular references) so they can be passed through the structured-clone algorithm used by `postMessage`.
- The crossfade duration stored on each candidate (Phase 5) is a recommendation for UC-004's playback engine. UC-004 must apply this crossfade when scheduling looped playback.
- The worker accepts a `bpm` parameter from either a user-supplied value (UC-006) or automatic BPM detection (UC-006 iteration 2). When `bpm` is available, the worker computes beat-aligned scoring as described in Phase 4g. The `creatorProfile` parameter must also be passed to the worker so it can apply the correct snap window and composite formula.
- Automatic BPM detection (inferring tempo from the audio signal without user input) is specified as M2-G6 in iteration 2. When detection is implemented, the worker will post a `detectedBpm` and `bpmConfidence` value alongside the candidate list. UC-006 governs how the detected value is presented and overridden by the user.

> **Creator note:** Almost every producer knows the BPM of their sample — it's usually embedded in the filename ("loop_120bpm.wav") or stamped on the sample pack. A simple BPM input field transforms the period scoring from a guess into a certainty, and is the single highest-leverage improvement to musical quality of results. It does not require automatic BPM detection; user-supplied is sufficient.
- For Phase 4a, the pair-search strategy must avoid O(M²) complexity. On a 5-minute file at 44100 Hz there are approximately 13 million samples and potentially tens of thousands of zero-crossings; an exhaustive pairing would take minutes. The preferred-length + tolerance window approach reduces this to O(M × P) where P is the number of preferred period lengths (typically < 10).
