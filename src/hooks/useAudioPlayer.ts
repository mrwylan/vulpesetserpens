/**
 * Web Audio API playback controller for loop auditioning (UC-004).
 * Creates fresh AudioBufferSourceNode for every play — never reused.
 */

import { useCallback, useRef, useState, type MutableRefObject } from 'react'
import type { LoopCandidate } from '../types'

interface PlayerState {
  isPlaying: boolean
  playingRank: number | null
  loopStartTime: number
  loopDuration: number
  startedAt: number
}

const initialState: PlayerState = {
  isPlaying: false,
  playingRank: null,
  loopStartTime: 0,
  loopDuration: 0,
  startedAt: 0,
}

export function useAudioPlayer(audioContextRef: MutableRefObject<AudioContext | null>) {
  const sourceNodeRef = useRef<AudioBufferSourceNode | null>(null)
  const gainNodeRef = useRef<GainNode | null>(null)
  const [playerState, setPlayerState] = useState<PlayerState>(initialState)

  const stop = useCallback(() => {
    if (sourceNodeRef.current) {
      try {
        sourceNodeRef.current.stop(0)
      } catch (_e) {
        // Ignore if already stopped
      }
      sourceNodeRef.current.disconnect()
      sourceNodeRef.current = null
    }
    if (gainNodeRef.current) {
      gainNodeRef.current.disconnect()
      gainNodeRef.current = null
    }
    setPlayerState(initialState)
  }, [])

  const play = useCallback(
    async (buffer: AudioBuffer, candidate: LoopCandidate) => {
      const ctx = audioContextRef.current
      if (!ctx) return

      // Stop any current playback
      stop()

      // Resume context if suspended
      if (ctx.state === 'suspended') {
        try {
          await ctx.resume()
        } catch (_e) {
          console.error('AudioContext resume failed', _e)
          return
        }
      }

      if (ctx.state === 'closed') {
        console.error('AudioContext is closed')
        return
      }

      const { startSample, endSample, rank } = candidate
      const sampleRate = ctx.sampleRate
      const loopStartSec = startSample / sampleRate
      const loopEndSec = endSample / sampleRate
      const loopDuration = loopEndSec - loopStartSec

      if (loopDuration <= 0) {
        console.warn('Loop region is zero or negative length')
        return
      }

      // Clamp samples to valid range
      const clampedStart = Math.max(0, Math.min(startSample, buffer.length - 1))
      const clampedEnd = Math.max(0, Math.min(endSample, buffer.length))

      const gainNode = ctx.createGain()
      gainNode.gain.value = 1.0
      gainNode.connect(ctx.destination)
      gainNodeRef.current = gainNode

      const sourceNode = ctx.createBufferSource()
      sourceNode.buffer = buffer
      sourceNode.loop = true
      sourceNode.loopStart = clampedStart / sampleRate
      sourceNode.loopEnd = clampedEnd / sampleRate
      sourceNode.connect(gainNode)
      sourceNodeRef.current = sourceNode

      const startedAt = ctx.currentTime
      sourceNode.start(0, loopStartSec)

      setPlayerState({
        isPlaying: true,
        playingRank: rank,
        loopStartTime: loopStartSec,
        loopDuration,
        startedAt,
      })
    },
    [audioContextRef, stop]
  )

  const updateLoopBoundaries = useCallback(
    (startSample: number, endSample: number, sampleRate: number) => {
      if (!sourceNodeRef.current) return
      const loopStart = startSample / sampleRate
      const loopEnd = endSample / sampleRate
      sourceNodeRef.current.loopStart = loopStart
      sourceNodeRef.current.loopEnd = loopEnd
      setPlayerState(prev => ({
        ...prev,
        loopStartTime: loopStart,
        loopDuration: loopEnd - loopStart,
      }))
    },
    []
  )

  /**
   * Compute the current playhead position within the loop (0..1 ratio).
   * Call from requestAnimationFrame loop.
   */
  const getPlayheadPosition = useCallback(() => {
    const ctx = audioContextRef.current
    if (!ctx || !playerState.isPlaying || playerState.loopDuration <= 0) return null

    const elapsed = ctx.currentTime - playerState.startedAt
    const posInLoop = elapsed % playerState.loopDuration
    return posInLoop / playerState.loopDuration
  }, [audioContextRef, playerState])

  return {
    playerState,
    play,
    stop,
    updateLoopBoundaries,
    getPlayheadPosition,
    sourceNodeRef,
  }
}
