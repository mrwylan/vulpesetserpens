import type { WaveformPeaks } from '../types'

/**
 * Extract a min/max peak sub-array for the sample range [startSample, endSample)
 * from the global WaveformPeaks produced by extractPeaks().
 *
 * Returns a new { min, max } of length `targetWidth` by aggregating the
 * corresponding source bins — the same min/max pooling used to build the
 * global peaks in the first place.
 */
export function slicePeaks(
  peaks: WaveformPeaks,
  startSample: number,
  endSample: number,
  targetWidth: number,
): { min: Float32Array; max: Float32Array } {
  const minOut = new Float32Array(targetWidth)
  const maxOut = new Float32Array(targetWidth)

  if (startSample >= endSample || targetWidth === 0) {
    return { min: minOut, max: maxOut }
  }

  const { min, max, binSize } = peaks
  const startBin = Math.floor(startSample / binSize)
  const endBin = Math.ceil(endSample / binSize)
  const totalBins = endBin - startBin
  const scale = totalBins / targetWidth

  for (let i = 0; i < targetWidth; i++) {
    const srcStart = Math.max(0, Math.floor(startBin + i * scale))
    const srcEnd = Math.min(min.length, Math.ceil(startBin + (i + 1) * scale))

    let minVal = Infinity
    let maxVal = -Infinity

    for (let j = srcStart; j < srcEnd; j++) {
      if ((min[j]!) < minVal) minVal = min[j]!
      if ((max[j]!) > maxVal) maxVal = max[j]!
    }

    minOut[i] = minVal === Infinity ? 0 : minVal
    maxOut[i] = maxVal === -Infinity ? 0 : maxVal
  }

  return { min: minOut, max: maxOut }
}
