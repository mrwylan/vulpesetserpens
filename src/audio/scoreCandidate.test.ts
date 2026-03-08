import { describe, it, expect } from 'vitest'
import {
  WEIGHT_SHAPE,
  WEIGHT_SLOPE,
  WEIGHT_PERIOD,
  WEIGHT_ENERGY,
  computeShapeScore,
  computeSlopeScore,
  computeEnergyScore,
  computeCompositeScore,
  computePeriodScore,
} from './scoreCandidate'

describe('score weights', () => {
  it('all weights sum to 1.0', () => {
    const sum = WEIGHT_SHAPE + WEIGHT_SLOPE + WEIGHT_PERIOD + WEIGHT_ENERGY
    expect(sum).toBeCloseTo(1.0)
  })
})

describe('computeShapeScore', () => {
  it('returns 1.0 for identical segments', () => {
    const sampleRate = 44100
    const windowLen = Math.round(0.02 * sampleRate)
    // Create a signal where startIdx region equals endIdx region
    const samples = new Float32Array(sampleRate)
    // Fill with a known pattern that repeats
    for (let i = 0; i < windowLen; i++) {
      samples[i] = Math.sin(2 * Math.PI * i / 100)
      samples[i + windowLen] = samples[i]!
    }
    const startIdx = 0
    const endIdx = windowLen
    const score = computeShapeScore(samples, startIdx, endIdx, sampleRate)
    expect(score).toBeGreaterThan(0.99)
  })

  it('returns 0 or low value for unrelated segments', () => {
    const sampleRate = 44100
    const windowLen = Math.round(0.02 * sampleRate)
    const samples = new Float32Array(sampleRate * 2)
    // First window: zeros
    // Second window: ones (but wait, scores normalized)
    // Let's make them orthogonal-ish
    for (let i = 0; i < windowLen; i++) {
      samples[i] = Math.sin(2 * Math.PI * i / 100)
      samples[windowLen + windowLen + i] = Math.cos(2 * Math.PI * i / 100)
    }
    const startIdx = 0
    const endIdx = windowLen + windowLen
    const score = computeShapeScore(samples, startIdx, endIdx, sampleRate)
    expect(score).toBeLessThan(0.3)
  })
})

describe('computeSlopeScore', () => {
  it('returns 1.0 when slopes are identical', () => {
    const samples = new Float32Array([0, 0.005, 0.01, 0, 0.005, 0.01])
    // startIdx=0, endIdx=3: slope_start = 0.005, slope_end = 0.005
    const score = computeSlopeScore(samples, 0, 3)
    expect(score).toBeCloseTo(1.0)
  })

  it('penalizes slope mismatch', () => {
    const samples = new Float32Array([0, 0.01, 0.02, 0, 0.0, 0.0])
    // slope at 0: 0.01, slope at 3: 0.0 → diff = 0.01 = MAX_EXPECTED_SLOPE
    const score = computeSlopeScore(samples, 0, 3)
    expect(score).toBeCloseTo(0.0)
  })
})

describe('computeEnergyScore', () => {
  it('returns 1.0 when energy is equal at both sides', () => {
    const sampleRate = 44100
    const windowLen = Math.round(0.05 * sampleRate)
    const samples = new Float32Array(windowLen * 3)
    // Equal RMS: fill both windows with 0.5
    samples.fill(0.5)
    const score = computeEnergyScore(samples, windowLen, windowLen * 2, sampleRate)
    expect(score).toBeCloseTo(1.0)
  })

  it('penalizes energy discontinuity', () => {
    const sampleRate = 44100
    const windowLen = Math.round(0.05 * sampleRate)
    const samples = new Float32Array(windowLen * 3)
    // Start window: silence (0.0), end window: loud (0.5+)
    samples.fill(0.0, 0, windowLen)
    samples.fill(0.5, windowLen, windowLen * 2)
    // endIdx is at windowLen*2, endTail is before it: [windowLen, windowLen*2)
    // startTail is after startIdx=0: [0, windowLen)
    const score = computeEnergyScore(samples, 0, windowLen * 2, sampleRate)
    expect(score).toBeLessThan(0.5)
  })
})

describe('computeCompositeScore', () => {
  it('returns weighted average of all four sub-scores', () => {
    const shape = 0.8
    const slope = 0.6
    const period = 0.7
    const energy = 0.9
    const expected = 0.35 * 0.8 + 0.30 * 0.6 + 0.20 * 0.7 + 0.15 * 0.9
    const actual = computeCompositeScore(shape, slope, period, energy)
    expect(actual).toBeCloseTo(expected)
  })

  it('returns 1.0 when all scores are 1.0', () => {
    expect(computeCompositeScore(1, 1, 1, 1)).toBeCloseTo(1.0)
  })

  it('returns 0.0 when all scores are 0.0', () => {
    expect(computeCompositeScore(0, 0, 0, 0)).toBeCloseTo(0.0)
  })
})

describe('computePeriodScore', () => {
  it('returns 0.5 when no preferred lengths', () => {
    const score = computePeriodScore(1000, [], 100, new Float32Array([0.8]), 900)
    expect(score).toBe(0.5)
  })

  it('returns 0 when loop length not near any preferred length', () => {
    const correlationValues = new Float32Array(100).fill(0.9)
    const score = computePeriodScore(1000, [5000, 6000], 100, correlationValues, 900)
    expect(score).toBe(0)
  })
})
