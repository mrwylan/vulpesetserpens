import { useEffect, useRef } from 'react'
import type { DerivedCandidate } from '../../types'
import { DerivedCandidateCard } from './DerivedCandidateCard'
import './DerivedCandidateSection.css'

interface DerivedCandidateSectionProps {
  derivedCandidates: DerivedCandidate[]
  playingDerivedId: string | null
  onPlay: (candidate: DerivedCandidate) => void
  onStop: () => void
  onExport: (candidate: DerivedCandidate) => void
}

export function DerivedCandidateSection({
  derivedCandidates,
  playingDerivedId,
  onPlay,
  onStop,
  onExport,
}: DerivedCandidateSectionProps) {
  const scrollerRef = useRef<HTMLDivElement>(null)

  // Scroll the last added card into view whenever a new one is appended
  useEffect(() => {
    const scroller = scrollerRef.current
    if (!scroller || derivedCandidates.length === 0) return
    const lastCard = scroller.lastElementChild
    lastCard?.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' })
  }, [derivedCandidates.length])

  return (
    <section
      className="DerivedCandidateSection"
      aria-label="Post-processed loop candidates"
      data-testid="derived-candidate-section"
    >
      <div className="DerivedCandidateSection__header">
        <h2 className="DerivedCandidateSection__title">
          Post-Processed{' '}
          <span className="DerivedCandidateSection__count">
            ({derivedCandidates.length} result{derivedCandidates.length !== 1 ? 's' : ''})
          </span>
        </h2>
      </div>

      <div className="DerivedCandidateSection__scroller" ref={scrollerRef} role="list">
        {derivedCandidates.map((candidate) => (
          <div key={candidate.id} role="listitem">
            <DerivedCandidateCard
              candidate={candidate}
              isPlaying={playingDerivedId === candidate.id}
              onPlay={onPlay}
              onStop={onStop}
              onExport={onExport}
            />
          </div>
        ))}
      </div>
    </section>
  )
}
