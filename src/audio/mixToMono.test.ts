import { describe, it, expect } from 'vitest'
import { mixToMono } from './mixToMono'

describe('mixToMono', () => {
  it('returns empty array for empty input', () => {
    const result = mixToMono([])
    expect(result.length).toBe(0)
  })

  it('returns a copy of single channel', () => {
    const ch = new Float32Array([0.1, 0.2, 0.3])
    const result = mixToMono([ch])
    expect(result[0]).toBeCloseTo(0.1)
    expect(result[1]).toBeCloseTo(0.2)
    expect(result[2]).toBeCloseTo(0.3)
    // Must be a copy, not the same reference
    expect(result).not.toBe(ch)
  })

  it('averages two channels correctly', () => {
    const left = new Float32Array([1.0, 0.0, -1.0])
    const right = new Float32Array([0.0, 0.0, 0.0])
    const result = mixToMono([left, right])
    expect(result[0]).toBeCloseTo(0.5)
    expect(result[1]).toBeCloseTo(0.0)
    expect(result[2]).toBeCloseTo(-0.5)
  })

  it('averages identical L and R channels to same values', () => {
    const ch = new Float32Array([0.3, 0.6, -0.3])
    const result = mixToMono([ch, ch])
    expect(result[0]).toBeCloseTo(0.3)
    expect(result[1]).toBeCloseTo(0.6)
    expect(result[2]).toBeCloseTo(-0.3)
  })

  it('handles four channels', () => {
    const a = new Float32Array([1.0])
    const b = new Float32Array([0.0])
    const c = new Float32Array([0.0])
    const d = new Float32Array([0.0])
    const result = mixToMono([a, b, c, d])
    expect(result[0]).toBeCloseTo(0.25)
  })

  it('output length matches input channel length', () => {
    const left = new Float32Array(100)
    const right = new Float32Array(100)
    const result = mixToMono([left, right])
    expect(result.length).toBe(100)
  })
})
