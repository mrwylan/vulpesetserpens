import type { CreatorProfile, LoopCandidate, WaveformPeaks } from '../../types'
import { CandidateCard } from '../CandidateCard/CandidateCard'
import './CandidateList.css'

interface CandidateListProps {
  candidates: LoopCandidate[]
  peaks: WaveformPeaks | null
  selectedRank: number | null
  playingRank: number | null
  upCrossings: number[]
  sampleRate: number
  profile: CreatorProfile
  analysisWarning?: string
  onPlay: (candidate: LoopCandidate) => void
  onStop: () => void
  onSelectCandidate: (rank: number) => void
  onExport: (candidate: LoopCandidate) => void
  onNudgeStart: (rank: number, direction: 1 | -1) => void
  onNudgeEnd: (rank: number, direction: 1 | -1) => void
  onReset: (rank: number) => void
  onCutMoveCrossfade: (candidate: LoopCandidate) => void
}

export function CandidateList({
  candidates,
  peaks,
  selectedRank,
  playingRank,
  upCrossings,
  sampleRate,
  profile,
  analysisWarning,
  onPlay,
  onStop,
  onSelectCandidate,
  onExport,
  onNudgeStart,
  onNudgeEnd,
  onReset,
  onCutMoveCrossfade,
}: CandidateListProps) {
  return (
    <section className="CandidateList" aria-label="Loop candidates">
      <div className="CandidateList__header">
        <h2 className="CandidateList__title">
          Loop Candidates{' '}
          <span className="CandidateList__count">({candidates.length} found)</span>
        </h2>
      </div>

      {analysisWarning && (
        <p className="CandidateList__warning" role="status">
          {analysisWarning}
        </p>
      )}

      {candidates.length === 0 ? (
        <p className="CandidateList__empty">No loop candidates found.</p>
      ) : (
        <div className="CandidateList__scroller" role="list">
          {candidates.map((candidate) => (
            <div key={candidate.rank} role="listitem">
              <CandidateCard
                candidate={candidate}
                peaks={peaks}
                isPlaying={playingRank === candidate.rank}
                isSelected={selectedRank === candidate.rank}
                upCrossings={upCrossings}
                sampleRate={sampleRate}
                profile={profile}
                onPlay={onPlay}
                onStop={onStop}
                onSelect={onSelectCandidate}
                onExport={onExport}
                onNudgeStart={onNudgeStart}
                onNudgeEnd={onNudgeEnd}
                onReset={onReset}
                onCutMoveCrossfade={onCutMoveCrossfade}
              />
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
