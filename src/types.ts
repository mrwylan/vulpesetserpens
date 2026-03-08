/**
 * Core data types for vulpesetserpens.
 * All shared types live here. Module-scoped types may be defined in-module.
 */

export interface LoopCandidate {
  startSample: number      // loop start, integer sample index
  endSample: number        // loop end, integer sample index
  startTime: number        // startSample / sampleRate, seconds
  endTime: number          // endSample / sampleRate, seconds
  duration: number         // endTime - startTime, seconds
  score: number            // composite score, 0.0–1.0
  shapeScore: number       // S_shape sub-score
  slopeScore: number       // S_slope sub-score
  periodScore: number      // S_period sub-score
  energyScore: number      // S_energy sub-score
  crossfadeDuration: number // recommended crossfade in seconds (0 or 0.01)
  rank: number             // 1-based rank position
  lowConfidence: boolean   // true if score < 0.3 (best-available result)
  userModified: boolean    // set to true by UC-007 when manually adjusted
  // Original values before user modification
  originalStartSample?: number
  originalEndSample?: number
  // Bar annotation fields (populated when BPM is set)
  barAnnotation?: string
  approximateBars?: number
}

export interface AudioFile {
  name: string
  size: number
  sampleRate: number
  numberOfChannels: number
  duration: number
}

export type AppState =
  | { kind: 'empty' }
  | { kind: 'loading'; fileName: string }
  | { kind: 'analyzing'; audioFile: AudioFile; buffer: AudioBuffer; progressMessage: string; waveformPeaks: WaveformPeaks | null }
  | { kind: 'results'; audioFile: AudioFile; buffer: AudioBuffer; candidates: LoopCandidate[]; waveformPeaks: WaveformPeaks; upCrossings: number[]; analysisWarning?: string }

export interface WaveformPeaks {
  min: Float32Array
  max: Float32Array
  /** Number of audio samples per pixel column */
  binSize: number
}

export interface WorkerMessage {
  type: 'progress' | 'complete' | 'error'
  phase?: string
  message?: string
  candidates?: LoopCandidate[]
  upCrossings?: number[]
  reasonCode?: 'TOO_SHORT' | 'NO_CROSSINGS' | 'LOW_CONFIDENCE'
  error?: string
}

export interface WorkerInput {
  channels: Float32Array[]
  sampleRate: number
  bpm?: number
}

export interface PlaybackState {
  isPlaying: boolean
  candidateRank: number | null
  sourceNode: AudioBufferSourceNode | null
  gainNode: GainNode | null
  startedAt: number
  loopStartTime: number
  loopDuration: number
}
