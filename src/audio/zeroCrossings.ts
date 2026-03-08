/**
 * Zero-crossing detection for loop candidate generation.
 *
 * Upward zero-crossing: sample[i-1] < 0 AND sample[i] >= 0
 * A sample of exactly 0.0 is treated as non-negative (part of the upward side).
 * This matches ADR-004 and UC-003 Phase 2 spec.
 */

/**
 * Returns an array of sample indices where the signal crosses upward through zero.
 * Index i is included when samples[i-1] < 0 && samples[i] >= 0.
 */
export function findUpwardZeroCrossings(samples: Float32Array): number[] {
  const crossings: number[] = []

  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1]!) < 0 && (samples[i]!) >= 0) {
      crossings.push(i)
    }
  }

  return crossings
}

/**
 * Returns an array of sample indices where the signal crosses downward through zero.
 * Index i is included when samples[i-1] > 0 && samples[i] <= 0.
 */
export function findDownwardZeroCrossings(samples: Float32Array): number[] {
  const crossings: number[] = []

  for (let i = 1; i < samples.length; i++) {
    if ((samples[i - 1]!) > 0 && (samples[i]!) <= 0) {
      crossings.push(i)
    }
  }

  return crossings
}

/**
 * Snap a sample index to the nearest upward zero-crossing within a tolerance window.
 * Returns the snapped index, or null if none found within tolerance.
 *
 * @param target - the target sample index
 * @param upCrossings - sorted array of upward zero-crossing indices
 * @param toleranceSamples - maximum allowed distance in samples
 */
export function snapToNearestZeroCrossing(
  target: number,
  upCrossings: number[],
  toleranceSamples: number
): number | null {
  if (upCrossings.length === 0) return null

  // Binary search for closest crossing
  let lo = 0
  let hi = upCrossings.length - 1

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((upCrossings[mid]!) < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  // Check lo and lo-1
  let best: number | null = null
  let bestDist = Infinity

  for (const idx of [lo - 1, lo]) {
    if (idx >= 0 && idx < upCrossings.length) {
      const dist = Math.abs((upCrossings[idx]!) - target)
      if (dist <= toleranceSamples && dist < bestDist) {
        bestDist = dist
        best = upCrossings[idx]!
      }
    }
  }

  return best
}

/**
 * Get the zero-crossing at a given position in the list (for nudge operations).
 * Returns the next crossing in the given direction, or the boundary if at edge.
 *
 * @param currentSample - current sample index
 * @param upCrossings - sorted array of upward zero-crossing indices
 * @param direction - 1 for next, -1 for previous
 */
export function nudgeZeroCrossing(
  currentSample: number,
  upCrossings: number[],
  direction: 1 | -1
): number {
  if (upCrossings.length === 0) return currentSample

  // Binary search for current position
  let lo = 0
  let hi = upCrossings.length - 1

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((upCrossings[mid]!) < currentSample) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  if (direction === 1) {
    // Next crossing: lo points to >= current, so if it's exactly current, go to lo+1
    const nextIdx = (upCrossings[lo]!) === currentSample ? lo + 1 : lo
    if (nextIdx >= upCrossings.length) return upCrossings[upCrossings.length - 1]!
    return upCrossings[nextIdx]!
  } else {
    // Previous crossing: lo-1 is the previous
    const prevIdx = (upCrossings[lo]!) >= currentSample ? lo - 1 : lo
    if (prevIdx < 0) return upCrossings[0]!
    return upCrossings[prevIdx]!
  }
}
