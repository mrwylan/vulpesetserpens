import type { DerivedCandidate } from '../../types'
import './DerivedCandidateCard.css'

function formatDuration(seconds: number): string {
  if (seconds < 1) {
    return `${Math.round(seconds * 1000)} ms`
  }
  return `${seconds.toFixed(3)} s`
}

interface DerivedCandidateCardProps {
  candidate: DerivedCandidate
  isPlaying: boolean
  onPlay: (candidate: DerivedCandidate) => void
  onStop: () => void
  onExport: (candidate: DerivedCandidate) => void
}

export function DerivedCandidateCard({
  candidate,
  isPlaying,
  onPlay,
  onStop,
  onExport,
}: DerivedCandidateCardProps) {
  const { duration, sourceRank, barAnnotation, noSnapWarning } = candidate

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
      className="DerivedCandidateCard"
      data-testid="derived-candidate-card"
      aria-label={`Cut-Move-Crossfade result from candidate ${sourceRank}`}
    >
      {/* Header: CMX badge + source reference */}
      <div className="DerivedCandidateCard__header">
        <span className="DerivedCandidateCard__badge" data-testid="cmx-badge">CMX</span>
        <span className="DerivedCandidateCard__source">from #{sourceRank}</span>
      </div>

      {/* Bar annotation */}
      {barAnnotation && (
        <div className="DerivedCandidateCard__bars">{barAnnotation} (4/4 assumed)</div>
      )}

      {/* Duration */}
      <div className="DerivedCandidateCard__duration">{formatDuration(duration)}</div>

      {/* No-snap warning */}
      {noSnapWarning && (
        <div className="DerivedCandidateCard__warning">
          No zero-crossing found near cut point
        </div>
      )}

      {/* Actions */}
      <div className="DerivedCandidateCard__actions">
        <button
          className={`DerivedCandidateCard__playBtn${isPlaying ? ' DerivedCandidateCard__playBtn--playing' : ''}`}
          onClick={handlePlayClick}
          aria-label={isPlaying ? 'Stop playback' : 'Play processed loop'}
          data-playing={isPlaying}
        >
          {isPlaying ? '■ Stop' : '▶ Play'}
        </button>
        <button
          className="DerivedCandidateCard__exportBtn"
          onClick={handleExportClick}
          aria-label="Export processed loop as WAV"
          title="Export this loop as WAV"
        >
          ↓
        </button>
      </div>
    </div>
  )
}
