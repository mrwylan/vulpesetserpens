/**
 * Generates synthetic WAV fixtures for tests/fixtures/.
 * Run with: npx tsx scripts/generate-fixtures.ts
 *
 * All fixtures are Category A (synthetic) — no external sources needed.
 * These are deterministic and re-runnable.
 */

import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)
const FIXTURES_DIR = join(__dirname, '..', 'tests', 'fixtures')

interface WavSpec {
  filename: string
  sampleRate: number
  numChannels: number
  durationSeconds: number
  generator: (i: number, sampleRate: number, channel: number) => number
}

function generateSamples(spec: WavSpec): Float32Array[] {
  const numSamples = Math.round(spec.sampleRate * spec.durationSeconds)
  const channels: Float32Array[] = []
  for (let c = 0; c < spec.numChannels; c++) {
    const ch = new Float32Array(numSamples)
    for (let i = 0; i < numSamples; i++) {
      ch[i] = spec.generator(i, spec.sampleRate, c)
    }
    channels.push(ch)
  }
  return channels
}

function encodeWavManual(channels: Float32Array[], sampleRate: number, bitDepth = 16): Buffer {
  const numChannels = channels.length
  const numSamples = channels[0]!.length
  const bytesPerSample = bitDepth / 8
  const blockAlign = numChannels * bytesPerSample
  const byteRate = sampleRate * blockAlign
  const dataSize = numSamples * blockAlign
  const totalSize = 44 + dataSize

  const buf = Buffer.alloc(totalSize)
  let offset = 0

  function writeStr(str: string) {
    buf.write(str, offset, 4, 'ascii')
    offset += 4
  }
  function writeU32LE(val: number) {
    buf.writeUInt32LE(val >>> 0, offset)
    offset += 4
  }
  function writeU16LE(val: number) {
    buf.writeUInt16LE(val & 0xffff, offset)
    offset += 2
  }
  function writeI16LE(val: number) {
    buf.writeInt16LE(val, offset)
    offset += 2
  }

  // RIFF header
  writeStr('RIFF')
  writeU32LE(totalSize - 8)
  writeStr('WAVE')

  // fmt chunk
  writeStr('fmt ')
  writeU32LE(16)         // chunk size
  writeU16LE(1)          // PCM
  writeU16LE(numChannels)
  writeU32LE(sampleRate)
  writeU32LE(byteRate)
  writeU16LE(blockAlign)
  writeU16LE(bitDepth)

  // data chunk
  writeStr('data')
  writeU32LE(dataSize)

  // PCM samples (interleaved)
  for (let i = 0; i < numSamples; i++) {
    for (let c = 0; c < numChannels; c++) {
      const sample = channels[c]![i] ?? 0
      const int16 = Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))
      writeI16LE(int16)
    }
  }

  return buf
}

// Fixture definitions
const fixtures: WavSpec[] = [
  {
    filename: 'sine-440hz-2s.wav',
    sampleRate: 44100,
    numChannels: 1,
    durationSeconds: 2,
    generator: (i, sr) => Math.sin(2 * Math.PI * 440 * i / sr),
  },
  {
    filename: 'sine-220hz-4s.wav',
    sampleRate: 44100,
    numChannels: 1,
    durationSeconds: 4,
    generator: (i, sr) => Math.sin(2 * Math.PI * 220 * i / sr),
  },
  {
    filename: 'noise-1s.wav',
    sampleRate: 44100,
    numChannels: 1,
    durationSeconds: 1,
    generator: () => (Math.random() * 2 - 1) * 0.8,
  },
  {
    filename: 'stereo-sine-2s.wav',
    sampleRate: 44100,
    numChannels: 2,
    durationSeconds: 2,
    generator: (i, sr) => Math.sin(2 * Math.PI * 440 * i / sr),
  },
  {
    filename: 'silent-0.3s.wav',
    sampleRate: 44100,
    numChannels: 1,
    durationSeconds: 0.3,
    generator: () => 0,
  },
  {
    filename: 'dc-offset-2s.wav',
    sampleRate: 44100,
    numChannels: 1,
    durationSeconds: 2,
    generator: () => 0.5,
  },
]

// Ensure fixtures directory exists
mkdirSync(FIXTURES_DIR, { recursive: true })

// Generate all fixtures
for (const spec of fixtures) {
  const channels = generateSamples(spec)
  const wavBuffer = encodeWavManual(channels, spec.sampleRate)
  const outPath = join(FIXTURES_DIR, spec.filename)
  writeFileSync(outPath, wavBuffer)
  const sizeKB = (wavBuffer.length / 1024).toFixed(1)
  console.log(`Generated ${spec.filename} (${sizeKB} KB)`)
}

console.log('\nAll fixtures generated successfully.')
