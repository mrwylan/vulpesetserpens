import { useRef, useEffect, useCallback } from 'react'
import type { WaveformPeaks, LoopCandidate } from '../../types'
import { slicePeaks } from '../../audio/slicePeaks'
import './SnippetPreview.css'

// Candidate colour palette — matches theme.css tokens
const LOOP_COLORS = [
  '#f0a500', '#22d3ee', '#a78bfa', '#34d399', '#fb923c',
  '#e879f9', '#60a5fa', '#f472b6', '#a3e635', '#38bdf8',
]

function getCandidateColor(rank: number): string {
  return LOOP_COLORS[(rank - 1) % LOOP_COLORS.length] ?? LOOP_COLORS[0]!
}

interface SnippetPreviewProps {
  peaks: WaveformPeaks | null
  candidate: LoopCandidate
  isSelected: boolean
}

const PREVIEW_HEIGHT = 44  // --snippet-preview-height

export function SnippetPreview({ peaks, candidate, isSelected }: SnippetPreviewProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    const { width, height } = canvas
    ctx.clearRect(0, 0, width, height)

    const color = getCandidateColor(candidate.rank)
    const bgColor = '#111118'  // --color-surface

    ctx.fillStyle = bgColor
    ctx.fillRect(0, 0, width, height)

    if (!peaks || peaks.min.length === 0) {
      // Shimmer gradient when peaks not yet available
      const gradient = ctx.createLinearGradient(0, 0, width, 0)
      gradient.addColorStop(0, '#111118')
      gradient.addColorStop(0.5, '#1a1a27')
      gradient.addColorStop(1, '#111118')
      ctx.fillStyle = gradient
      ctx.fillRect(0, 0, width, height)

      // Center line
      ctx.strokeStyle = '#25253a'
      ctx.lineWidth = 1
      ctx.beginPath()
      ctx.moveTo(0, height / 2)
      ctx.lineTo(width, height / 2)
      ctx.stroke()
      return
    }

    const sliced = slicePeaks(peaks, candidate.startSample, candidate.endSample, width)
    const numCols = sliced.min.length
    const colWidth = width / numCols

    // Waveform bars: 30% opacity at rest, 50% when selected
    const barOpacity = isSelected ? '80' : '4d'
    ctx.fillStyle = color + barOpacity
    for (let x = 0; x < numCols; x++) {
      const minVal = sliced.min[x] ?? 0
      const maxVal = sliced.max[x] ?? 0
      const yTop = ((1 - maxVal) / 2) * height
      const yBottom = ((1 - minVal) / 2) * height
      const barHeight = Math.max(1, yBottom - yTop)
      ctx.fillRect(Math.floor(x * colWidth), Math.floor(yTop), Math.max(1, Math.ceil(colWidth)), Math.ceil(barHeight))
    }

    // Center line at 70% opacity
    ctx.strokeStyle = color + 'b3'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, height / 2)
    ctx.lineTo(width, height / 2)
    ctx.stroke()
  }, [peaks, candidate, isSelected])

  const setupCanvas = useCallback(() => {
    const canvas = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return

    const cssWidth = container.clientWidth
    if (cssWidth === 0) {
      requestAnimationFrame(setupCanvas)
      return
    }

    const dpr = window.devicePixelRatio || 1
    canvas.width = Math.round(cssWidth * dpr)
    canvas.height = Math.round(PREVIEW_HEIGHT * dpr)
    canvas.style.width = `${cssWidth}px`
    canvas.style.height = `${PREVIEW_HEIGHT}px`

    const ctx = canvas.getContext('2d')
    if (ctx) ctx.scale(dpr, dpr)
  }, [])

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

  useEffect(() => {
    draw()
  }, [draw])

  return (
    <div ref={containerRef} className="SnippetPreview" data-testid="snippet-preview">
      <canvas
        ref={canvasRef}
        className="SnippetPreview__canvas"
        aria-hidden="true"
      />
    </div>
  )
}
