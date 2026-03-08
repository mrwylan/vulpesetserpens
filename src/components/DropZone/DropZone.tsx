import { useState, useRef, useCallback } from 'react'
import './DropZone.css'

const ACCEPTED_MIME_TYPES = new Set([
  'audio/wav',
  'audio/x-wav',
  'audio/aiff',
  'audio/x-aiff',
  'audio/mpeg',
  'audio/ogg',
  'audio/flac',
  'audio/x-flac',
  'audio/mp3',
])

const MAX_FILE_SIZE = 150 * 1024 * 1024 // 150 MB

export function validateAudioFile(file: File): string | null {
  if (file.size === 0) {
    return 'The selected file is empty and cannot be decoded.'
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum allowed size is 150 MB.`
  }
  // Check MIME type but don't hard-reject — let decodeAudioData be final arbiter
  const type = file.type.toLowerCase()
  if (type && !ACCEPTED_MIME_TYPES.has(type)) {
    // Check by extension as fallback
    const ext = file.name.split('.').pop()?.toLowerCase()
    const acceptedExts = new Set(['wav', 'aiff', 'aif', 'mp3', 'ogg', 'flac'])
    if (!acceptedExts.has(ext ?? '')) {
      return `Unsupported file format. Accepted formats: WAV, AIFF, MP3, OGG, FLAC.`
    }
  }
  return null
}

interface DropZoneProps {
  onFileSelected: (file: File) => void
  isLoading?: boolean
  errorMessage?: string | null
  infoMessage?: string | null
}

export function DropZone({ onFileSelected, isLoading, errorMessage, infoMessage }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false)
  const [localError, setLocalError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = useCallback(
    (file: File) => {
      setLocalError(null)
      const error = validateAudioFile(file)
      if (error) {
        setLocalError(error)
        return
      }
      onFileSelected(file)
    },
    [onFileSelected]
  )

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoading) setIsDragOver(true)
  }, [isLoading])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)

      if (isLoading) {
        setLocalError('Please wait — decoding in progress.')
        return
      }

      const files = e.dataTransfer.files
      if (files.length === 0) return

      const file = files[0]!

      if (files.length > 1) {
        setLocalError(null)
        // Non-blocking info: handled by UI info message below
      }

      handleFile(file)
    },
    [isLoading, handleFile]
  )

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = e.target.files
      if (!files || files.length === 0) return
      handleFile(files[0]!)
      // Reset input so same file can be reloaded
      e.target.value = ''
    },
    [handleFile]
  )

  const displayError = errorMessage ?? localError

  return (
    <div className="DropZone">
      <h1 className="DropZone__title">vulpesetserpens</h1>
      <p className="DropZone__tagline">find your perfect loop</p>

      <label
        className={`DropZone__target${isDragOver ? ' DropZone__target--drag-over' : ''}`}
        onDragOver={handleDragOver}
        onDragEnter={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        aria-label="Drop audio file here or click to browse"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            inputRef.current?.click()
          }
        }}
      >
        <span className="DropZone__icon" aria-hidden="true">↓</span>
        <span className="DropZone__label">
          {isDragOver ? 'release to load' : 'drop a sample here'}
        </span>
        <span className="DropZone__label--small DropZone__label">or click to browse</span>
        <span className="DropZone__formats">WAV · AIFF · MP3 · FLAC · OGG</span>
        <input
          ref={inputRef}
          type="file"
          accept=".wav,.aiff,.aif,.mp3,.ogg,.flac,audio/*"
          className="DropZone__hidden-input"
          onChange={handleInputChange}
          aria-hidden="true"
          tabIndex={-1}
        />
      </label>

      {displayError && (
        <p className="DropZone__error" role="alert">
          {displayError}
        </p>
      )}
      {infoMessage && !displayError && (
        <p className="DropZone__info">
          {infoMessage}
        </p>
      )}
    </div>
  )
}
