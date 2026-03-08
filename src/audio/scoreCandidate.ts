/**
 * Score functions for loop candidates (UC-003 Phase 4).
 * All functions are pure — no side effects, no DOM access.
 */

// Weight constants (must sum to 1.0)
export const WEIGHT_SHAPE  = 0.35
export const WEIGHT_SLOPE  = 0.30
export const WEIGHT_PERIOD = 0.20
export const WEIGHT_ENERGY = 0.15

// Maximum expected slope for a typical audio signal (tunable constant)
// At 44100 Hz, a 440 Hz sine has max slope ≈ 0.0627
// Using 0.01 as a moderate empirical threshold
export const MAX_EXPECTED_SLOPE = 0.01

// Maximum expected RMS energy delta at the stitch point
export const MAX_EXPECTED_RMS_DELTA = 0.1

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

/**
 * Compute RMS of a window of samples.
 */
function rms(samples: Float32Array, startIdx: number, length: number): number {
  const end = Math.min(startIdx + length, samples.length)
  const actualLen = end - startIdx
  if (actualLen <= 0) return 0

  let sumSq = 0
  for (let i = startIdx; i < end; i++) {
    const s = samples[i]!
    sumSq += s * s
  }
  return Math.sqrt(sumSq / actualLen)
}

/**
 * Compute normalized cross-correlation peak between two windows.
 * Returns a value in [0, 1].
 */
function normalizedCrossCorrelation(a: Float32Array, startA: number, b: Float32Array, startB: number, windowLen: number): number {
  const lenA = Math.min(windowLen, a.length - startA)
  const lenB = Math.min(windowLen, b.length - startB)
  const len = Math.min(lenA, lenB)
  if (len <= 0) return 0

  let sumAB = 0
  let sumA2 = 0
  let sumB2 = 0

  for (let i = 0; i < len; i++) {
    const sa = a[startA + i]!
    const sb = b[startB + i]!
    sumAB += sa * sb
    sumA2 += sa * sa
    sumB2 += sb * sb
  }

  const denom = Math.sqrt(sumA2 * sumB2)
  if (denom === 0) return 0
  return clamp(sumAB / denom, 0, 1)
}

/**
 * S_shape: waveform shape continuity score.
 * Cross-correlates a 20ms window after startIdx with 20ms window before endIdx.
 *
 * @param samples - mono audio signal
 * @param startIdx - loop start sample index
 * @param endIdx - loop end sample index
 * @param sampleRate - audio sample rate
 */
export function computeShapeScore(
  samples: Float32Array,
  startIdx: number,
  endIdx: number,
  sampleRate: number
): number {
  const windowSamples = Math.round(0.02 * sampleRate) // 20ms
  // "start tail": samples immediately after startIdx
  const startTailBegin = startIdx
  // "end tail": samples immediately before endIdx
  const endTailBegin = endIdx - windowSamples

  if (endTailBegin < 0 || startTailBegin + windowSamples > samples.length) {
    return 0
  }

  return normalizedCrossCorrelation(samples, startTailBegin, samples, endTailBegin, windowSamples)
}

/**
 * S_slope: slope continuity score.
 * Compares the finite-difference slope at the start and end crossings.
 *
 * @param samples - mono audio signal
 * @param startIdx - loop start sample index
 * @param endIdx - loop end sample index
 */
export function computeSlopeScore(
  samples: Float32Array,
  startIdx: number,
  endIdx: number
): number {
  if (startIdx + 1 >= samples.length || endIdx + 1 >= samples.length) {
    return 0
  }

  const slopeStart = (samples[startIdx + 1]!) - (samples[startIdx]!)
  const slopeEnd = (samples[endIdx + 1] ?? samples[endIdx]!) - (samples[endIdx]!)

  const diff = Math.abs(slopeStart - slopeEnd)
  return 1.0 - clamp(diff / MAX_EXPECTED_SLOPE, 0, 1)
}

/**
 * S_period: musical period alignment score.
 * If preferredLengths is empty, returns 0.5 (neutral).
 * Otherwise, returns the max correlation at any preferred lag near the loop duration.
 *
 * @param loopLengthSamples - number of samples in the loop (endIdx - startIdx)
 * @param preferredLengths - candidate period lengths from autocorrelation
 * @param toleranceSamples - tolerance for matching to a preferred length
 * @param correlationValues - autocorrelation values for indexing
 * @param minLag - offset of correlationValues[0]
 */
export function computePeriodScore(
  loopLengthSamples: number,
  preferredLengths: number[],
  toleranceSamples: number,
  correlationValues: Float32Array,
  minLag: number
): number {
  if (preferredLengths.length === 0) return 0.5

  let maxCorr = 0
  for (const pref of preferredLengths) {
    if (Math.abs(pref - loopLengthSamples) <= toleranceSamples) {
      const idx = loopLengthSamples - minLag
      if (idx >= 0 && idx < correlationValues.length) {
        maxCorr = Math.max(maxCorr, clamp(correlationValues[idx]!, 0, 1))
      }
    }
  }

  return maxCorr
}

/**
 * S_energy: energy continuity score.
 * Compares RMS over 50ms windows at the stitch point.
 *
 * @param samples - mono audio signal
 * @param startIdx - loop start sample index
 * @param endIdx - loop end sample index
 * @param sampleRate - audio sample rate
 */
export function computeEnergyScore(
  samples: Float32Array,
  startIdx: number,
  endIdx: number,
  sampleRate: number
): number {
  const windowSamples = Math.round(0.05 * sampleRate) // 50ms

  const rmsEnd = rms(samples, endIdx - windowSamples, windowSamples)
  const rmsStart = rms(samples, startIdx, windowSamples)

  return 1.0 - clamp(Math.abs(rmsEnd - rmsStart) / MAX_EXPECTED_RMS_DELTA, 0, 1)
}

/**
 * Composite score from all four sub-scores.
 */
export function computeCompositeScore(
  shapeScore: number,
  slopeScore: number,
  periodScore: number,
  energyScore: number
): number {
  return WEIGHT_SHAPE * shapeScore
    + WEIGHT_SLOPE * slopeScore
    + WEIGHT_PERIOD * periodScore
    + WEIGHT_ENERGY * energyScore
}
