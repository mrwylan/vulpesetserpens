import { useRef, useEffect, useCallback, useState } from 'react'
import type { WaveformPeaks, LoopCandidate } from '../../types'
import './WaveformCanvas.css'

// Candidate colour palette — matches theme.css tokens
const LOOP_COLORS = [
  '#f0a500', // loop-1: amber
  '#22d3ee', // loop-2: cyan
  '#a78bfa', // loop-3: violet
  '#34d399', // loop-4: emerald
  '#fb923c', // loop-5: orange
  '#e879f9', // loop-6: fuchsia
  '#60a5fa', // loop-7: blue
  '#f472b6', // loop-8: pink
  '#a3e635', // loop-9: lime
  '#38bdf8', // loop-10: sky
]

function getCandidateColor(rank: number): string {
  return LOOP_COLORS[(rank - 1) % LOOP_COLORS.length] ?? LOOP_COLORS[0]!
}

interface DragState {
  active: boolean
  pointerId: number
  marker: 'start' | 'end'
  candidateRank: number
}

interface WaveformCanvasProps {
  peaks: WaveformPeaks | null
  candidates: LoopCandidate[]
  selectedRank: number | null
  playheadPosition: number | null  // 0..1 ratio within loop
  upCrossings: number[]
  totalSamples: number
  sampleRate: number
  isAnalyzing?: boolean
  onCandidateUpdate?: (rank: number, startSample: number, endSample: number) => void
  onSelectCandidate?: (rank: number) => void
}

const MARKER_HIT_ZONE = 12  // half of 24px

export function WaveformCanvas({
  peaks,
  candidates,
  selectedRank,
  playheadPosition,
  upCrossings,
  totalSamples,
  sampleRate,
  isAnalyzing,
  onCandidateUpdate,
  onSelectCandidate,
}: WaveformCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const dragRef = useRef<DragState | null>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Draw everything on the canvas
  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    // Background
    ctx.fillStyle = getComputedStyle(document.documentElement).getPropertyValue('--color-surface').trim() || '#111118'
    ctx.fillRect(0, 0, width, height)

    if (!peaks || peaks.min.length === 0) {
      if (isAnalyzing) {
        // Shimmer effect
        const gradient = ctx.createLinearGradient(0, 0, width, 0)
        gradient.addColorStop(0, '#111118')
        gradient.addColorStop(0.5, '#1a1a27')
        gradient.addColorStop(1, '#111118')
        ctx.fillStyle = gradient
        ctx.fillRect(0, 0, width, height)
      }
      // Draw center line
      ctx.strokeStyle = '#25253a'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    const numCols = peaks.min.length
    const colWidth = width / numCols

    // Draw waveform
    ctx.fillStyle = '#44445a'  // --color-text-disabled
    for (let x = 0; x < numCols; x++) {
      const minVal = peaks.min[x] ?? 0
      const maxVal = peaks.max[x] ?? 0
      const yTop = ((1 - maxVal) / 2) * height
      const yBottom = ((1 - minVal) / 2) * height
      const barHeight = Math.max(1, yBottom - yTop)
      ctx.fillRect(Math.floor(x * colWidth), Math.floor(yTop), Math.max(1, Math.ceil(colWidth)), Math.ceil(barHeight))
    }

    // Center line
    ctx.strokeStyle = '#25253a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()

    // Loop candidate overlays (non-selected first, then selected)
    const selectedCandidate = candidates.find(c => c.rank === selectedRank)

    ctx.save()
    for (const c of candidates) {
      if (c.rank === selectedRank) continue
      const color = getCandidateColor(c.rank)
      const x1 = (c.startSample / totalSamples) * width
      const x2 = (c.endSample / totalSamples) * width
      ctx.fillStyle = color + '40'  // 25% opacity
      ctx.fillRect(x1, 0, x2 - x1, height)

      // Boundary lines
      ctx.strokeStyle = color
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(x1, 0)
      ctx.lineTo(x1, height)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, 0)
      ctx.lineTo(x2, height)
      ctx.stroke()
    }
    ctx.restore()

    // Draw selected candidate overlay (brighter)
    if (selectedCandidate) {
      const color = getCandidateColor(selectedCandidate.rank)
      const x1 = (selectedCandidate.startSample / totalSamples) * width
      const x2 = (selectedCandidate.endSample / totalSamples) * width

      ctx.save()
      ctx.fillStyle = color + '66'  // 40% opacity
      ctx.fillRect(x1, 0, x2 - x1, height)

      // Boundary markers (bold)
      ctx.strokeStyle = color
      ctx.lineWidth = 2
      ctx.beginPath()
      ctx.moveTo(x1, 0)
      ctx.lineTo(x1, height)
      ctx.stroke()
      ctx.beginPath()
      ctx.moveTo(x2, 0)
      ctx.lineTo(x2, height)
      ctx.stroke()
      ctx.restore()
    }

    // Playhead
    if (playheadPosition !== null && selectedCandidate) {
      const x1 = (selectedCandidate.startSample / totalSamples) * width
      const x2 = (selectedCandidate.endSample / totalSamples) * width
      const playheadX = x1 + playheadPosition * (x2 - x1)

      ctx.save()
      ctx.strokeStyle = '#f0a500'  // --color-accent
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(playheadX, 0)
      ctx.lineTo(playheadX, height)
      ctx.stroke()
      ctx.restore()
    }
  }, [peaks, candidates, selectedRank, playheadPosition, totalSamples, isAnalyzing])

  // Setup canvas dimensions with HiDPI support
  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const cssWidth = container.clientWidth
    const cssHeight = 140  // --waveform-height

    if (cssWidth === 0 || (cssHeight as number) === 0) {
      requestAnimationFrame(setupCanvas)
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(cssHeight * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${cssHeight}px`

    const ctx = canvas.getContext('2d')
    if (ctx) {
      ctx.scale(dpr, dpr)
    }
  }, [])

  // Resize observer with 100ms debounce
  useEffect(() => {
    const container = containerRef.current
    if (!container) return

    let debounceTimer: ReturnType<typeof setTimeout>
    const observer = new ResizeObserver(() => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        setupCanvas()
        draw()
      }, 100)
    })

    observer.observe(container)
    setupCanvas()
    draw()

    return () => {
      observer.disconnect()
      clearTimeout(debounceTimer)
    }
  }, [setupCanvas, draw])

  // Redraw when data changes
  useEffect(() => {
    draw()
  }, [draw])

  // Animation frame for playhead
  useEffect(() => {
    if (playheadPosition !== null) {
      const animate = () => {
        draw()
        rafRef.current = requestAnimationFrame(animate)
      }
      rafRef.current = requestAnimationFrame(animate)
      return () => {
        if (rafRef.current) cancelAnimationFrame(rafRef.current)
      }
    }
  }, [playheadPosition, draw])

  // Pointer events for marker dragging (UC-007)
  const getMarkerAtX = useCallback(
    (x: number): { marker: 'start' | 'end'; candidateRank: number } | null => {
      const canvas = canvasRef.current
      if (!canvas || totalSamples === 0) return null

      const cssWidth = canvas.clientWidth
      const selected = candidates.find(c => c.rank === selectedRank)
      if (!selected) return null

      const startX = (selected.startSample / totalSamples) * cssWidth
      const endX = (selected.endSample / totalSamples) * cssWidth

      if (Math.abs(x - startX) <= MARKER_HIT_ZONE) {
        return { marker: 'start', candidateRank: selected.rank }
      }
      if (Math.abs(x - endX) <= MARKER_HIT_ZONE) {
        return { marker: 'end', candidateRank: selected.rank }
      }
      return null
    },
    [candidates, selectedRank, totalSamples]
  )

  const handlePointerDown = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = e.clientX - rect.left

      const hit = getMarkerAtX(x)
      if (hit) {
        canvas.setPointerCapture(e.pointerId)
        dragRef.current = {
          active: true,
          pointerId: e.pointerId,
          marker: hit.marker,
          candidateRank: hit.candidateRank,
        }
        setIsDragging(true)
        e.preventDefault()
      } else {
        // Click on candidate region to select it
        if (totalSamples === 0) return
        const sampleAt = Math.round((x / canvas.clientWidth) * totalSamples)
        for (const c of candidates) {
          if (sampleAt >= c.startSample && sampleAt <= c.endSample) {
            onSelectCandidate?.(c.rank)
            break
          }
        }
      }
    },
    [getMarkerAtX, candidates, totalSamples, onSelectCandidate]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent<HTMLCanvasElement>) => {
      if (!dragRef.current?.active) return

      const canvas = canvasRef.current
      if (!canvas) return

      const rect = canvas.getBoundingClientRect()
      const x = Math.max(0, Math.min(e.clientX - rect.left, canvas.clientWidth))
      const rawSample = Math.round((x / canvas.clientWidth) * totalSamples)

      const altHeld = e.altKey
      const drag = dragRef.current
      const candidate = candidates.find(c => c.rank === drag.candidateRank)
      if (!candidate) return

      let snappedSample = rawSample

      if (!altHeld && upCrossings.length > 0) {
        // Snap to nearest upward zero-crossing within ±5ms
        const toleranceSamples = Math.round(0.005 * sampleRate)
        let bestDist = toleranceSamples + 1
        let best = -1

        // Binary search for approximate position then scan nearby
        let lo = 0; let hi = upCrossings.length - 1
        while (lo < hi) {
          const mid = (lo + hi) >> 1
          if ((upCrossings[mid]!) < rawSample) lo = mid + 1
          else hi = mid
        }

        for (let di = -3; di <= 3; di++) {
          const idx = lo + di
          if (idx >= 0 && idx < upCrossings.length) {
            const dist = Math.abs((upCrossings[idx]!) - rawSample)
            if (dist <= toleranceSamples && dist < bestDist) {
              bestDist = dist
              best = upCrossings[idx]!
            }
          }
        }
        if (best >= 0) snappedSample = best
      }

      // Enforce minimum loop duration (20 ms)
      const minSamples = Math.round(0.02 * sampleRate)
      let newStart = candidate.startSample
      let newEnd = candidate.endSample

      if (drag.marker === 'start') {
        newStart = Math.min(snappedSample, candidate.endSample - minSamples)
        newStart = Math.max(0, newStart)
      } else {
        newEnd = Math.max(snappedSample, candidate.startSample + minSamples)
        newEnd = Math.min(totalSamples, newEnd)
      }

      onCandidateUpdate?.(drag.candidateRank, newStart, newEnd)
    },
    [candidates, upCrossings, sampleRate, totalSamples, onCandidateUpdate]
  )

  const handlePointerUp = useCallback(() => {
    if (dragRef.current?.active) {
      dragRef.current = null
      setIsDragging(false)
    }
  }, [])

  const handlePointerLeave = useCallback(() => {
    if (dragRef.current?.active) {
      // Cancel drag on leave — revert handled by onCandidateUpdate being controlled
      dragRef.current = null
      setIsDragging(false)
    }
  }, [])

  const handlePointerCancel = useCallback(() => {
    dragRef.current = null
    setIsDragging(false)
  }, [])

  return (
    <div ref={containerRef} className="WaveformCanvas">
      <canvas
        ref={canvasRef}
        className={`WaveformCanvas__canvas${isDragging ? ' WaveformCanvas__canvas--dragging' : ''}`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerLeave}
        onPointerCancel={handlePointerCancel}
        aria-label="Audio waveform visualization"
      />
    </div>
  )
}
