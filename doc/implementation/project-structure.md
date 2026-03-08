# Project Structure

This document defines the canonical file and directory layout for the implementation. Coding agents must place new files according to this structure. Do not create directories not listed here without updating this document.

---

## Top-level layout

```
vulpesetserpens/
├── CLAUDE.md                        # Agent orientation — read first
├── Dockerfile                       # Multi-stage build (node → nginx)
├── nginx.conf                       # SPA routing + security headers
├── index.html                       # Vite entry point
├── package.json
├── tsconfig.json
├── vite.config.ts
├── vitest.config.ts                 # Unit test configuration
├── playwright.config.ts             # E2E test configuration
│
├── src/                             # Application source
├── tests/                           # Test suite
├── scripts/                         # Developer tooling scripts
├── .github/                         # CI/CD workflows
└── doc/                             # Project documentation
```

---

## `src/` — Application source

```
src/
├── main.tsx                         # React root — mounts <App />
├── App.tsx                          # Root component, top-level state
├── types.ts                         # Shared TypeScript types (LoopCandidate, AudioFile, etc.)
│
├── audio/                           # Pure audio DSP functions (no DOM, no React)
│   ├── mixToMono.ts                 # Mix multi-channel AudioBuffer to Float32Array
│   ├── zeroCrossings.ts             # Upward/downward zero-crossing detection
│   ├── autocorrelation.ts           # Normalized autocorrelation for period estimation
│   ├── scoreCandidate.ts            # S_shape, S_slope, S_period, S_energy computation
│   ├── detectLoops.ts               # Orchestrates the full detection pipeline (UC-003)
│   └── encodeWav.ts                 # RIFF WAV encoder with smpl chunk (UC-005, ADR-006)
│
├── worker/
│   └── analysisWorker.ts            # Web Worker — runs detectLoops, posts results
│
├── components/
│   ├── DropZone/
│   │   ├── DropZone.tsx             # UC-001 — drag-drop / file picker
│   │   └── DropZone.css
│   ├── Waveform/
│   │   ├── WaveformCanvas.tsx       # UC-002 — canvas rendering, UC-007 drag interaction
│   │   ├── WaveformCanvas.css
│   │   └── TimeRuler.tsx            # Timecode labels below the canvas
│   ├── Header/
│   │   ├── Header.tsx               # App name, file info, BPM input (UC-006)
│   │   └── Header.css
│   ├── CandidateCard/
│   │   ├── CandidateCard.tsx        # UC-004 play/stop, UC-005 export, UC-007 nudge
│   │   └── CandidateCard.css
│   ├── CandidateList/
│   │   ├── CandidateList.tsx        # Horizontal scrolling card row
│   │   └── CandidateList.css
│   └── AnalysisProgress/
│       ├── AnalysisProgress.tsx     # Analyzing state — progress messages
│       └── AnalysisProgress.css
│
├── hooks/
│   ├── useAudioPlayer.ts            # Web Audio API playback controller (UC-004)
│   ├── useAnalysisWorker.ts         # Worker lifecycle, message handling
│   └── useKeyboardShortcuts.ts      # Global keyboard bindings (Space, arrows, 1-9)
│
└── styles/
    ├── theme.css                    # All CSS custom properties / design tokens
    └── global.css                   # Reset, base typography, body styles
```

### Naming rules for `src/`

- **Components**: PascalCase directory and file name, co-located `.css` file
- **Audio modules**: camelCase, no framework imports, no DOM access
- **Hooks**: camelCase, prefix `use`
- **Types**: defined in `src/types.ts` unless tightly scoped to one module

---

## `tests/` — Test suite

```
tests/
├── fixtures/                        # WAV files for tests and algorithm calibration
│   ├── SOURCES.md                   # License provenance — update when adding any file
│   ├── sine-440hz-2s.wav            # Synthetic — standard upload/decode test
│   ├── sine-220hz-4s.wav            # Synthetic — loop detection, multiple candidate pairs
│   ├── noise-1s.wav                 # Synthetic — edge case: low-quality candidates
│   ├── stereo-sine-2s.wav           # Synthetic — stereo decode / mono downmix
│   ├── silent-0.3s.wav              # Synthetic — file too short edge case
│   ├── dc-offset-2s.wav             # Synthetic — no zero-crossings edge case
│   └── rw-*.wav                     # Real-world CC0/CC-BY samples (see SOURCES.md)
│
└── e2e/                             # Playwright E2E tests
    ├── uc-001-upload.spec.ts
    ├── uc-002-waveform.spec.ts
    ├── uc-003-detection.spec.ts
    ├── uc-004-audition.spec.ts
    ├── uc-005-export.spec.ts
    ├── uc-006-bpm.spec.ts
    └── uc-007-adjust.spec.ts
```

Unit tests (Vitest) live **alongside their source files**:

```
src/audio/mixToMono.ts
src/audio/mixToMono.test.ts          # ← co-located unit test
src/audio/encodeWav.ts
src/audio/encodeWav.test.ts
```

---

## `scripts/` — Developer tooling

```
scripts/
└── generate-fixtures.ts             # Generates tests/fixtures/*.wav programmatically
```

Run once after cloning: `npx tsx scripts/generate-fixtures.ts`

---

## `.github/` — CI/CD

```
.github/
└── workflows/
    ├── ci.yml                       # Test + build on every push/PR (ADR-007)
    └── release.yml                  # Test + build + publish container image (ADR-008)
```

---

## `doc/` — Documentation (do not put source code here)

```
doc/
├── business/
│   ├── Vision.md
│   ├── Mission.md
│   ├── Goal.md
│   ├── Mission-iteration-2.md
│   └── Mission-iteration-3.md
│
└── implementation/
    ├── ui-layout-spec.md
    ├── project-structure.md         # ← this file
    ├── musician-review.md
    ├── system-use-cases/
    │   ├── README.md
    │   ├── uc-001-upload-audio-file.md
    │   ├── uc-002-visualize-waveform.md
    │   ├── uc-003-detect-loop-candidates.md
    │   ├── uc-004-audition-loop.md
    │   ├── uc-005-export-loop.md
    │   ├── uc-006-set-tempo-reference.md
    │   └── uc-007-adjust-loop-points-manually.md
    └── architecture-decision-records/
        ├── README.md
        ├── adr-001-frontend-framework.md
        ├── adr-002-no-backend-architecture.md
        ├── adr-003-audio-decoding-and-processing.md
        ├── adr-004-loop-detection-algorithm.md
        ├── adr-005-styling-approach.md
        ├── adr-006-audio-export-format.md
        ├── adr-007-testing-strategy.md
        └── adr-008-containerization-and-deployment.md
```
