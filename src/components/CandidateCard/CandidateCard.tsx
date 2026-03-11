import type { LoopCandidate } from '../../types'
import './CandidateCard.css'

// Candidate colour palette — matches theme.css tokens
const LOOP_COLORS = [
  '#f0a500', '#22d3ee', '#a78bfa', '#34d399', '#fb923c',
  '#e879f9', '#60a5fa', '#f472b6', '#a3e635', '#38bdf8',
]

function getCandidateColor(rank: number): string {
  return LOOP_COLORS[(rank - 1) % LOOP_COLORS.length] ?? LOOP_COLORS[0]!
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${mins}:${secs}`
}

/** Show ms for sub-second durations (sound-designer micro-loops), seconds otherwise. */
function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`
  }
  return `${seconds.toFixed(3)} s`
}

/** Show times in ms for sub-second durations, mm:ss.mmm otherwise. */
function formatTimeRange(startSec: number, endSec: number): string {
  if (endSec < 1) {
    return `${(startSec * 1000).toFixed(1)} – ${(endSec * 1000).toFixed(1)} ms`
  }
  return `${formatTime(startSec)} – ${formatTime(endSec)}`
}

interface CandidateCardProps {
  candidate: LoopCandidate
  isPlaying: boolean
  isSelected: boolean
  upCrossings: number[]
  sampleRate: number
  onPlay: (candidate: LoopCandidate) => void
  onStop: () => void
  onSelect: (rank: number) => void
  onExport: (candidate: LoopCandidate) => void
  onNudgeStart: (rank: number, direction: 1 | -1) => void
  onNudgeEnd: (rank: number, direction: 1 | -1) => void
  onReset: (rank: number) => void
}

export function CandidateCard({
  candidate,
  isPlaying,
  isSelected,
  onPlay,
  onStop,
  onSelect,
  onExport,
  onNudgeStart,
  onNudgeEnd,
  onReset,
}: CandidateCardProps) {
  const { rank, duration, startTime, endTime, score, barAnnotation, lowConfidence, userModified } = candidate
  const color = getCandidateColor(rank)
  const hasOriginal = candidate.originalStartSample !== undefined

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    if (isPlaying) {
      onStop()
    } else {
      onPlay(candidate)
    }
  }

  const handleExportClick = (e: React.MouseEvent) => {
    e.stopPropagation()
    onExport(candidate)
  }

  return (
    <div
      className={`CandidateCard${isSelected ? ' CandidateCard--selected' : ''}`}
      onClick={() => onSelect(rank)}
      role="button"
      aria-selected={isSelected}
      aria-label={`Loop candidate ${rank}`}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onSelect(rank)
        }
      }}
    >
      {/* Colour strip */}
      <div
        className="CandidateCard__colorStrip"
        style={{ backgroundColor: color }}
        aria-hidden="true"
      />

      {/* Header: rank + score bar */}
      <div className="CandidateCard__header">
        <span className="CandidateCard__rank">#{rank}</span>
        {!userModified ? (
          <>
            <div className="CandidateCard__scoreBar" title={`Score: ${(score * 100).toFixed(0)}%`}>
              <div
                className="CandidateCard__scoreFill"
                style={{ width: `${score * 100}%`, backgroundColor: color }}
              />
            </div>
            {lowConfidence && (
              <span
                className="CandidateCard__lowConfidence"
                title="No high-quality loop point found — this is the best available result."
              >
                ⚠
              </span>
            )}
          </>
        ) : (
          <span className="CandidateCard__adjusted">(adjusted)</span>
        )}
      </div>

      {/* Bar annotation */}
      {barAnnotation && (
        <div className="CandidateCard__bars">{barAnnotation} (4/4 assumed)</div>
      )}

      {/* Duration */}
      <div className="CandidateCard__duration">{formatDuration(duration)}</div>

      {/* Start–End times */}
      <div className="CandidateCard__times">
        {formatTimeRange(startTime, endTime)}
      </div>

      {/* Nudge controls */}
      <div className="CandidateCard__nudgeRow">
        <span>start:</span>
        <button
          className="CandidateCard__nudgeBtn"
          onClick={(e) => { e.stopPropagation(); onNudgeStart(rank, -1) }}
          aria-label="Nudge start left"
          title="Nudge start left one zero-crossing"
        >◀</button>
        <button
          className="CandidateCard__nudgeBtn"
          onClick={(e) => { e.stopPropagation(); onNudgeStart(rank, 1) }}
          aria-label="Nudge start right"
          title="Nudge start right one zero-crossing"
        >▶</button>
        <span>end:</span>
        <button
          className="CandidateCard__nudgeBtn"
          onClick={(e) => { e.stopPropagation(); onNudgeEnd(rank, -1) }}
          aria-label="Nudge end left"
          title="Nudge end left one zero-crossing"
        >◀</button>
        <button
          className="CandidateCard__nudgeBtn"
          onClick={(e) => { e.stopPropagation(); onNudgeEnd(rank, 1) }}
          aria-label="Nudge end right"
          title="Nudge end right one zero-crossing"
        >▶</button>
      </div>

      {/* Reset button (only if modified) */}
      {userModified && hasOriginal && (
        <button
          className="CandidateCard__resetBtn"
          onClick={(e) => { e.stopPropagation(); onReset(rank) }}
          aria-label="Reset to original algorithm values"
        >
          reset to original
        </button>
      )}

      {/* Actions */}
      <div className="CandidateCard__actions">
        <button
          className={`CandidateCard__playBtn${isPlaying ? ' CandidateCard__playBtn--playing' : ''}`}
          onClick={handlePlayClick}
          aria-label={isPlaying ? 'Stop playback' : 'Play loop'}
          data-playing={isPlaying}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <button
          className="CandidateCard__exportBtn"
          onClick={handleExportClick}
          aria-label={`Export loop ${rank}`}
          title="Export this loop as WAV"
        >
          ↓
        </button>
      </div>
    </div>
  )
}
