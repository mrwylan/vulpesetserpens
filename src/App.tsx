import { useState, useRef, useCallback } from 'react'
import type { AppState, LoopCandidate, WaveformPeaks, CreatorProfile } from './types'
import { DropZone } from './components/DropZone/DropZone'
import { Header } from './components/Header/Header'
import { WaveformCanvas } from './components/Waveform/WaveformCanvas'
import { TimeRuler } from './components/Waveform/TimeRuler'
import { CandidateList } from './components/CandidateList/CandidateList'
import { AnalysisProgress } from './components/AnalysisProgress/AnalysisProgress'
import { useAnalysisWorker } from './hooks/useAnalysisWorker'
import { useAudioPlayer } from './hooks/useAudioPlayer'
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts'
import { encodeWav, applyCrossfade, generateExportFilename, downloadWav } from './audio/encodeWav'
import { computeBarAnnotation, PROFILE_CONFIGS } from './audio/detectLoops'
import { nudgeZeroCrossing } from './audio/zeroCrossings'
import './styles/theme.css'
import './styles/global.css'
import './App.css'

function extractPeaks(buffer: AudioBuffer): WaveformPeaks {
  // Mix to mono for peak extraction
  const numChannels = buffer.numberOfChannels
  const totalSamples = buffer.length

  // Target width: we'll use 800 as a reasonable default; canvas will handle scaling
  const targetWidth = 800
  const binSize = Math.max(1, Math.floor(totalSamples / targetWidth))
  const numBins = Math.ceil(totalSamples / binSize)

  const minPeaks = new Float32Array(numBins)
  const maxPeaks = new Float32Array(numBins)

  for (let bin = 0; bin < numBins; bin++) {
    const startSample = bin * binSize
    const endSample = Math.min(startSample + binSize, totalSamples)
    let minVal = Infinity
    let maxVal = -Infinity

    for (let s = startSample; s < endSample; s++) {
      let avg = 0
      for (let c = 0; c < numChannels; c++) {
        avg += buffer.getChannelData(c)[s]!
      }
      avg /= numChannels

      if (avg < minVal) minVal = avg
      if (avg > maxVal) maxVal = avg
    }

    minPeaks[bin] = minVal === Infinity ? 0 : minVal
    maxPeaks[bin] = maxVal === -Infinity ? 0 : maxVal
  }

  return { min: minPeaks, max: maxPeaks, binSize }
}

export default function App() {
  const [appState, setAppState] = useState<AppState>({ kind: 'empty' })
  const [selectedRank, setSelectedRank] = useState<number | null>(null)
  const [bpm, setBpm] = useState<number | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const [profile, setProfile] = useState<CreatorProfile>('musician')

  // Ref to keep the latest AudioBuffer for re-analysis on profile change
  const audioBufferRef = useRef<AudioBuffer | null>(null)

  const audioContextRef = useRef<AudioContext | null>(null)
  const { analyze, cancel: cancelWorker } = useAnalysisWorker()
  const { playerState, play, stop, updateLoopBoundaries, getPlayheadPosition, sourceNodeRef } = useAudioPlayer(audioContextRef)

  // Get or create AudioContext (only inside user gesture)
  const getAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- webkitAudioContext is legacy
      const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext
      audioContextRef.current = new AudioCtx()
    }
    return audioContextRef.current
  }, [])

  const handleFileSelected = useCallback(
    async (file: File) => {
      setUploadError(null)
      stop()
      cancelWorker()

      setAppState({
        kind: 'loading',
        fileName: file.name,
      })

      try {
        const ctx = getAudioContext()
        if (ctx.state === 'suspended') {
          await ctx.resume()
        }

        const arrayBuffer = await file.arrayBuffer()
        const audioBuffer = await ctx.decodeAudioData(arrayBuffer)
        audioBufferRef.current = audioBuffer

        const audioFile = {
          name: file.name,
          size: file.size,
          sampleRate: audioBuffer.sampleRate,
          numberOfChannels: audioBuffer.numberOfChannels,
          duration: audioBuffer.duration,
        }

        const peaks = extractPeaks(audioBuffer)

        setAppState({
          kind: 'analyzing',
          audioFile,
          buffer: audioBuffer,
          progressMessage: 'decoding…',
          waveformPeaks: peaks,
        })
        setSelectedRank(null)

        // Start analysis with profile-specific duration constraints
        const profileConfig = PROFILE_CONFIGS[profile]
        analyze(
          audioBuffer,
          {
            onProgress: (phase) => {
              const messages: Record<string, string> = {
                'mono mix': 'mixing to mono…',
                'zero-crossings': 'finding zero-crossings…',
                autocorrelation: 'estimating musical period…',
                scoring: 'scoring candidates…',
                complete: 'finalizing results…',
              }
              setAppState(prev => {
                if (prev.kind !== 'analyzing') return prev
                return {
                  ...prev,
                  progressMessage: messages[phase] ?? `${phase}…`,
                }
              })
            },
            onComplete: (candidates, upCrossings, reasonCode) => {
              let analysisWarning: string | undefined
              if (reasonCode === 'TOO_SHORT') {
                analysisWarning = 'Audio is too short for loop detection (minimum 20 ms).'
              } else if (reasonCode === 'NO_CROSSINGS') {
                analysisWarning = 'No zero-crossings found. The audio may be DC-offset or silent.'
              } else if (reasonCode === 'LOW_CONFIDENCE') {
                analysisWarning = 'No high-quality loop points found. Results shown are best available but may produce audible clicks.'
              }

              // Apply BPM annotations if set
              let annotatedCandidates = candidates
              if (bpm !== null) {
                annotatedCandidates = candidates.map(c => ({
                  ...c,
                  barAnnotation: computeBarAnnotation(c.duration, bpm),
                  approximateBars: c.duration / ((60 / bpm) * 4),
                }))
              }

              setAppState(prev => {
                if (prev.kind !== 'analyzing') return prev
                return {
                  kind: 'results',
                  audioFile: prev.audioFile,
                  buffer: prev.buffer,
                  waveformPeaks: peaks,
                  candidates: annotatedCandidates,
                  upCrossings,
                  analysisWarning,
                }
              })

              if (annotatedCandidates.length > 0) {
                setSelectedRank(1)
              }
            },
            onError: (message) => {
              setAppState(prev => {
                if (prev.kind !== 'analyzing') return prev
                return {
                  kind: 'results',
                  audioFile: prev.audioFile,
                  buffer: prev.buffer,
                  waveformPeaks: peaks,
                  candidates: [],
                  upCrossings: [],
                  analysisWarning: `Loop detection failed: ${message}`,
                }
              })
            },
          },
          {
            bpm: bpm ?? undefined,
            creatorProfile: profile,
            minDuration: profileConfig.minDuration,
            maxDuration: profileConfig.maxDuration,
          }
        )
      } catch (err) {
        setUploadError('Audio decoding failed. The file may be corrupted or use an unsupported codec.')
        console.error('decodeAudioData error:', err)
        setAppState({ kind: 'empty' })
      }
    },
    [stop, cancelWorker, getAudioContext, analyze, bpm, profile]
  )

  const handleClose = useCallback(() => {
    stop()
    cancelWorker()
    audioBufferRef.current = null
    setAppState({ kind: 'empty' })
    setSelectedRank(null)
    setUploadError(null)
  }, [stop, cancelWorker])

  /** Re-run analysis with a new profile. If no buffer is loaded, just update state. */
  const handleProfileChange = useCallback(
    (newProfile: CreatorProfile) => {
      setProfile(newProfile)
      const buffer = audioBufferRef.current
      if (!buffer) return

      stop()
      cancelWorker()
      setSelectedRank(null)

      const profileConfig = PROFILE_CONFIGS[newProfile]

      setAppState(prev => {
        if (prev.kind !== 'results' && prev.kind !== 'analyzing') return prev
        return {
          kind: 'analyzing',
          audioFile: prev.audioFile,
          buffer,
          progressMessage: 're-analysing…',
          waveformPeaks: prev.waveformPeaks ?? null,
        }
      })

      analyze(
        buffer,
        {
          onProgress: (phase) => {
            const messages: Record<string, string> = {
              'mono mix': 'mixing to mono…',
              'zero-crossings': 'finding zero-crossings…',
              autocorrelation: 'estimating musical period…',
              scoring: 'scoring candidates…',
              complete: 'finalizing results…',
            }
            setAppState(prev => {
              if (prev.kind !== 'analyzing') return prev
              return { ...prev, progressMessage: messages[phase] ?? `${phase}…` }
            })
          },
          onComplete: (candidates, upCrossings, reasonCode) => {
            let analysisWarning: string | undefined
            if (reasonCode === 'TOO_SHORT') {
              analysisWarning = 'Audio is too short for loop detection (minimum 20 ms).'
            } else if (reasonCode === 'NO_CROSSINGS') {
              analysisWarning = 'No zero-crossings found. The audio may be DC-offset or silent.'
            } else if (reasonCode === 'LOW_CONFIDENCE') {
              analysisWarning = 'No high-quality loop points found. Results shown are best available but may produce audible clicks.'
            }

            let annotatedCandidates = candidates
            if (bpm !== null) {
              annotatedCandidates = candidates.map(c => ({
                ...c,
                barAnnotation: computeBarAnnotation(c.duration, bpm),
                approximateBars: c.duration / ((60 / bpm) * 4),
              }))
            }

            setAppState(prev => {
              if (prev.kind !== 'analyzing') return prev
              return {
                kind: 'results',
                audioFile: prev.audioFile,
                buffer: prev.buffer,
                waveformPeaks: prev.waveformPeaks!,
                candidates: annotatedCandidates,
                upCrossings,
                analysisWarning,
              }
            })
            if (annotatedCandidates.length > 0) setSelectedRank(1)
          },
          onError: (message) => {
            setAppState(prev => {
              if (prev.kind !== 'analyzing') return prev
              return {
                kind: 'results',
                audioFile: prev.audioFile,
                buffer: prev.buffer,
                waveformPeaks: prev.waveformPeaks!,
                candidates: [],
                upCrossings: [],
                analysisWarning: `Loop detection failed: ${message}`,
              }
            })
          },
        },
        {
          bpm: bpm ?? undefined,
          creatorProfile: newProfile,
          minDuration: profileConfig.minDuration,
          maxDuration: profileConfig.maxDuration,
        }
      )
    },
    [stop, cancelWorker, analyze, bpm]
  )

  const handleBpmChange = useCallback(
    (newBpm: number | null) => {
      setBpm(newBpm)
      setAppState(prev => {
        if (prev.kind !== 'results') return prev
        const candidates = newBpm !== null
          ? prev.candidates.map(c => ({
              ...c,
              barAnnotation: computeBarAnnotation(c.duration, newBpm),
              approximateBars: c.duration / ((60 / newBpm) * 4),
            }))
          : prev.candidates.map(c => ({
              ...c,
              barAnnotation: undefined,
              approximateBars: undefined,
            }))
        return { ...prev, candidates }
      })
    },
    []
  )

  const handleExport = useCallback(
    (candidate: LoopCandidate) => {
      if (appState.kind !== 'results') return
      const { buffer, audioFile } = appState

      const { startSample, endSample } = candidate
      const loopLength = endSample - startSample
      if (loopLength <= 0) {
        console.warn('Invalid loop region for export')
        return
      }

      // Extract loop region per channel
      const channelData: Float32Array[] = []
      for (let c = 0; c < buffer.numberOfChannels; c++) {
        const loop = new Float32Array(buffer.getChannelData(c).subarray(startSample, endSample))
        channelData.push(loop)
      }

      // Apply crossfade if recommended
      if (candidate.crossfadeDuration > 0) {
        const crossfadeSamples = Math.round(candidate.crossfadeDuration * buffer.sampleRate)
        applyCrossfade(channelData, crossfadeSamples)
      }

      const wavBuffer = encodeWav(channelData, buffer.sampleRate, loopLength, candidate)

      const filename = generateExportFilename(
        audioFile.name,
        candidate.rank,
        candidate.duration,
        bpm ?? undefined,
        candidate.approximateBars !== undefined ? Math.round(candidate.approximateBars) : undefined
      )

      downloadWav(wavBuffer, filename)
    },
    [appState, bpm]
  )

  const handleCandidateUpdate = useCallback(
    (rank: number, newStart: number, newEnd: number) => {
      setAppState(prev => {
        if (prev.kind !== 'results') return prev
        const candidates = prev.candidates.map(c => {
          if (c.rank !== rank) return c
          const sampleRate = prev.buffer.sampleRate
          const startTime = newStart / sampleRate
          const endTime = newEnd / sampleRate
          const duration = endTime - startTime
          const updated: LoopCandidate = {
            ...c,
            startSample: newStart,
            endSample: newEnd,
            startTime,
            endTime,
            duration,
            userModified: true,
            originalStartSample: c.originalStartSample ?? c.startSample,
            originalEndSample: c.originalEndSample ?? c.endSample,
          }
          if (prev.audioFile && bpm !== null) {
            updated.barAnnotation = computeBarAnnotation(duration, bpm)
            updated.approximateBars = duration / ((60 / bpm) * 4)
          }
          return updated
        })
        return { ...prev, candidates }
      })

      // Update playing loop boundaries in real-time
      const ctx = audioContextRef.current
      if (ctx && sourceNodeRef.current) {
        updateLoopBoundaries(newStart, newEnd, ctx.sampleRate)
      }
    },
    [bpm, updateLoopBoundaries, sourceNodeRef]
  )

  const handleNudgeStart = useCallback(
    (rank: number, direction: 1 | -1) => {
      setAppState(prev => {
        if (prev.kind !== 'results') return prev
        const candidate = prev.candidates.find(c => c.rank === rank)
        if (!candidate) return prev
        const newStart = nudgeZeroCrossing(candidate.startSample, prev.upCrossings, direction)
        const sampleRate = prev.buffer.sampleRate
        const minSamples = Math.round(0.02 * sampleRate)  // 20 ms floor
        if (newStart >= candidate.endSample - minSamples) return prev

        const startTime = newStart / sampleRate
        const endTime = candidate.endSample / sampleRate
        const duration = endTime - startTime
        const candidates = prev.candidates.map(c =>
          c.rank !== rank ? c : {
            ...c,
            startSample: newStart,
            startTime,
            duration,
            userModified: true,
            originalStartSample: c.originalStartSample ?? c.startSample,
            originalEndSample: c.originalEndSample ?? c.endSample,
            ...(bpm !== null ? {
              barAnnotation: computeBarAnnotation(duration, bpm),
              approximateBars: duration / ((60 / bpm) * 4),
            } : {}),
          }
        )
        return { ...prev, candidates }
      })
    },
    [bpm]
  )

  const handleNudgeEnd = useCallback(
    (rank: number, direction: 1 | -1) => {
      setAppState(prev => {
        if (prev.kind !== 'results') return prev
        const candidate = prev.candidates.find(c => c.rank === rank)
        if (!candidate) return prev
        const newEnd = nudgeZeroCrossing(candidate.endSample, prev.upCrossings, direction)
        const sampleRate = prev.buffer.sampleRate
        const minSamples = Math.round(0.02 * sampleRate)  // 20 ms floor
        if (newEnd <= candidate.startSample + minSamples) return prev

        const startTime = candidate.startSample / sampleRate
        const endTime = newEnd / sampleRate
        const duration = endTime - startTime
        const candidates = prev.candidates.map(c =>
          c.rank !== rank ? c : {
            ...c,
            endSample: newEnd,
            endTime,
            duration,
            userModified: true,
            originalStartSample: c.originalStartSample ?? c.startSample,
            originalEndSample: c.originalEndSample ?? c.endSample,
            ...(bpm !== null ? {
              barAnnotation: computeBarAnnotation(duration, bpm),
              approximateBars: duration / ((60 / bpm) * 4),
            } : {}),
          }
        )
        return { ...prev, candidates }
      })
    },
    [bpm]
  )

  const handleReset = useCallback((rank: number) => {
    setAppState(prev => {
      if (prev.kind !== 'results') return prev
      const candidates = prev.candidates.map(c => {
        if (c.rank !== rank) return c
        const sampleRate = prev.buffer.sampleRate
        const startSample = c.originalStartSample ?? c.startSample
        const endSample = c.originalEndSample ?? c.endSample
        const startTime = startSample / sampleRate
        const endTime = endSample / sampleRate
        const duration = endTime - startTime
        return {
          ...c,
          startSample,
          endSample,
          startTime,
          endTime,
          duration,
          userModified: false,
          originalStartSample: undefined,
          originalEndSample: undefined,
          ...(bpm !== null ? {
            barAnnotation: computeBarAnnotation(duration, bpm),
            approximateBars: duration / ((60 / bpm) * 4),
          } : {}),
        }
      })
      return { ...prev, candidates }
    })
  }, [bpm])

  // Keyboard shortcuts
  const candidates = appState.kind === 'results' ? appState.candidates : []
  useKeyboardShortcuts({
    candidates,
    selectedRank,
    isPlaying: playerState.isPlaying,
    onPlay: (candidate) => {
      if (appState.kind === 'results') {
        play(appState.buffer, candidate)
      }
    },
    onStop: stop,
    onSelectCandidate: setSelectedRank,
  })

  // Compute playhead position for animation
  const playheadPos = playerState.isPlaying ? getPlayheadPosition() : null

  if (appState.kind === 'empty' || appState.kind === 'loading') {
    return (
      <DropZone
        onFileSelected={handleFileSelected}
        profile={profile}
        onProfileChange={handleProfileChange}
        isLoading={appState.kind === 'loading'}
        errorMessage={uploadError}
        infoMessage={appState.kind === 'loading' ? `Loading: ${appState.fileName}` : null}
      />
    )
  }

  const { audioFile, buffer, waveformPeaks } = appState
  const resultCandidates = appState.kind === 'results' ? appState.candidates : []
  const upCrossings = appState.kind === 'results' ? appState.upCrossings : []
  const analysisWarning = appState.kind === 'results' ? appState.analysisWarning : undefined

  return (
    <div className="App">
      <Header
        audioFile={audioFile}
        bpm={bpm}
        profile={profile}
        onBpmChange={handleBpmChange}
        onProfileChange={handleProfileChange}
        onClose={handleClose}
      />

      <main className="App__main">
        <div className="App__waveformRegion">
          <WaveformCanvas
            peaks={waveformPeaks}
            candidates={resultCandidates}
            selectedRank={selectedRank}
            playheadPosition={playheadPos}
            upCrossings={upCrossings}
            totalSamples={buffer.length}
            sampleRate={buffer.sampleRate}
            isAnalyzing={appState.kind === 'analyzing'}
            onCandidateUpdate={handleCandidateUpdate}
            onSelectCandidate={setSelectedRank}
          />
          <TimeRuler duration={audioFile.duration} />
        </div>

        {appState.kind === 'analyzing' && (
          <AnalysisProgress message={appState.progressMessage} />
        )}

        {appState.kind === 'results' && (
          <CandidateList
            candidates={resultCandidates}
            selectedRank={selectedRank}
            playingRank={playerState.playingRank}
            upCrossings={upCrossings}
            sampleRate={buffer.sampleRate}
            analysisWarning={analysisWarning}
            onPlay={(candidate) => play(buffer, candidate)}
            onStop={stop}
            onSelectCandidate={setSelectedRank}
            onExport={handleExport}
            onNudgeStart={handleNudgeStart}
            onNudgeEnd={handleNudgeEnd}
            onReset={handleReset}
          />
        )}
      </main>
    </div>
  )
}
