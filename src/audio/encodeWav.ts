/**
 * RIFF WAV encoder with smpl chunk (UC-005, ADR-006).
 * Pure function — no side effects, no DOM dependencies except as output type.
 */

import type { LoopCandidate } from '../types'

/**
 * Encode audio channel data as a WAV file with RIFF header, fmt chunk, smpl chunk, and data chunk.
 *
 * @param channelData - one Float32Array per channel (interleaved in output)
 * @param sampleRate - audio sample rate in Hz
 * @param loopLengthSamples - number of sample frames (for smpl chunk)
 * @param candidate - loop candidate (used for smpl chunk, optional)
 * @param bitDepth - output bit depth (only 16 supported in v1)
 */
export function encodeWav(
  channelData: Float32Array[],
  sampleRate: number,
  loopLengthSamples: number,
  // candidate is reserved for future use (e.g., embedding loop points from specific sample ranges)
  _candidate?: Pick<LoopCandidate, 'startSample' | 'endSample'>,
  bitDepth = 16
): ArrayBuffer {
  const numChannels = channelData.length
  const numSampleFrames = loopLengthSamples
  // Only 16-bit PCM is supported in v1; bitDepth param reserved for future 24-bit support
  const bytesPerSample = Math.floor(bitDepth / 8)
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSampleFrames * blockAlign

  // smpl chunk is always included (60 bytes)
  const smplChunkSize = 60
  const smplChunkTotal = 8 + smplChunkSize // 'smpl' + size uint32 + 60 bytes

  // Total file size:
  // RIFF header: 12 bytes
  // fmt chunk: 8 + 16 = 24 bytes
  // smpl chunk: 8 + 60 = 68 bytes
  // data chunk header: 8 bytes
  // data: dataSize bytes
  const totalSize = 12 + 24 + smplChunkTotal + 8 + dataSize
  const buffer = new ArrayBuffer(totalSize)
  const view = new DataView(buffer)

  let offset = 0

  // Helper to write a 4-char ASCII tag
  function writeStr(str: string) {
    for (let i = 0; i < 4; i++) {
      view.setUint8(offset++, str.charCodeAt(i))
    }
  }

  function writeU16LE(val: number) {
    view.setUint16(offset, val, true)
    offset += 2
  }

  function writeU32LE(val: number) {
    view.setUint32(offset, val, true)
    offset += 4
  }

  function writeI32LE(val: number) {
    view.setInt32(offset, val, true)
    offset += 4
  }

  // === RIFF header ===
  writeStr('RIFF')
  writeU32LE(totalSize - 8)  // file size minus 8 (RIFF id + size)
  writeStr('WAVE')

  // === fmt chunk ===
  writeStr('fmt ')
  writeU32LE(16)             // chunk size (PCM fmt = 16 bytes)
  writeU16LE(1)              // audio format: 1 = PCM
  writeU16LE(numChannels)    // number of channels
  writeU32LE(sampleRate)     // sample rate
  writeU32LE(byteRate)       // byte rate
  writeU16LE(blockAlign)     // block align
  writeU16LE(bitDepth)       // bits per sample

  // === smpl chunk ===
  // Spec: 60 bytes payload for one loop point
  writeStr('smpl')
  writeU32LE(smplChunkSize)
  writeU32LE(0)              // manufacturer
  writeU32LE(0)              // product
  writeU32LE(Math.round(1e9 / sampleRate))  // sample period (nanoseconds)
  writeU32LE(60)             // MIDI unity note (60 = middle C)
  writeU32LE(0)              // MIDI pitch fraction
  writeU32LE(0)              // SMPTE format
  writeI32LE(0)              // SMPTE offset
  writeU32LE(1)              // number of sample loops
  writeU32LE(0)              // sampler data (extra bytes after loops)

  // Sample loop record (24 bytes)
  writeU32LE(0)              // cue point ID
  writeU32LE(0)              // type: 0 = forward
  writeU32LE(0)              // start: 0 = start of data
  writeU32LE(numSampleFrames - 1)  // end: last sample frame
  writeU32LE(0)              // fraction
  writeU32LE(0)              // play count: 0 = infinite

  // === data chunk ===
  writeStr('data')
  writeU32LE(dataSize)

  // Interleaved PCM samples
  if (bitDepth === 16) {
    for (let frame = 0; frame < numSampleFrames; frame++) {
      for (let ch = 0; ch < numChannels; ch++) {
        const sample = channelData[ch]![frame] ?? 0
        const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
        view.setInt16(offset, int16, true)
        offset += 2
      }
    }
  }

  return buffer
}

/**
 * Apply a linear crossfade to the end of channel data.
 * The last crossfadeSamples frames fade from their values toward the start values.
 * Modifies channelData in place.
 */
export function applyCrossfade(channelData: Float32Array[], crossfadeSamples: number): void {
  const loopLen = channelData[0]?.length ?? 0
  if (crossfadeSamples <= 0 || crossfadeSamples > loopLen) return

  for (const channel of channelData) {
    for (let t = 0; t < crossfadeSamples; t++) {
      const weight = t / crossfadeSamples  // 0 at start of fade, 1 at end
      const idxEnd = loopLen - crossfadeSamples + t
      channel[idxEnd] = (channel[idxEnd]!) * (1 - weight) + (channel[t]!) * weight
    }
  }
}

/**
 * Generate a download filename for an exported loop.
 *
 * @param originalName - original file name (with or without extension)
 * @param rank - loop rank (1-based)
 * @param duration - loop duration in seconds
 * @param bpm - optional BPM for bar annotation
 * @param bars - optional bar count
 */
export function generateExportFilename(
  originalName: string,
  rank: number,
  duration: number,
  bpm?: number,
  bars?: number
): string {
  // Remove extension
  const lastDot = originalName.lastIndexOf('.')
  const baseName = lastDot > 0 ? originalName.slice(0, lastDot) : originalName

  // Sanitize: replace invalid filesystem characters
  const safeName = baseName.replace(/[^a-zA-Z0-9_\-. ]/g, '_')

  const durationStr = duration.toFixed(3)

  let suffix = ''
  if (bpm !== undefined && bars !== undefined) {
    const barWord = bars === 1 ? '1bar' : `${bars}bars`
    suffix = `_${barWord}_${Math.round(bpm)}bpm`
  }

  return `${safeName}_loop${rank}_${durationStr}s${suffix}.wav`
}

/**
 * Trigger a browser download of the given ArrayBuffer as a WAV file.
 * Creates a Blob URL, clicks a synthetic anchor, then revokes the URL.
 */
export function downloadWav(buffer: ArrayBuffer, filename: string): void {
  const blob = new Blob([buffer], { type: 'audio/wav' })

  if (typeof URL.createObjectURL !== 'function') {
    console.error('URL.createObjectURL is not available in this browser.')
    return
  }

  const url = URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.click()

  setTimeout(() => {
    URL.revokeObjectURL(url)
  }, 0)
}
