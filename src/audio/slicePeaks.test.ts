import { describe, it, expect } from 'vitest'
import { slicePeaks } from './slicePeaks'
import type { WaveformPeaks } from '../types'

function makePeaks(values: number[], binSize = 1): WaveformPeaks {
  const min = new Float32Array(values.map(v => -v))
  const max = new Float32Array(values)
  return { min, max, binSize }
}

describe('slicePeaks', () => {
  it('output length equals targetWidth', () => {
    const peaks = makePeaks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const result = slicePeaks(peaks, 0, 10, 4)
    expect(result.min.length).toBe(4)
    expect(result.max.length).toBe(4)
  })

  it('output length equals targetWidth for non-divisible range', () => {
    const peaks = makePeaks([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    const result = slicePeaks(peaks, 0, 10, 7)
    expect(result.min.length).toBe(7)
    expect(result.max.length).toBe(7)
  })

  it('extracts correct sub-range values (binSize=1, 1:1 mapping)', () => {
    // bins: 0=0, 1=1, 2=2, 3=3, 4=4, 5=5
    const peaks = makePeaks([0, 1, 2, 3, 4, 5])
    // Slice samples 2–6 (bins 2,3,4,5) into 4 columns → each col = 1 bin
    const result = slicePeaks(peaks, 2, 6, 4)
    expect(Array.from(result.max)).toEqual([2, 3, 4, 5])
    expect(Array.from(result.min)).toEqual([-2, -3, -4, -5])
  })

  it('aggregates multiple source bins per output column (downsampling)', () => {
    // 8 bins, slice all (samples 0–8), targetWidth=4 → 2 bins per col
    // bins: [0,1,2,3,4,5,6,7]
    const peaks = makePeaks([0, 1, 2, 3, 4, 5, 6, 7])
    const result = slicePeaks(peaks, 0, 8, 4)
    // col 0: bins 0–1 → max=1, min=-1
    // col 1: bins 2–3 → max=3, min=-3
    // col 2: bins 4–5 → max=5, min=-5
    // col 3: bins 6–7 → max=7, min=-7
    expect(Array.from(result.max)).toEqual([1, 3, 5, 7])
    expect(Array.from(result.min)).toEqual([-1, -3, -5, -7])
  })

  it('returns all-zero arrays when startSample >= endSample', () => {
    const peaks = makePeaks([0, 1, 2, 3, 4])
    const result = slicePeaks(peaks, 3, 3, 4)
    expect(Array.from(result.min)).toEqual([0, 0, 0, 0])
    expect(Array.from(result.max)).toEqual([0, 0, 0, 0])
  })

  it('returns all-zero arrays when startSample > endSample', () => {
    const peaks = makePeaks([0, 1, 2, 3, 4])
    const result = slicePeaks(peaks, 5, 2, 4)
    expect(Array.from(result.min)).toEqual([0, 0, 0, 0])
    expect(Array.from(result.max)).toEqual([0, 0, 0, 0])
  })

  it('handles binSize > 1 correctly', () => {
    // binSize=100: bin 0 covers samples 0–99, bin 1 covers 100–199, etc.
    const min = new Float32Array([-0.1, -0.5, -0.3])
    const max = new Float32Array([0.1, 0.5, 0.3])
    const peaks: WaveformPeaks = { min, max, binSize: 100 }
    // Slice samples 100–300 → startBin=1, endBin=3, targetWidth=2
    const result = slicePeaks(peaks, 100, 300, 2)
    expect(result.min.length).toBe(2)
    expect(result.max.length).toBe(2)
    expect(result.max[0]).toBeCloseTo(0.5)
    expect(result.min[0]).toBeCloseTo(-0.5)
    expect(result.max[1]).toBeCloseTo(0.3)
    expect(result.min[1]).toBeCloseTo(-0.3)
  })
})
