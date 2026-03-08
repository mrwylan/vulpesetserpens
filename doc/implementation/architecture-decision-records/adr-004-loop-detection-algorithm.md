# ADR-004 — Loop Detection Algorithm Approach

**Date:** 2026-03-08
**Status:** Accepted

## Context

The primary product capability is automatic detection of click-free loop points within an audio sample. This requires a concrete algorithmic strategy. The strategy must be implementable entirely in the browser with no server, no ML inference endpoint, and no third-party DSP library (see ADR-002 and ADR-003). It must also be fast enough to return results in a time frame that feels responsive to a musician — on the order of seconds, not minutes, for typical sample lengths.

A loop "clicks" when there is a discontinuity at the stitch point — the sample frame immediately after the loop end is expected to be the loop start, and if the amplitude or slope jumps between those two frames, the ear hears it as a click or pop. The algorithm must make the absence of such discontinuities its primary criterion.

The algorithm must also surface musically useful loops, not just any click-free boundary pair. A loop of 3.7 samples is click-free but musically useless. Musical duration scoring is needed to rank candidates by how likely they are to correspond to a musical phrase.

## Decision

The loop detection algorithm uses three stages, applied in sequence:

**Stage 1 — Zero-crossing candidate generation**

Scan the decoded mono (or downmixed) sample buffer for zero-crossing frames: frames where the signal crosses through zero amplitude (or is within a configurable near-zero tolerance band). For each candidate loop end point `E`, only frames that are zero-crossings are eligible. Similarly, only zero-crossing frames are eligible as loop start points `S`. This ensures amplitude continuity at the stitch: both ends of the loop boundary are at or near zero amplitude.

**Stage 2 — Slope matching at the stitch point**

For each candidate pair `(S, E)`, compare the slope direction at `S` and `E`. Slope is computed as the sign of the finite difference: `sample[i+1] - sample[i]`. A click-free loop requires that the waveform exits `E` going in the same direction it enters `S` — i.e., `sign(slope at E) == sign(slope at S)`. Pairs where the slopes are opposite are discarded. This enforces slope continuity: the waveform does not reverse direction at the stitch, which would cause a discontinuity in the first derivative (a softer but still audible artifact).

**Stage 3 — Composite scoring**

From the surviving `(S, E)` pairs, four scores are computed and combined into a single composite quality score:

- **`S_shape` (weight 0.35)** — Waveform shape continuity. A 20 ms window of samples immediately after `S` is cross-correlated with a 20 ms window immediately before `E`. The normalized peak cross-correlation value (clamped to [0, 1]) measures how similar the waveform shape is at the two boundary regions. High shape similarity means the audio content flows naturally across the stitch.

- **`S_slope` (weight 0.30)** — Slope continuity. The finite-difference slope at `S` (`samples[S+1] - samples[S]`) is compared to the slope at `E` (`samples[E+1] - samples[E]`). Score penalizes magnitude mismatch: `S_slope = 1.0 - clamp(|slope_S - slope_E| / maxExpectedSlope, 0, 1)`.

- **`S_period` (weight 0.20)** — Musical period alignment. Normalized autocorrelation `R[D]` is computed for the loop duration `D = E - S`, using the first 10 seconds of the signal as the analysis window. Candidates whose duration aligns with a local maximum of `R` (a preferred musical period) score higher. If no preferred period is detected, `S_period = 0.5` for all candidates (neutral). If the user has supplied a BPM reference (UC-006), preferred lengths are computed from bar durations at that tempo, bypassing autocorrelation.

- **`S_energy` (weight 0.15)** — Energy continuity. RMS amplitude is computed over a 50 ms window immediately before `E` and immediately after `S`. Score penalizes a sudden loudness jump at the stitch: `S_energy = 1.0 - clamp(|RMS_E - RMS_S| / maxExpectedRMSDelta, 0, 1)`. A technically click-free loop can still sound jarring if the perceived volume jumps discontinuously at the boundary.

**Composite score:** `score = 0.35 * S_shape + 0.30 * S_slope + 0.20 * S_period + 0.15 * S_energy`

All four weights are named constants in the worker script and are the primary calibration surface for tuning result quality against real-world material (see OQ-3 in `doc/implementation/musician-review.md`).

The top 10 candidates by composite score are returned, after deduplication of pairs whose start and end times both fall within 50 ms of a higher-ranked candidate.

**Execution environment: Web Worker**

All three stages run inside a dedicated **Web Worker**. The raw `Float32Array` buffer is transferred to the worker via the `postMessage` Transferable mechanism. The worker posts progress updates and the final candidate list back to the main thread. The main thread never blocks during analysis.

No machine learning, no server-side computation, and no third-party algorithm library is used.

## Rationale

**Click-free criterion is rigorously defined.** The combination of zero-crossing alignment (amplitude continuity) and slope sign matching (derivative continuity) is the standard formulation for a click-free loop boundary. These two conditions are necessary and sufficient to prevent the most audible artifacts. An optional short crossfade (a few milliseconds of linear interpolation between the end and start) may be applied at export time as an additional safety net, but the algorithm targets pairs that do not require it.

**Autocorrelation for musical period estimation.** Autocorrelation is the canonical method for detecting periodic structure in a signal without requiring frequency-domain analysis. Computing autocorrelation at a given lag directly measures how similar the signal is to a shifted version of itself — which is exactly the right measure for "does this loop length fit the repeating structure of the audio?". It requires no FFT, no spectral analysis, and no external library. It is O(N) per candidate lag, which is tractable in a Web Worker.

**Web Worker for non-blocking execution.** The analysis may take one to several seconds on long files or slow devices. Running it synchronously on the main thread would freeze the UI, violating the experience goal of responsiveness. The Web Worker runs on a separate OS thread; the main thread remains free to update progress indicators and respond to user input.

**No ML.** A machine learning model could potentially produce higher-quality loop candidates by learning from labelled examples of good loops. This was considered and explicitly rejected for v1 for four reasons: (1) ML models require a significant payload (model weights), contradicting the minimal-dependency goal; (2) inference requires either a server or an on-device runtime (TensorFlow.js, ONNX Runtime Web), both of which add complexity; (3) the interpretability of results suffers — it becomes unclear why a candidate was ranked highly; (4) the rule-based algorithm described above is already well-matched to the physical definition of a click-free loop and does not require training data.

## Alternatives Considered

**Spectral domain analysis (FFT-based)** — Comparing the magnitude spectra at loop boundaries (rather than the time-domain signal) can identify smooth transitions in frequency content. This was considered as a supplementary score but rejected for v1 because it requires an FFT implementation (or a dependency), adds computational overhead, and the time-domain zero-crossing + slope match is already a strong proxy for perceptual smoothness at the boundary. Spectral scoring may be added in a future ADR.

**Energy envelope matching** — Rather than comparing individual samples at the boundary, one could compare the RMS envelope over a short window around `S` and `E`. This is more robust to noise but is a weaker constraint than zero-crossing alignment: a smooth envelope match does not guarantee a click-free stitch. It was rejected as the primary criterion, but is included as a secondary scoring factor (`S_energy`) in the composite score (see UC-003 Phase 4f). A sudden jump in perceived loudness at the stitch point is audible even when the waveform passes zero-crossing and slope tests, so energy continuity is a meaningful additional signal.

> **Musician note:** This matters particularly for loops with a strong dynamic contour — for example, a drum loop that ends on a cymbal fade and restarts on a loud kick. The zero-crossing test passes (both are near zero), but the energy context is completely discontinuous and the loop sounds jarring. Energy scoring catches these cases.

**Dynamic programming / exhaustive boundary search** — A DP approach could optimise globally over all possible `(S, E)` pairs simultaneously. This was rejected because the search space is O(N²) in the number of samples, which is computationally prohibitive in the browser for audio buffers of any meaningful length. The zero-crossing pre-filter in Stage 1 reduces the candidate set to a tractable size before Stage 2 and 3 are applied.

## Consequences

- The algorithm implementation is a self-contained TypeScript module with no side effects beyond reading its input buffer and returning an array of candidate objects. It must be fully unit-testable.
- The candidate object type must exactly match the structure defined in UC-003 Phase 6:
  ```ts
  {
    startSample: number        // loop start, integer sample index
    endSample: number          // loop end, integer sample index
    startTime: number          // startSample / sampleRate, seconds
    endTime: number            // endSample / sampleRate, seconds
    duration: number           // endTime - startTime, seconds
    score: number              // composite score, 0.0–1.0
    shapeScore: number         // S_shape sub-score
    slopeScore: number         // S_slope sub-score
    periodScore: number        // S_period sub-score
    energyScore: number        // S_energy sub-score
    crossfadeDuration: number  // recommended crossfade in seconds (0 or 0.01)
    rank: number               // 1-based rank position
    lowConfidence: boolean     // true if score < 0.3 (best-available result)
    userModified: boolean      // set to true by UC-007 when manually adjusted
  }
  ```
  All fields are required. Sub-scores are required for UI display, debugging, and future weight calibration.
- The analysis worker is a separate file (`worker/analysisWorker.ts`) that Vite bundles independently using the `?worker` import syntax. It communicates with the main thread only via `postMessage` / `onmessage`. It has no access to the DOM.
- Progress must be reported from the worker to the main thread at intervals so the UI can display a progress indicator. At minimum, report completion of each stage.
- The zero-crossing tolerance band (the amplitude threshold below which a sample is considered "at zero") is a named constant, not a magic number, and is documented with the reasoning for its default value.
- If a file is too short to produce any candidate pair meeting the minimum loop duration (configurable, default 0.5 seconds), the UI must communicate this clearly rather than displaying an empty result list.
- The algorithm operates on a mono signal. If the input is stereo, it is downmixed to mono for analysis purposes (sum of channels divided by the number of channels). The loop points found on the mono signal are applied to both channels in the exported stereo file.
- Loop duration constraints: minimum `0.5 s`, maximum `min(audioDuration, 60.0) s`. The 60-second ceiling covers 16-bar phrases at 60 BPM (48 s) and is derived from the musician review (see UC-003 Phase 1). Loops outside this range are discarded before scoring.
