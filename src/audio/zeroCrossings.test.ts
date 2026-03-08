import { describe, it, expect } from 'vitest'
import { findUpwardZeroCrossings, snapToNearestZeroCrossing, nudgeZeroCrossing } from './zeroCrossings'

function syntheticSine(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * durationSeconds))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  return samples
}

describe('findUpwardZeroCrossings', () => {
  it('finds crossings at correct indices for a simple sine wave', () => {
    const samples = syntheticSine(440, 44100, 2)
    const crossings = findUpwardZeroCrossings(samples)
    // 440 Hz sine has 440 full cycles per second × 2 seconds = ~880 upward crossings
    expect(crossings.length).toBeGreaterThan(860)
    expect(crossings.length).toBeLessThan(900)
  })

  it('each crossing satisfies samples[i-1] < 0 && samples[i] >= 0', () => {
    const samples = syntheticSine(440, 44100, 0.1)
    const crossings = findUpwardZeroCrossings(samples)
    for (const i of crossings) {
      expect(samples[i - 1]).toBeLessThan(0)
      expect(samples[i]).toBeGreaterThanOrEqual(0)
    }
  })

  it('treats exact 0.0 as non-negative (upward crossing)', () => {
    // samples: [-0.5, 0.0, 0.5]
    const samples = new Float32Array([-0.5, 0.0, 0.5])
    const crossings = findUpwardZeroCrossings(samples)
    // Index 1: samples[0] = -0.5 < 0, samples[1] = 0.0 >= 0 → crossing
    expect(crossings).toContain(1)
  })

  it('finds no crossings in a DC offset signal', () => {
    const samples = new Float32Array(100).fill(0.5)
    const crossings = findUpwardZeroCrossings(samples)
    expect(crossings.length).toBe(0)
  })

  it('finds no crossings in silent signal', () => {
    const samples = new Float32Array(100)
    const crossings = findUpwardZeroCrossings(samples)
    expect(crossings.length).toBe(0)
  })

  it('finds crossing at expected interval for 1Hz sine at 44100 Hz', () => {
    // 1 Hz sine: one full cycle per 44100 samples
    const samples = syntheticSine(1, 44100, 3)
    const crossings = findUpwardZeroCrossings(samples)
    // Sine starts at 0; index 0 has no prior sample so it's not a crossing.
    // First upward crossing detected near 44100, second near 88200 → 2 crossings.
    expect(crossings.length).toBe(2)
    expect(Math.abs((crossings[0]!) - 44100)).toBeLessThan(5)
    expect(Math.abs((crossings[1]!) - 88200)).toBeLessThan(5)
  })
})

describe('snapToNearestZeroCrossing', () => {
  it('returns the closest crossing within tolerance', () => {
    const crossings = [100, 200, 300]
    const result = snapToNearestZeroCrossing(195, crossings, 10)
    expect(result).toBe(200)
  })

  it('returns null when no crossing within tolerance', () => {
    const crossings = [100, 200, 300]
    const result = snapToNearestZeroCrossing(250, crossings, 10)
    expect(result).toBeNull()
  })

  it('returns exact crossing when target matches', () => {
    const crossings = [100, 200, 300]
    const result = snapToNearestZeroCrossing(200, crossings, 5)
    expect(result).toBe(200)
  })

  it('returns null for empty crossings array', () => {
    const result = snapToNearestZeroCrossing(100, [], 10)
    expect(result).toBeNull()
  })

  it('never returns a non-crossing index when snapping is active', () => {
    const crossings = [50, 150, 250, 350]
    for (let target = 0; target < 400; target += 13) {
      const result = snapToNearestZeroCrossing(target, crossings, 40)
      if (result !== null) {
        expect(crossings).toContain(result)
      }
    }
  })
})

describe('nudgeZeroCrossing', () => {
  it('moves to next crossing', () => {
    const crossings = [100, 200, 300]
    expect(nudgeZeroCrossing(100, crossings, 1)).toBe(200)
    expect(nudgeZeroCrossing(200, crossings, 1)).toBe(300)
  })

  it('moves to previous crossing', () => {
    const crossings = [100, 200, 300]
    expect(nudgeZeroCrossing(300, crossings, -1)).toBe(200)
    expect(nudgeZeroCrossing(200, crossings, -1)).toBe(100)
  })

  it('stays at last crossing when nudging forward at end', () => {
    const crossings = [100, 200, 300]
    expect(nudgeZeroCrossing(300, crossings, 1)).toBe(300)
  })

  it('stays at first crossing when nudging backward at start', () => {
    const crossings = [100, 200, 300]
    expect(nudgeZeroCrossing(100, crossings, -1)).toBe(100)
  })
})
