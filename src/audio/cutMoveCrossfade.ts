/**
 * Cut-Move-Crossfade post-processing (UC-010).
 * Sound Designer profile only.
 *
 * Operation:
 *   1. Cut the loop slice at cutSample (2/3 mark, zero-crossing snapped)
 *   2. Reorder: [Part B (tail)][Part A (head)]
 *   3. Apply linear slope crossfade over the junction (overlapSamples)
 *
 * All functions are pure — no side effects, no I/O.
 */

/**
 * Find the nearest upward zero-crossing to idealCut within snapRadiusSamples.
 * upCrossings must be in the same coordinate space as idealCut (e.g. both
 * relative to the loop slice start, NOT absolute buffer indices).
 *
 * Returns { sample, snapped: true }  when a crossing is found within radius.
 * Returns { sample: idealCut, snapped: false } as unsnapped fallback.
 */
export function snapToCutPoint(
  idealCut: number,
  upCrossings: number[],
  snapRadiusSamples: number
): { sample: number; snapped: boolean } {
  if (upCrossings.length === 0) return { sample: idealCut, snapped: false }

  // Binary search for the insertion point closest to idealCut
  let lo = 0
  let hi = upCrossings.length - 1
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((upCrossings[mid]!) < idealCut) lo = mid + 1
    else hi = mid
  }

  let best: number | null = null
  let bestDist = Infinity

  for (const idx of [lo - 1, lo]) {
    if (idx >= 0 && idx < upCrossings.length) {
      const dist = Math.abs((upCrossings[idx]!) - idealCut)
      if (dist <= snapRadiusSamples && dist < bestDist) {
        bestDist = dist
        best = upCrossings[idx]!
      }
    }
  }

  if (best !== null) return { sample: best, snapped: true }
  return { sample: idealCut, snapped: false }
}

/**
 * Apply the Cut-Move-Crossfade transformation to pre-extracted loop channel data.
 *
 * @param channelData   One Float32Array per channel, each of length L (the full loop slice).
 * @param cutSample     Offset within channelData where the cut is placed (0 ≤ cutSample < L).
 * @param overlapSamples  Crossfade length in samples (= Math.max(2, Math.round(L / 24))).
 * @returns New Float32Array[] of length L - overlapSamples per channel.
 * @throws RangeError when L < 48 or the output would be empty.
 */
export function cutMoveCrossfade(
  channelData: Float32Array[],
  cutSample: number,
  overlapSamples: number
): Float32Array[] {
  const L = channelData[0]?.length ?? 0

  if (L < 48) {
    throw new RangeError(
      `Loop region is too short for Cut-Move-Crossfade (minimum 48 samples, got ${L})`
    )
  }

  const lenA = cutSample        // Part A: original[0 .. cutSample)
  const lenB = L - cutSample    // Part B: original[cutSample .. L)

  if (lenB < overlapSamples || lenA < overlapSamples) {
    throw new RangeError(
      `Cut position too close to boundary for the requested overlap ` +
      `(lenA=${lenA}, lenB=${lenB}, overlap=${overlapSamples})`
    )
  }

  const outputLength = L - overlapSamples
  if (outputLength <= 0) {
    throw new RangeError(
      `Output buffer would be empty (L=${L}, overlap=${overlapSamples})`
    )
  }

  const result: Float32Array[] = []

  for (let ch = 0; ch < channelData.length; ch++) {
    const src = channelData[ch]!
    const out = new Float32Array(outputLength)
    let outIdx = 0

    // Section 1 — B head (full amplitude): first lenB - overlapSamples of Part B
    const bHeadLen = lenB - overlapSamples
    if (bHeadLen > 0) {
      out.set(src.subarray(cutSample, cutSample + bHeadLen), outIdx)
      outIdx += bHeadLen
    }

    // Section 2 — Junction crossfade: last overlapSamples of B × first overlapSamples of A
    for (let t = 0; t < overlapSamples; t++) {
      const weight = t / overlapSamples           // 0.0 at start → approaches 1.0 at end
      const bIdx = cutSample + bHeadLen + t       // last overlapSamples of Part B
      const aIdx = t                              // first overlapSamples of Part A
      out[outIdx++] = (src[bIdx] ?? 0) * (1 - weight) + (src[aIdx] ?? 0) * weight
    }

    // Section 3 — A tail (full amplitude): Part A from overlapSamples onward
    const aTailLen = lenA - overlapSamples
    if (aTailLen > 0) {
      out.set(src.subarray(overlapSamples, overlapSamples + aTailLen), outIdx)
    }

    result.push(out)
  }

  return result
}
