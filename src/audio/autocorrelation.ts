/**
 * Normalized autocorrelation for musical period estimation.
 * Used in UC-003 Phase 3 to identify likely periodic repeat lengths.
 *
 * Analysis window is limited to 10 seconds to keep computation tractable.
 */

export interface AutocorrelationResult {
  /** Array of normalized correlation values indexed by lag (starting from minLag) */
  values: Float32Array<ArrayBuffer>
  /** The starting lag index (samples) */
  minLag: number
  /** The ending lag index (samples, exclusive) */
  maxLag: number
  /** Lag indices of local maxima above threshold */
  preferredLengths: number[]
}

const CORRELATION_THRESHOLD = 0.3

/**
 * Compute normalized autocorrelation for lags in [minLag, maxLag).
 * Uses at most the first analysisWindow samples.
 *
 * @param samples - mono audio signal
 * @param minLag - minimum lag in samples (inclusive)
 * @param maxLag - maximum lag in samples (exclusive)
 * @param analysisWindow - max samples to use for analysis
 */
export function computeAutocorrelation(
  samples: Float32Array,
  minLag: number,
  maxLag: number,
  analysisWindow: number
): AutocorrelationResult {
  const N = Math.min(samples.length, analysisWindow)
  const lagCount = maxLag - minLag
  const values = new Float32Array(lagCount)

  for (let lagIdx = 0; lagIdx < lagCount; lagIdx++) {
    const lag = minLag + lagIdx
    const windowLen = N - lag
    if (windowLen <= 0) {
      values[lagIdx] = 0
      continue
    }

    let sumProducts = 0
    let sumSq1 = 0
    let sumSq2 = 0

    for (let i = 0; i < windowLen; i++) {
      const s1 = samples[i]!
      const s2 = samples[i + lag]!
      sumProducts += s1 * s2
      sumSq1 += s1 * s1
      sumSq2 += s2 * s2
    }

    const denom = Math.sqrt(sumSq1 * sumSq2)
    values[lagIdx] = denom > 0 ? sumProducts / denom : 0
  }

  // Find local maxima above threshold
  const preferredLengths: number[] = []
  for (let i = 1; i < lagCount - 1; i++) {
    const v = values[i]!
    if (v > CORRELATION_THRESHOLD && v > (values[i - 1]!) && v > (values[i + 1]!)) {
      preferredLengths.push(minLag + i)
    }
  }

  return { values, minLag, maxLag, preferredLengths }
}

/**
 * Get the autocorrelation value at a specific lag.
 * Returns 0 if lag is out of range.
 */
export function getCorrelationAtLag(result: AutocorrelationResult, lag: number): number {
  const idx = lag - result.minLag
  if (idx < 0 || idx >= result.values.length) return 0
  return result.values[idx]!
}
