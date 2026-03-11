/**
 * Hook to manage the analysis Web Worker lifecycle.
 * Handles worker creation, message handling, and timeout guard.
 */

import { useCallback, useRef } from 'react'
import type { LoopCandidate } from '../types'
import { detectLoops } from '../audio/detectLoops'

const WORKER_TIMEOUT_MS = 30000

export interface AnalysisCallbacks {
  onProgress: (phase: string) => void
  onComplete: (candidates: LoopCandidate[], upCrossings: number[], reasonCode?: string) => void
  onError: (message: string) => void
}

export interface AnalysisOptions {
  bpm?: number
  creatorProfile?: import('../types').CreatorProfile
  minDuration?: number
  maxDuration?: number
}

export function useAnalysisWorker() {
  const workerRef = useRef<Worker | null>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const cancel = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
    if (workerRef.current) {
      workerRef.current.terminate()
      workerRef.current = null
    }
  }, [])

  const analyze = useCallback(
    (buffer: AudioBuffer, callbacks: AnalysisCallbacks, options: AnalysisOptions = {}) => {
      cancel()

      // Extract channel data from AudioBuffer
      const channels: Float32Array[] = []
      const transferList: ArrayBuffer[] = []

      for (let i = 0; i < buffer.numberOfChannels; i++) {
        const channelData = buffer.getChannelData(i)
        // Copy to a new buffer so we can transfer it
        const copy = new Float32Array(channelData)
        channels.push(copy)
        transferList.push(copy.buffer)
      }

      const sampleRate = buffer.sampleRate

      const { bpm, creatorProfile, minDuration, maxDuration } = options

      if (typeof Worker !== 'undefined') {
        // Use Web Worker for non-blocking analysis
        try {
          // Dynamic import with ?worker suffix for Vite
          const worker = new Worker(
            new URL('../worker/analysisWorker.ts', import.meta.url),
            { type: 'module' }
          )
          workerRef.current = worker

          // Set timeout guard
          timeoutRef.current = setTimeout(() => {
            cancel()
            callbacks.onError('Analysis timed out. The audio may be too complex to analyze.')
          }, WORKER_TIMEOUT_MS)

          worker.onmessage = (event) => {
            const msg = event.data as { type: string; phase?: string; message?: string; candidates?: LoopCandidate[]; upCrossings?: number[]; reasonCode?: string; error?: string }

            if (msg.type === 'progress' && msg.phase) {
              callbacks.onProgress(msg.phase)
            } else if (msg.type === 'complete') {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = null
              }
              workerRef.current = null
              callbacks.onComplete(
                msg.candidates ?? [],
                msg.upCrossings ?? [],
                msg.reasonCode
              )
            } else if (msg.type === 'error') {
              if (timeoutRef.current) {
                clearTimeout(timeoutRef.current)
                timeoutRef.current = null
              }
              workerRef.current = null
              callbacks.onError(msg.error ?? 'Unknown analysis error')
            }
          }

          worker.onerror = (event) => {
            cancel()
            callbacks.onError(`Loop detection failed unexpectedly: ${event.message}`)
          }

          worker.postMessage({ channels, sampleRate, bpm, creatorProfile, minDuration, maxDuration }, transferList)
        } catch (_err) {
          // Worker creation failed — fall back to synchronous execution
          runSynchronous(channels, sampleRate, { bpm, creatorProfile, minDuration, maxDuration }, callbacks)
        }
      } else {
        // Web Worker not supported — fallback
        callbacks.onProgress('sync-fallback')
        runSynchronous(channels, sampleRate, { bpm, creatorProfile, minDuration, maxDuration }, callbacks)
      }
    },
    [cancel]
  )

  return { analyze, cancel }
}

function runSynchronous(
  channels: Float32Array[],
  sampleRate: number,
  options: AnalysisOptions,
  callbacks: AnalysisCallbacks
) {
  try {
    const result = detectLoops(channels, sampleRate, { ...options, onProgress: callbacks.onProgress })
    callbacks.onComplete(result.candidates, result.upCrossings, result.reasonCode)
  } catch (err) {
    callbacks.onError(err instanceof Error ? err.message : String(err))
  }
}
