import { describe, it, expect } from 'vitest'
import { cutMoveCrossfade, snapToCutPoint } from './cutMoveCrossfade'

// ── Helpers ────────────────────────────────────────────────────────────────

/** Build a mono Float32Array whose value at each index equals the index (easy identity checks). */
function ramp(length: number): Float32Array {
  return Float32Array.from({ length }, (_, i) => i)
}

// ── snapToCutPoint ─────────────────────────────────────────────────────────

describe('snapToCutPoint', () => {
  it('returns the closest crossing within radius', () => {
    const crossings = [90, 97, 105, 115]
    const result = snapToCutPoint(100, crossings, 10)
    // dist(97)=3, dist(105)=5 → closest is 97
    expect(result).toEqual({ sample: 97, snapped: true })
  })

  it('prefers the crossing with strictly smaller distance', () => {
    const crossings = [94, 106]
    const result = snapToCutPoint(100, crossings, 10)
    // dist(94)=6, dist(106)=6 — tie: binary search lands on lo=1 (106), checks [lo-1=94, lo=106]
    // both equal; first candidate wins with strict <, so 94 is stored first and 106 doesn't beat it
    expect(result.snapped).toBe(true)
    expect([94, 106]).toContain(result.sample)
  })

  it('returns idealCut (snapped=false) when no crossing is within radius', () => {
    const crossings = [200, 300]
    const result = snapToCutPoint(100, crossings, 10)
    expect(result).toEqual({ sample: 100, snapped: false })
  })

  it('returns idealCut (snapped=false) when upCrossings is empty', () => {
    const result = snapToCutPoint(50, [], 10)
    expect(result).toEqual({ sample: 50, snapped: false })
  })

  it('finds a crossing that is exactly at the radius boundary', () => {
    const crossings = [90]
    const result = snapToCutPoint(100, crossings, 10)
    expect(result).toEqual({ sample: 90, snapped: true })
  })

  it('does not snap to a crossing just outside the radius', () => {
    const crossings = [89]
    const result = snapToCutPoint(100, crossings, 10)
    expect(result).toEqual({ sample: 100, snapped: false })
  })
})

// ── cutMoveCrossfade ───────────────────────────────────────────────────────

describe('cutMoveCrossfade', () => {
  it('throws RangeError when L < 48', () => {
    const data = [new Float32Array(40)]
    expect(() => cutMoveCrossfade(data, 26, 2)).toThrow(RangeError)
    expect(() => cutMoveCrossfade(data, 26, 2)).toThrow(/48/)
  })

  it('throws RangeError when output would be empty', () => {
    // L = 48, overlap = 50 → outputLength = -2
    const data = [new Float32Array(48).fill(1)]
    expect(() => cutMoveCrossfade(data, 32, 50)).toThrow(RangeError)
  })

  describe('correct output length', () => {
    it('L=240, cut=160, overlap=10 → output=230', () => {
      const data = [ramp(240)]
      const out = cutMoveCrossfade(data, 160, 10)
      expect(out[0]!.length).toBe(230)
    })

    it('L=48, cut=32, overlap=2 → output=46', () => {
      const data = [ramp(48)]
      const out = cutMoveCrossfade(data, 32, 2)
      expect(out[0]!.length).toBe(46)
    })
  })

  describe('Section 1 — B head (full amplitude)', () => {
    it('first lenB-overlap samples match Part B verbatim', () => {
      // L=240, cut=160: lenB=80, overlap=10 → B head is src[160..230)
      const src = ramp(240)
      const out = cutMoveCrossfade([src], 160, 10)
      const bHeadLen = 80 - 10 // 70
      for (let i = 0; i < bHeadLen; i++) {
        expect(out[0]![i]).toBe(src[160 + i])
      }
    })
  })

  describe('Section 3 — A tail (full amplitude)', () => {
    it('last lenA-overlap samples match Part A from overlap onward', () => {
      // L=240, cut=160: lenA=160, overlap=10 → A tail is src[10..160) = 150 samples
      const src = ramp(240)
      const out = cutMoveCrossfade([src], 160, 10)
      const bHeadLen = 70
      const overlapLen = 10
      const aTailStart = bHeadLen + overlapLen // 80
      const aTailLen = 160 - 10               // 150
      for (let i = 0; i < aTailLen; i++) {
        expect(out[0]![aTailStart + i]).toBe(src[10 + i])
      }
    })
  })

  describe('Section 2 — Crossfade weights', () => {
    it('t=0: out = B_tail[0] * 1.0 + A_head[0] * 0.0', () => {
      // L=240, cut=160, overlap=10
      // B_tail starts at src[160 + 70] = src[230]
      // A_head starts at src[0]
      // weight at t=0 = 0/10 = 0.0
      const src = ramp(240)
      const out = cutMoveCrossfade([src], 160, 10)
      const xfadeStart = 70 // bHeadLen
      const bTailIdx0 = 160 + 70 + 0 // = 230
      const aHeadIdx0 = 0
      const expected = src[bTailIdx0]! * 1.0 + src[aHeadIdx0]! * 0.0
      expect(out[0]![xfadeStart]).toBeCloseTo(expected, 5)
    })

    it('t=overlap-1: out = B_tail[n-1] * (1/overlap) + A_head[n-1] * ((overlap-1)/overlap)', () => {
      // t=9, weight=9/10=0.9
      const src = ramp(240)
      const overlap = 10
      const out = cutMoveCrossfade([src], 160, overlap)
      const xfadeStart = 70
      const t = overlap - 1
      const bIdx = 160 + 70 + t  // = 239
      const aIdx = t              // = 9
      const weight = t / overlap  // 9/10 = 0.9
      const expected = src[bIdx]! * (1 - weight) + src[aIdx]! * weight
      expect(out[0]![xfadeStart + t]).toBeCloseTo(expected, 5)
    })
  })

  describe('stereo support', () => {
    it('processes both channels independently and returns 2-channel output', () => {
      const ch0 = ramp(120)
      const ch1 = Float32Array.from({ length: 120 }, (_, i) => i * 2)
      const out = cutMoveCrossfade([ch0, ch1], 80, 5)
      expect(out.length).toBe(2)
      expect(out[0]!.length).toBe(115)
      expect(out[1]!.length).toBe(115)
      // ch0 B head: src[80..115) = 35 samples
      for (let i = 0; i < 35; i++) {
        expect(out[0]![i]).toBe(ch0[80 + i])
      }
      // ch1 B head same offsets
      for (let i = 0; i < 35; i++) {
        expect(out[1]![i]).toBe(ch1[80 + i])
      }
    })
  })
})
