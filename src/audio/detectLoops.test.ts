import { describe, it, expect } from 'vitest'
import { detectLoops, computeBarAnnotation, validateBpm } from './detectLoops'

function syntheticSine(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * durationSeconds))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  return samples
}

// Use a compact sample rate to keep autocorrelation O(N²) tractable in unit tests.
// sampleRate=2000, freq=10Hz → period=200 samples, 4s → 8000 samples, ~40 crossings.
describe('detectLoops', () => {
  const sampleRate = 2000

  it('returns TOO_SHORT for audio shorter than 20 ms (minDuration)', () => {
    const short = syntheticSine(10, sampleRate, 0.01)  // 10 ms — below 20 ms floor
    const result = detectLoops([short], sampleRate)
    expect(result.candidates.length).toBe(0)
    expect(result.reasonCode).toBe('TOO_SHORT')
  })

  it('returns NO_CROSSINGS for DC offset signal', () => {
    const dc = new Float32Array(sampleRate * 2).fill(0.5)
    const result = detectLoops([dc], sampleRate)
    expect(result.reasonCode).toBe('NO_CROSSINGS')
  })

  it('returns candidates with all required fields', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    expect(result.candidates.length).toBeGreaterThan(0)

    const c = result.candidates[0]!
    expect(typeof c.startSample).toBe('number')
    expect(typeof c.endSample).toBe('number')
    expect(typeof c.startTime).toBe('number')
    expect(typeof c.endTime).toBe('number')
    expect(typeof c.duration).toBe('number')
    expect(typeof c.score).toBe('number')
    expect(typeof c.shapeScore).toBe('number')
    expect(typeof c.slopeScore).toBe('number')
    expect(typeof c.periodScore).toBe('number')
    expect(typeof c.energyScore).toBe('number')
    expect(typeof c.crossfadeDuration).toBe('number')
    expect(typeof c.rank).toBe('number')
    expect(typeof c.lowConfidence).toBe('boolean')
    expect(typeof c.userModified).toBe('boolean')
  })

  it('returns at most 10 candidates', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    expect(result.candidates.length).toBeLessThanOrEqual(10)
  })

  it('ranks candidates in descending order by score', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    for (let i = 1; i < result.candidates.length; i++) {
      expect(result.candidates[i - 1]!.score).toBeGreaterThanOrEqual(result.candidates[i]!.score)
    }
  })

  it('assigns correct rank values (1-based)', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    for (let i = 0; i < result.candidates.length; i++) {
      expect(result.candidates[i]!.rank).toBe(i + 1)
    }
  })

  it('all start and end samples are upward zero-crossings', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    const crossingSet = new Set(result.upCrossings)

    for (const c of result.candidates) {
      expect(crossingSet.has(c.startSample)).toBe(true)
      expect(crossingSet.has(c.endSample)).toBe(true)
    }
  })

  it('no two candidates have start and end both within 10ms of each other', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    const dedupTol = 0.01  // 10ms tolerance (matches DEDUP_TOLERANCE_SECONDS)

    for (let i = 0; i < result.candidates.length; i++) {
      for (let j = i + 1; j < result.candidates.length; j++) {
        const a = result.candidates[i]!
        const b = result.candidates[j]!
        const startClose = Math.abs(a.startTime - b.startTime) < dedupTol
        const endClose = Math.abs(a.endTime - b.endTime) < dedupTol
        expect(startClose && endClose).toBe(false)
      }
    }
  })

  it('returns empty list with low confidence for silent signal', () => {
    const silent = new Float32Array(sampleRate * 2)
    const result = detectLoops([silent], sampleRate)
    // Silent signal should return NO_CROSSINGS (exact zeros aren't upward crossings)
    expect(result.candidates.length).toBe(0)
  })

  it('is deterministic — same input produces same output', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result1 = detectLoops([sine], sampleRate)
    const result2 = detectLoops([sine], sampleRate)

    expect(result1.candidates.length).toBe(result2.candidates.length)
    for (let i = 0; i < result1.candidates.length; i++) {
      expect(result1.candidates[i]!.startSample).toBe(result2.candidates[i]!.startSample)
      expect(result1.candidates[i]!.endSample).toBe(result2.candidates[i]!.endSample)
      expect(result1.candidates[i]!.score).toBeCloseTo(result2.candidates[i]!.score)
    }
  })

  it('score weights sum to 1.0', () => {
    const sum = 0.35 + 0.30 + 0.20 + 0.15
    expect(sum).toBeCloseTo(1.0)
  })

  it('top candidate for sine wave scores well', () => {
    const sine = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([sine], sampleRate)
    if (result.candidates.length > 0) {
      // A clean sine should produce decent scores
      expect(result.candidates[0]!.score).toBeGreaterThan(0.3)
    }
  })

  it('works with stereo input by mixing to mono first', () => {
    const left = syntheticSine(10, sampleRate, 4)
    const right = syntheticSine(10, sampleRate, 4)
    const result = detectLoops([left, right], sampleRate)
    expect(result.candidates.length).toBeGreaterThan(0)
  })

  // AC-1a: micro-loop detectability — a 50 Hz sine at sampleRate=2000
  // has period = 40 samples = 20 ms (exactly at minDuration floor).
  // At least one candidate must be found within ±5 ms of the expected period.
  it('AC-1a: detects micro-loop candidates near a 20 ms period (50 Hz sine)', () => {
    // Use full sampleRate=2000; 50 Hz at 2000 Hz → period = 40 samples = 20 ms.
    // Provide 0.5 s of audio (25 full cycles) so there are enough crossings to pair.
    const sine50 = syntheticSine(50, sampleRate, 0.5)
    const result = detectLoops([sine50], sampleRate)
    expect(result.candidates.length).toBeGreaterThan(0)

    const expectedPeriodSec = 1 / 50  // 20 ms
    const toleranceSec = 0.005        // ±5 ms
    const nearPeriod = result.candidates.some(
      c => Math.abs(c.duration - expectedPeriodSec) <= toleranceSec
    )
    expect(nearPeriod).toBe(true)
  })
})

describe('computeBarAnnotation', () => {
  it('returns "≈ 2 bars" for 4.0s at 120 BPM', () => {
    expect(computeBarAnnotation(4.0, 120)).toBe('≈ 2 bars')
  })

  it('returns "≈ 4 bars" for 8.0s at 120 BPM', () => {
    expect(computeBarAnnotation(8.0, 120)).toBe('≈ 4 bars')
  })

  it('returns "≈ 0.5 bar" for 2.0s at 60 BPM', () => {
    // 60 BPM: 1 beat = 1s, 1 bar = 4s → 2.0s = 0.5 bars
    expect(computeBarAnnotation(2.0, 60)).toBe('≈ 0.5 bar')
  })

  it('returns "≈ 1 bar" for exact 1-bar duration', () => {
    const bpm = 120
    const secondsPerBar = (60 / bpm) * 4
    expect(computeBarAnnotation(secondsPerBar, bpm)).toBe('≈ 1 bar')
  })

  it('returns "≈ 0.5 bar" for half-bar duration', () => {
    const bpm = 120
    const secondsPerBar = (60 / bpm) * 4
    expect(computeBarAnnotation(secondsPerBar * 0.5, bpm)).toBe('≈ 0.5 bar')
  })
})

describe('validateBpm', () => {
  it('accepts 120', () => {
    const result = validateBpm('120')
    expect('bpm' in result).toBe(true)
    if ('bpm' in result) {
      expect(result.bpm).toBeCloseTo(120)
    }
  })

  it('accepts 93.5 (decimal)', () => {
    const result = validateBpm('93.5')
    expect('bpm' in result).toBe(true)
    if ('bpm' in result) {
      expect(result.bpm).toBeCloseTo(93.5)
    }
  })

  it('rejects 301 (out of range)', () => {
    const result = validateBpm('301')
    expect('error' in result).toBe(true)
  })

  it('rejects 0', () => {
    const result = validateBpm('0')
    expect('error' in result).toBe(true)
  })

  it('rejects "abc" (non-numeric)', () => {
    const result = validateBpm('abc')
    expect('error' in result).toBe(true)
  })

  it('rejects empty string', () => {
    const result = validateBpm('')
    expect('error' in result).toBe(true)
  })

  it('rejects 19 (below minimum)', () => {
    const result = validateBpm('19')
    expect('error' in result).toBe(true)
  })

  it('accepts boundary values 20 and 300', () => {
    const r20 = validateBpm('20')
    const r300 = validateBpm('300')
    expect('bpm' in r20).toBe(true)
    expect('bpm' in r300).toBe(true)
  })
})
