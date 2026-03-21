import { describe, it, expect } from 'vitest'
import { normalizeChannelData } from './normalize'

describe('normalizeChannelData', () => {
  it('silent input (all zeros) returns copied arrays with peak 0 — no division by zero', () => {
    const ch = new Float32Array([0, 0, 0, 0])
    const result = normalizeChannelData([ch])
    expect(result).toHaveLength(1)
    expect(Math.max(...result[0]!.map(Math.abs))).toBe(0)
  })

  it('does not mutate the input arrays', () => {
    const ch = new Float32Array([0.1, 0.5, 0.3])
    const original = ch.slice()
    normalizeChannelData([ch])
    expect(ch).toEqual(original)
  })

  it('mono input: peak is scaled to 1.0', () => {
    const ch = new Float32Array([0.0, 0.25, 0.5, 0.25])
    const [result] = normalizeChannelData([ch])!
    const peak = Math.max(...result!.map(Math.abs))
    expect(peak).toBeCloseTo(1.0, 10)
  })

  it('mono input: sample values are doubled when peak is 0.5', () => {
    const ch = new Float32Array([0.1, 0.5, 0.3])
    const [result] = normalizeChannelData([ch])!
    // Float32 precision: tolerance of 5 decimal places
    expect(result![0]).toBeCloseTo(0.2, 5)
    expect(result![1]).toBeCloseTo(1.0, 5)
    expect(result![2]).toBeCloseTo(0.6, 5)
  })

  it('already-at-peak input (peak = 1.0) is returned unchanged', () => {
    const ch = new Float32Array([0.5, 1.0, -0.8])
    const [result] = normalizeChannelData([ch])!
    expect(result![0]).toBeCloseTo(0.5, 5)
    expect(result![1]).toBeCloseTo(1.0, 5)
    expect(result![2]).toBeCloseTo(-0.8, 5)
  })

  it('negative-only samples: peak is the abs value of the most negative sample', () => {
    const ch = new Float32Array([-0.25, -0.1, -0.05])
    const [result] = normalizeChannelData([ch])!
    expect(result![0]).toBeCloseTo(-1.0, 10)
  })

  it('stereo: single gain applied across both channels, preserving balance', () => {
    // ch0 has peak 0.5, ch1 has peak 0.25 — gain should be 1/0.5 = 2.0
    const ch0 = new Float32Array([0.1, 0.5])
    const ch1 = new Float32Array([0.25, 0.1])
    const [r0, r1] = normalizeChannelData([ch0, ch1])!

    // ch0 peak becomes 1.0
    expect(r0![1]).toBeCloseTo(1.0, 10)
    // ch1 scaled by same factor (2.0)
    expect(r1![0]).toBeCloseTo(0.5, 5)
    expect(r1![1]).toBeCloseTo(0.2, 5)
  })
})
