import { useState, useCallback } from 'react'
import type { AudioFile, CreatorProfile } from '../../types'
import { validateBpm, PROFILE_CONFIGS } from '../../audio/detectLoops'
import './Header.css'

function formatDuration(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3).padStart(6, '0')
  return `${mins}:${secs}`
}

function formatChannels(n: number): string {
  if (n === 1) return 'Mono'
  if (n === 2) return 'Stereo'
  return `${n} ch`
}

interface HeaderProps {
  audioFile: AudioFile
  bpm: number | null
  profile: CreatorProfile
  onBpmChange: (bpm: number | null) => void
  onProfileChange: (profile: CreatorProfile) => void
  onClose: () => void
}

export function Header({ audioFile, bpm, profile, onBpmChange, onProfileChange, onClose }: HeaderProps) {
  const [bpmInputValue, setBpmInputValue] = useState(bpm !== null ? String(bpm) : '')
  const [bpmError, setBpmError] = useState<string | null>(null)

  const handleBpmCommit = useCallback(
    (value: string) => {
      if (!value.trim()) {
        setBpmError(null)
        onBpmChange(null)
        return
      }
      const result = validateBpm(value)
      if ('error' in result) {
        setBpmError(result.error)
      } else {
        setBpmError(null)
        onBpmChange(result.bpm)
      }
    },
    [onBpmChange]
  )

  const metadata = [
    `${audioFile.sampleRate.toLocaleString()} Hz`,
    formatChannels(audioFile.numberOfChannels),
    formatDuration(audioFile.duration),
    ...(bpm !== null ? [`${bpm} BPM`] : []),
  ].join(' · ')

  return (
    <header className="Header">
      <div className="Header__row">
        <div className="Header__left">
          <span className="Header__appName">vulpesetserpens</span>
          <span className="Header__fileName" title={audioFile.name}>
            {audioFile.name}
          </span>
        </div>
        <div className="Header__right">
          <button
            className="Header__closeBtn"
            onClick={onClose}
            aria-label="Load a new file"
          >
            ✕ load new
          </button>
        </div>
      </div>

      <div className="Header__row">
        <div className="Header__metaLeft">
          <span className="Header__metadata" data-testid="audio-metadata">{metadata}</span>
          <button
            className="Header__profileBadge"
            onClick={() => {
              const order: CreatorProfile[] = ['sound-designer', 'musician', 'producer']
              const next = order[(order.indexOf(profile) + 1) % order.length]!
              onProfileChange(next)
            }}
            title="Click to change creator profile (re-analyses current file)"
            aria-label={`Active profile: ${PROFILE_CONFIGS[profile].label}. Click to change.`}
            data-testid="profile-badge"
          >
            {PROFILE_CONFIGS[profile].label}
          </button>
        </div>
        <div className="Header__bpmGroup">
          <label htmlFor="bpm-input" className="Header__bpmLabel">
            BPM
          </label>
          <input
            id="bpm-input"
            type="number"
            className={`Header__bpmInput${bpmError ? ' Header__bpmInput--error' : ''}`}
            min="20"
            max="300"
            step="0.5"
            placeholder="—"
            value={bpmInputValue}
            onChange={e => setBpmInputValue(e.target.value)}
            onBlur={e => handleBpmCommit(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Enter') {
                handleBpmCommit((e.target as HTMLInputElement).value)
              }
            }}
            aria-label="Tempo in BPM"
            aria-describedby={bpmError ? 'bpm-error' : undefined}
          />
          {bpmError && (
            <span id="bpm-error" className="Header__bpmError" role="alert">
              {bpmError}
            </span>
          )}
        </div>
      </div>
    </header>
  )
}
