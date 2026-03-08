/**
 * Global keyboard shortcuts for loop auditioning (UC-004, UC-007).
 * Shortcuts work regardless of current focus target.
 */

import { useEffect } from 'react'
import type { LoopCandidate } from '../types'

interface KeyboardShortcutsProps {
  candidates: LoopCandidate[]
  selectedRank: number | null
  isPlaying: boolean
  onPlay: (candidate: LoopCandidate) => void
  onStop: () => void
  onSelectCandidate: (rank: number) => void
  onNudgeStart?: (direction: 1 | -1) => void
}

export function useKeyboardShortcuts({
  candidates,
  selectedRank,
  isPlaying,
  onPlay,
  onStop,
  onSelectCandidate,
  onNudgeStart,
}: KeyboardShortcutsProps) {
  useEffect(() => {
    if (candidates.length === 0) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't intercept when typing in an input
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

      switch (e.key) {
        case ' ': {
          e.preventDefault()
          if (isPlaying) {
            onStop()
          } else {
            const candidate = candidates.find(c => c.rank === (selectedRank ?? 1))
            if (candidate) onPlay(candidate)
          }
          break
        }

        case 'Escape': {
          e.preventDefault()
          onStop()
          break
        }

        case 'ArrowUp':
        case 'ArrowLeft': {
          e.preventDefault()
          const newRank = Math.max(1, (selectedRank ?? 1) - 1)
          const candidate = candidates.find(c => c.rank === newRank)
          if (candidate) {
            onSelectCandidate(newRank)
            if (isPlaying) onPlay(candidate)
          }
          break
        }

        case 'ArrowDown':
        case 'ArrowRight': {
          e.preventDefault()
          const newRank = Math.min(candidates.length, (selectedRank ?? 1) + 1)
          const candidate = candidates.find(c => c.rank === newRank)
          if (candidate) {
            onSelectCandidate(newRank)
            if (isPlaying) onPlay(candidate)
          }
          break
        }

        case ',': {
          e.preventDefault()
          onNudgeStart?.(-1)
          break
        }

        case '.': {
          e.preventDefault()
          onNudgeStart?.(1)
          break
        }

        default: {
          // 1–9: select candidate by rank
          const digit = parseInt(e.key, 10)
          if (digit >= 1 && digit <= 9) {
            e.preventDefault()
            const candidate = candidates.find(c => c.rank === digit)
            if (candidate) {
              onSelectCandidate(digit)
              if (isPlaying) onPlay(candidate)
            }
          }
          break
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [candidates, selectedRank, isPlaying, onPlay, onStop, onSelectCandidate, onNudgeStart])
}
