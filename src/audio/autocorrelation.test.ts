import { describe, it, expect } from 'vitest'
import { computeAutocorrelation, getCorrelationAtLag } from './autocorrelation'

function syntheticSine(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
  const samples = new Float32Array(Math.round(sampleRate * durationSeconds))
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  return samples
}

describe('computeAutocorrelation', () => {
  it('returns an array of correct length', () => {
    const samples = new Float32Array(1000)
    const result = computeAutocorrelation(samples, 10, 50, 1000)
    expect(result.values.length).toBe(40)
  })

  it('finds strong correlation at the period of a sine wave', () => {
    // Use a compact signal: 100 Hz at sampleRate=4410 (10x speed-up)
    // period = 44.1 → ~44 samples; use 10 cycles = 441 samples total
    const sampleRate = 4410
    const freq = 100 // period = 44.1 samples
    const samples = syntheticSine(freq, sampleRate, 0.1) // 441 samples
    const period = Math.round(sampleRate / freq) // 44
    const minLag = Math.round(period * 0.5)
    const maxLag = Math.round(period * 1.5)
    const result = computeAutocorrelation(samples, minLag, maxLag, samples.length)

    const corrAtPeriod = getCorrelationAtLag(result, period)
    expect(corrAtPeriod).toBeGreaterThan(0.9)
  })

  it('preferredLengths contains the known period for a clean sine', () => {
    // 50 Hz at sampleRate=4410; period = 88.2 → ~88 samples; 10 cycles = 441 samples
    const sampleRate = 4410
    const freq = 50 // period = 88.2 samples
    const samples = syntheticSine(freq, sampleRate, 0.1)
    const expectedPeriod = Math.round(sampleRate / freq) // 88
    const minLag = Math.round(expectedPeriod * 0.5)
    const maxLag = Math.round(expectedPeriod * 2.0)
    const result = computeAutocorrelation(samples, minLag, maxLag, samples.length)

    const found = result.preferredLengths.some(
      (len) => Math.abs(len - expectedPeriod) < 5
    )
    expect(found).toBe(true)
  })

  it('returns 0 correlation for silent signal', () => {
    const samples = new Float32Array(1000)
    const result = computeAutocorrelation(samples, 10, 50, 1000)
    for (const v of result.values) {
      expect(v).toBe(0)
    }
  })

  it('getCorrelationAtLag returns 0 for out-of-range lag', () => {
    const samples = new Float32Array(100)
    const result = computeAutocorrelation(samples, 10, 20, 100)
    expect(getCorrelationAtLag(result, 0)).toBe(0)
    expect(getCorrelationAtLag(result, 100)).toBe(0)
  })
})
