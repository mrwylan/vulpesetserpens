/**
 * Analysis Web Worker — runs detectLoops algorithm off the main thread.
 * Zero DOM access. Pure computation only.
 *
 * Message protocol:
 * - Receives: { channels: Float32Array[], sampleRate: number, bpm?: number, minDuration?: number, maxDuration?: number }
 * - Sends: { type: 'progress', phase: string } | { type: 'complete', candidates: [...], upCrossings: [...] } | { type: 'error', error: string }
 */

import { detectLoops } from '../audio/detectLoops'
import type { WorkerInput, WorkerMessage } from '../types'

self.onmessage = (event: MessageEvent<WorkerInput>) => {
  const { channels, sampleRate, bpm, minDuration, maxDuration } = event.data

  try {
    const result = detectLoops(channels, sampleRate, {
      bpm,
      minDuration,
      maxDuration,
      onProgress: (phase: string) => {
        const msg: WorkerMessage = { type: 'progress', phase, message: `${phase}…` }
        self.postMessage(msg)
      },
    })

    const completeMsg: WorkerMessage = {
      type: 'complete',
      candidates: result.candidates,
      upCrossings: result.upCrossings,
      reasonCode: result.reasonCode,
    }
    self.postMessage(completeMsg)
  } catch (err) {
    const errorMsg: WorkerMessage = {
      type: 'error',
      error: err instanceof Error ? err.message : String(err),
    }
    self.postMessage(errorMsg)
  }
}
