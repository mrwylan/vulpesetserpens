import { describe, it, expect } from 'vitest'
import {
  WEIGHT_SHAPE,
  WEIGHT_SLOPE,
  WEIGHT_PERIOD,
  WEIGHT_ENERGY,
  WEIGHT_BEAT_SHAPE,
  WEIGHT_BEAT_SLOPE,
  WEIGHT_BEAT_PERIOD,
  WEIGHT_BEAT_ENERGY,
  WEIGHT_BEAT_BEAT,
  computeShapeScore,
  computeSlopeScore,
  computeEnergyScore,
  computeCompositeScore,
  computeCompositeScoreWithBeat,
  computePeriodScore,
  computeBeatScore,
} from './scoreCandidate'

describe('score weights', () => {
  it('beat-inactive weights sum to 1.0', () => {
    const sum = WEIGHT_SHAPE + WEIGHT_SLOPE + WEIGHT_PERIOD + WEIGHT_ENERGY
    expect(sum).toBeCloseTo(1.0)
  })

  it('beat-active weights sum to 1.0 (AC-15)', () => {
    const sum = WEIGHT_BEAT_SHAPE + WEIGHT_BEAT_SLOPE + WEIGHT_BEAT_PERIOD + WEIGHT_BEAT_ENERGY + WEIGHT_BEAT_BEAT
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

describe('computeBeatScore', () => {
  // BPM=120 → beat interval = 0.5 s

  it('returns 1.0 when start and end land exactly on a beat (AC-12)', () => {
    // startTime=0.0 → 0ms from beat 0; endTime=0.5 → 0ms from beat 1
    expect(computeBeatScore(0.0, 0.5, 120, 0.005)).toBe(1.0)
  })

  it('returns 1.0 when within producer snap window (3ms ≤ 5ms) (AC-12)', () => {
    expect(computeBeatScore(0.003, 0.503, 120, 0.005)).toBe(1.0)
  })

  it('returns 0.0 when outside producer snap window (10ms > 5ms) (AC-12)', () => {
    expect(computeBeatScore(0.010, 0.510, 120, 0.005)).toBe(0.0)
  })

  it('returns 1.0 when within musician snap window (10ms ≤ 20ms) (AC-13)', () => {
    expect(computeBeatScore(0.010, 0.510, 120, 0.020)).toBe(1.0)
  })

  it('returns 0.0 when outside musician snap window (25ms > 20ms)', () => {
    expect(computeBeatScore(0.025, 0.525, 120, 0.020)).toBe(0.0)
  })

  it('returns 0.0 when only one boundary misses the snap window', () => {
    // startTime on beat, endTime 10ms off — producer 5ms window → end fails
    expect(computeBeatScore(0.0, 0.510, 120, 0.005)).toBe(0.0)
  })

  it('returns 0.0 for zero snap window', () => {
    expect(computeBeatScore(0.001, 0.501, 120, 0.0)).toBe(0.0)
  })
})

describe('computeCompositeScoreWithBeat', () => {
  it('returns 1.0 when all scores are 1.0', () => {
    expect(computeCompositeScoreWithBeat(1, 1, 1, 1, 1)).toBeCloseTo(1.0)
  })

  it('returns correct weighted average', () => {
    const expected = 0.30 * 0.8 + 0.25 * 0.6 + 0.15 * 0.7 + 0.10 * 0.9 + 0.20 * 1.0
    expect(computeCompositeScoreWithBeat(0.8, 0.6, 0.7, 0.9, 1.0)).toBeCloseTo(expected)
  })

  it('beat bonus lifts score above non-beat formula for same shape/slope/period/energy', () => {
    const withBeat = computeCompositeScoreWithBeat(0.8, 0.8, 0.8, 0.8, 1.0)
    const withoutBeat = computeCompositeScore(0.8, 0.8, 0.8, 0.8)
    expect(withBeat).toBeGreaterThan(withoutBeat)
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
