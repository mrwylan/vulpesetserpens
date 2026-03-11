import type { CreatorProfile } from '../../types'
import { PROFILE_CONFIGS } from '../../audio/detectLoops'
import './ProfileSelector.css'

interface ProfileSelectorProps {
  selected: CreatorProfile
  onChange: (profile: CreatorProfile) => void
}

const PROFILES: CreatorProfile[] = ['sound-designer', 'musician', 'producer']

export function ProfileSelector({ selected, onChange }: ProfileSelectorProps) {
  return (
    <div className="ProfileSelector" role="group" aria-label="Select your creator profile">
      <p className="ProfileSelector__label">I am a…</p>
      <div className="ProfileSelector__options">
        {PROFILES.map((profile) => {
          const config = PROFILE_CONFIGS[profile]
          const isActive = profile === selected
          return (
            <button
              key={profile}
              className={`ProfileSelector__option${isActive ? ' ProfileSelector__option--active' : ''}`}
              onClick={() => onChange(profile)}
              aria-pressed={isActive}
              data-profile={profile}
            >
              <span className="ProfileSelector__optionLabel">{config.label}</span>
              <span className="ProfileSelector__optionDesc">{config.description}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
