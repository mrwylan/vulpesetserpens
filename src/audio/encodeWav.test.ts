import { describe, it, expect } from 'vitest'
import { encodeWav, applyCrossfade, generateExportFilename } from './encodeWav'

describe('encodeWav', () => {
  it('produces correct RIFF header', () => {
    const samples = new Float32Array([0, 0.5, -0.5, 0])
    const buffer = encodeWav([samples], 44100, 4)
    const view = new DataView(buffer)

    // RIFF marker
    expect(view.getUint8(0)).toBe(0x52)  // 'R'
    expect(view.getUint8(1)).toBe(0x49)  // 'I'
    expect(view.getUint8(2)).toBe(0x46)  // 'F'
    expect(view.getUint8(3)).toBe(0x46)  // 'F'

    // WAVE marker at offset 8
    expect(view.getUint8(8)).toBe(0x57)   // 'W'
    expect(view.getUint8(9)).toBe(0x41)   // 'A'
    expect(view.getUint8(10)).toBe(0x56)  // 'V'
    expect(view.getUint8(11)).toBe(0x45)  // 'E'
  })

  it('writes correct sample rate in fmt chunk', () => {
    const samples = new Float32Array(4)
    const buffer = encodeWav([samples], 44100, 4)
    const view = new DataView(buffer)

    // fmt chunk starts at offset 12
    // fmt chunk data starts at 12 + 8 = 20
    // sample rate is at offset 24
    const sampleRate = view.getUint32(24, true)
    expect(sampleRate).toBe(44100)
  })

  it('writes correct channel count for mono', () => {
    const samples = new Float32Array(4)
    const buffer = encodeWav([samples], 44100, 4)
    const view = new DataView(buffer)
    // numChannels at offset 22
    expect(view.getUint16(22, true)).toBe(1)
  })

  it('writes correct channel count for stereo', () => {
    const ch1 = new Float32Array(4)
    const ch2 = new Float32Array(4)
    const buffer = encodeWav([ch1, ch2], 44100, 4)
    const view = new DataView(buffer)
    expect(view.getUint16(22, true)).toBe(2)
  })

  it('data chunk size equals loopLengthSamples * numChannels * 2', () => {
    const numSamples = 100
    const samples = new Float32Array(numSamples)
    const buffer = encodeWav([samples], 44100, numSamples)
    const view = new DataView(buffer)

    // smpl chunk comes before data, size = 68 bytes
    // data chunk header is at offset 12 + 24 + 68 = 104: 'data' tag (4) + size (4)
    // size field is at offset 108
    const dataSize = view.getUint32(108, true)
    expect(dataSize).toBe(numSamples * 1 * 2)  // mono, 16-bit
  })

  it('includes smpl chunk with correct identifier', () => {
    const samples = new Float32Array(4)
    const buffer = encodeWav([samples], 44100, 4)
    const view = new DataView(buffer)

    // smpl chunk is at offset 12 + 24 = 36
    expect(view.getUint8(36)).toBe(0x73)  // 's'
    expect(view.getUint8(37)).toBe(0x6D)  // 'm'
    expect(view.getUint8(38)).toBe(0x70)  // 'p'
    expect(view.getUint8(39)).toBe(0x6C)  // 'l'
  })

  it('smpl chunk Start = 0 and End = loopLengthSamples - 1', () => {
    const numSamples = 100
    const samples = new Float32Array(numSamples)
    const buffer = encodeWav([samples], 44100, numSamples)
    const view = new DataView(buffer)

    // smpl loop record starts at 36 + 8 + 36 = 80
    // record layout: cue(4) type(4) start(4) end(4) ...
    // loop start at offset 88, loop end at offset 92
    const loopStart = view.getUint32(88, true)
    const loopEnd = view.getUint32(92, true)
    expect(loopStart).toBe(0)
    expect(loopEnd).toBe(numSamples - 1)
  })

  it('PCM data is bit-identical for crossfadeDuration=0', () => {
    const inputSamples = new Float32Array([0.0, 0.5, -0.5, 0.25, -0.25, 0.0])
    const numSamples = inputSamples.length

    // Make a copy to pass to encodeWav
    const channelCopy = new Float32Array(inputSamples)
    const buffer = encodeWav([channelCopy], 44100, numSamples)
    const view = new DataView(buffer)

    // data starts at offset 12 + 24 + 68 + 8 = 112
    const dataOffset = 112
    for (let i = 0; i < numSamples; i++) {
      const expected = Math.max(-32768, Math.min(32767, Math.round(inputSamples[i]! * 32767)))
      const actual = view.getInt16(dataOffset + i * 2, true)
      expect(actual).toBe(expected)
    }
  })
})

describe('applyCrossfade', () => {
  it('does nothing when crossfadeSamples is 0', () => {
    const ch = new Float32Array([1, 2, 3, 4, 5])
    const original = new Float32Array(ch)
    applyCrossfade([ch], 0)
    expect(Array.from(ch)).toEqual(Array.from(original))
  })

  it('blends end region toward start region', () => {
    // [start_vals..., end_vals...]
    // crossfade of N should blend the last N samples toward the first N
    const ch = new Float32Array([0.0, 0.0, 1.0, 1.0])  // start=[0,0], end=[1,1]
    applyCrossfade([ch], 2)
    // weight=0/2=0 at idx 2: output = 1.0*(1-0) + 0.0*0 = 1.0
    // weight=1/2=0.5 at idx 3: output = 1.0*(1-0.5) + 0.0*0.5 = 0.5
    expect(ch[2]).toBeCloseTo(1.0)
    expect(ch[3]).toBeCloseTo(0.5)
  })
})

describe('generateExportFilename', () => {
  it('produces correct pattern without BPM', () => {
    const name = generateExportFilename('my-sample.wav', 1, 2.580)
    expect(name).toBe('my-sample_loop1_2.580s.wav')
  })

  it('produces pattern with BPM and bars', () => {
    const name = generateExportFilename('kick.wav', 2, 4.0, 120, 2)
    expect(name).toBe('kick_loop2_4.000s_2bars_120bpm.wav')
  })

  it('removes file extension from base name', () => {
    const name = generateExportFilename('my-sample.aiff', 1, 2.0)
    expect(name).toContain('my-sample_loop1')
    expect(name).not.toContain('.aiff')
  })

  it('sanitizes special characters in filename', () => {
    const name = generateExportFilename('my sample/with:special*chars.wav', 1, 1.0)
    expect(name).not.toContain('/')
    expect(name).not.toContain(':')
    expect(name).not.toContain('*')
  })

  it('handles filename with no extension', () => {
    const name = generateExportFilename('mysample', 1, 2.0)
    expect(name).toContain('mysample_loop1')
  })
})
