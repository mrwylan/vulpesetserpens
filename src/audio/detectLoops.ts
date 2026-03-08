/**
 * Full 6-phase loop detection pipeline (UC-003).
 * Runs in a Web Worker context — no DOM access.
 */

import type { LoopCandidate } from '../types'
import { mixToMono } from './mixToMono'
import { findUpwardZeroCrossings } from './zeroCrossings'
import { computeAutocorrelation } from './autocorrelation'
import {
  computeShapeScore,
  computeSlopeScore,
  computePeriodScore,
  computeEnergyScore,
  computeCompositeScore,
} from './scoreCandidate'

const MIN_DURATION = 0.5   // seconds
const MAX_DURATION = 60.0  // seconds
const LOW_CONFIDENCE_THRESHOLD = 0.3
const DEDUP_TOLERANCE_SECONDS = 0.05  // 50ms
const CROSSFADE_THRESHOLD = 0.7
const CROSSFADE_DURATION = 0.01  // 10ms
const ANALYSIS_WINDOW_SECONDS = 10
// Downsample to this rate before autocorrelation. Loop periods are measured in
// seconds, so ~400 Hz gives more than enough temporal resolution while reducing
// autocorrelation cost by (sampleRate/CORR_RATE)² — about 12000× for 44100 Hz.
// Lower rate also naturally suppresses signal-frequency harmonics (e.g. 220 Hz
// sine aliases to near-DC at 400 Hz, so it only creates ~1 autocorrelation peak
// per musical period instead of hundreds of harmonic peaks).
const CORR_RATE = 400   // Hz
// Maximum number of preferred lengths passed to Phase 4 scoring.
// Prevents combinatorial explosion when autocorrelation finds many harmonics.
const MAX_PREFERRED_LENGTHS = 16

type ProgressCallback = (phase: string) => void

export interface DetectLoopsResult {
  candidates: LoopCandidate[]
  upCrossings: number[]
  reasonCode?: 'TOO_SHORT' | 'NO_CROSSINGS' | 'LOW_CONFIDENCE'
}

/**
 * Run the full loop detection algorithm.
 *
 * @param channels - per-channel Float32Array buffers
 * @param sampleRate - audio sample rate
 * @param bpm - optional BPM reference for period scoring
 * @param onProgress - callback for progress updates
 */
export function detectLoops(
  channels: Float32Array[],
  sampleRate: number,
  bpm?: number,
  onProgress?: ProgressCallback
): DetectLoopsResult {
  // === Phase 1: Preparation ===
  onProgress?.('mono mix')
  const mono = mixToMono(channels)
  const totalSamples = mono.length
  const audioDuration = totalSamples / sampleRate

  const minSamples = Math.round(MIN_DURATION * sampleRate)
  const maxDuration = Math.min(audioDuration, MAX_DURATION)
  const maxSamples = Math.round(maxDuration * sampleRate)

  if (audioDuration < MIN_DURATION) {
    return { candidates: [], upCrossings: [], reasonCode: 'TOO_SHORT' }
  }

  // === Phase 2: Zero-crossing detection ===
  onProgress?.('zero-crossings')
  const upCrossings = findUpwardZeroCrossings(mono)

  if (upCrossings.length < 2) {
    return { candidates: [], upCrossings: [], reasonCode: 'NO_CROSSINGS' }
  }

  // === Phase 3: Autocorrelation period estimation ===
  onProgress?.('autocorrelation')
  const toleranceSamples = Math.round(0.05 * sampleRate)

  let preferredLengths: number[] = []
  let correlationValues = new Float32Array(0)
  let corrMinLag = minSamples

  // If BPM provided, compute preferred bar lengths directly
  if (bpm && bpm > 0) {
    const secondsPerBeat = 60 / bpm
    const secondsPerBar = secondsPerBeat * 4
    const preferredDurations = [0.5, 1, 2, 4, 8, 16].map(bars => bars * secondsPerBar)
    preferredLengths = preferredDurations
      .map(d => Math.round(d * sampleRate))
      .filter(s => s >= minSamples && s <= maxSamples)
  }

  // Always compute autocorrelation (may supplement BPM lengths).
  // Downsample to CORR_RATE before running the O(N²) correlation so that
  // large files (e.g. 4s × 44100 Hz) don't stall the worker.
  // Periods detected at the lower rate are scaled back to full-rate samples.
  if (maxSamples > minSamples) {
    const downsample = Math.max(1, Math.round(sampleRate / CORR_RATE))
    const corrSR = sampleRate / downsample

    // Simple decimation (no anti-alias filter needed — we only need period peaks)
    const monoDs = new Float32Array(Math.ceil(mono.length / downsample))
    for (let i = 0; i < monoDs.length; i++) monoDs[i] = mono[i * downsample]!

    const dsWindow = Math.min(monoDs.length, Math.round(ANALYSIS_WINDOW_SECONDS * corrSR))
    const dsMin = Math.max(1, Math.round(MIN_DURATION * corrSR))
    const dsMax = Math.min(monoDs.length, Math.round(Math.min(audioDuration, MAX_DURATION) * corrSR))

    const corrResult = computeAutocorrelation(monoDs, dsMin, dsMax, dsWindow)
    correlationValues = corrResult.values
    corrMinLag = Math.round(corrResult.minLag * downsample)

    // Sort preferred lengths by correlation strength (descending) and cap.
    // Without this, a pure-tone input can produce hundreds of harmonic peaks
    // (one per period multiple), causing O(N²) explosion in Phase 4.
    const topLengths = corrResult.preferredLengths
      .map(l => ({ l, v: corrResult.values[l - corrResult.minLag] ?? 0 }))
      .sort((a, b) => b.v - a.v)
      .slice(0, MAX_PREFERRED_LENGTHS)
      .map(x => x.l)

    // Scale detected periods back to full sample rate
    const scaledLengths = topLengths.map(l => Math.round(l * downsample))

    if (preferredLengths.length === 0) {
      preferredLengths = scaledLengths
    } else {
      preferredLengths = [...preferredLengths, ...scaledLengths]
    }
  }

  // === Phase 4: Score candidate pairs ===
  onProgress?.('scoring')

  // Build a lookup set for fast zero-crossing membership testing
  const upCrossingSet = new Set(upCrossings)

  const candidates: LoopCandidate[] = []

  // For each start crossing, test end positions at preferred lengths ± tolerance
  // This avoids O(M²) complexity
  for (const startIdx of upCrossings) {
    if (startIdx + minSamples >= totalSamples) break

    let endTargets: number[]

    if (preferredLengths.length > 0) {
      // Use preferred lengths + tolerance
      endTargets = []
      for (const pref of preferredLengths) {
        const target = startIdx + pref
        // Sample end positions within the tolerance window
        for (let delta = -toleranceSamples; delta <= toleranceSamples; delta += Math.round(toleranceSamples / 3)) {
          const candidate = target + delta
          if (candidate >= startIdx + minSamples && candidate <= startIdx + maxSamples && candidate < totalSamples) {
            endTargets.push(candidate)
          }
        }
      }
    } else {
      // No preferred lengths — sample regularly at 50ms intervals
      const stepSamples = Math.round(0.05 * sampleRate)
      endTargets = []
      for (let offset = minSamples; offset <= maxSamples; offset += stepSamples) {
        const candidate = startIdx + offset
        if (candidate < totalSamples) {
          endTargets.push(candidate)
        }
      }
    }

    for (const rawEnd of endTargets) {
      // Snap to nearest upward zero-crossing
      let endIdx: number | null = null
      let bestDist = toleranceSamples + 1

      // Check upCrossings near rawEnd
      const approxIdx = findNearestIndex(upCrossings, rawEnd)
      for (let delta = -2; delta <= 2; delta++) {
        const idx = approxIdx + delta
        if (idx >= 0 && idx < upCrossings.length) {
          const crossing = upCrossings[idx]!
          const dist = Math.abs(crossing - rawEnd)
          if (dist <= toleranceSamples && dist < bestDist) {
            bestDist = dist
            endIdx = crossing
          }
        }
      }

      if (endIdx === null) continue
      if (endIdx <= startIdx + minSamples - 1) continue
      if (endIdx > startIdx + maxSamples) continue

      // Verify endIdx is actually an upward zero-crossing
      if (!upCrossingSet.has(endIdx)) continue

      const loopLength = endIdx - startIdx

      // Compute scores
      const shapeScore = computeShapeScore(mono, startIdx, endIdx, sampleRate)
      const slopeScore = computeSlopeScore(mono, startIdx, endIdx)
      const periodScore = computePeriodScore(
        loopLength,
        preferredLengths,
        toleranceSamples,
        correlationValues,
        corrMinLag
      )
      const energyScore = computeEnergyScore(mono, startIdx, endIdx, sampleRate)
      const score = computeCompositeScore(shapeScore, slopeScore, periodScore, energyScore)

      const startTime = startIdx / sampleRate
      const endTime = endIdx / sampleRate
      const duration = endTime - startTime

      // Phase 5: crossfade recommendation
      const crossfadeDuration =
        shapeScore < CROSSFADE_THRESHOLD || slopeScore < CROSSFADE_THRESHOLD
          ? CROSSFADE_DURATION
          : 0

      candidates.push({
        startSample: startIdx,
        endSample: endIdx,
        startTime,
        endTime,
        duration,
        score,
        shapeScore,
        slopeScore,
        periodScore,
        energyScore,
        crossfadeDuration,
        rank: 0, // will be set after sorting
        lowConfidence: false, // will be set after threshold check
        userModified: false,
      })
    }
  }

  // Sort by score descending
  candidates.sort((a, b) => b.score - a.score)

  // Deduplicate: remove candidates whose start AND end are both within 50ms of a higher-ranked one
  const dedupedCandidates: LoopCandidate[] = []
  for (const c of candidates) {
    const duplicate = dedupedCandidates.some(
      (d) =>
        Math.abs(d.startTime - c.startTime) < DEDUP_TOLERANCE_SECONDS &&
        Math.abs(d.endTime - c.endTime) < DEDUP_TOLERANCE_SECONDS
    )
    if (!duplicate) {
      dedupedCandidates.push(c)
    }
    if (dedupedCandidates.length >= 10) break
  }

  // Phase 6: Assign ranks and low-confidence flags
  const allLowConfidence = dedupedCandidates.every(c => c.score < LOW_CONFIDENCE_THRESHOLD)

  for (let i = 0; i < dedupedCandidates.length; i++) {
    dedupedCandidates[i]!.rank = i + 1
    dedupedCandidates[i]!.lowConfidence = allLowConfidence || dedupedCandidates[i]!.score < LOW_CONFIDENCE_THRESHOLD
  }

  onProgress?.('complete')

  const reasonCode = allLowConfidence ? 'LOW_CONFIDENCE' : undefined

  return {
    candidates: dedupedCandidates,
    upCrossings,
    reasonCode,
  }
}

/**
 * Binary search to find the nearest index in a sorted array.
 */
function findNearestIndex(arr: number[], target: number): number {
  let lo = 0
  let hi = arr.length - 1

  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if ((arr[mid]!) < target) {
      lo = mid + 1
    } else {
      hi = mid
    }
  }

  return lo
}

/**
 * Compute bar annotation string from duration and BPM.
 * Rounds to nearest power of two in [0.5, 16].
 */
export function computeBarAnnotation(durationSeconds: number, bpm: number): string {
  const secondsPerBeat = 60 / bpm
  const secondsPerBar = secondsPerBeat * 4
  const rawBars = durationSeconds / secondsPerBar

  // Round to nearest power of 2 in [0.5, 1, 2, 4, 8, 16]
  const powers = [0.5, 1, 2, 4, 8, 16]
  let nearest = powers[0]!
  let minDiff = Infinity

  for (const p of powers) {
    const diff = Math.abs(rawBars - p)
    if (diff < minDiff) {
      minDiff = diff
      nearest = p
    }
  }

  const barWord = nearest === 0.5 ? '0.5 bar' : nearest === 1 ? '1 bar' : `${nearest} bars`
  return `≈ ${barWord}`
}

/**
 * Validate a BPM value. Returns an error string or null if valid.
 */
export function validateBpm(value: string): { bpm: number } | { error: string } {
  const num = parseFloat(value)
  if (isNaN(num) || !isFinite(num)) {
    return { error: 'Please enter a numeric BPM value (e.g., 120).' }
  }
  if (num < 20 || num > 300) {
    return { error: 'BPM must be between 20 and 300.' }
  }
  return { bpm: num }
}
