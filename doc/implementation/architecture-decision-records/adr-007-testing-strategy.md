# ADR-007 — Testing Strategy

**Date:** 2026-03-08
**Status:** Accepted

---

## Context

The application is a browser-only SPA with three distinct technical layers that have very different testing requirements:

1. **Pure computation** — loop detection algorithm, WAV encoder, zero-crossing detection, autocorrelation. These are side-effect-free TypeScript functions operating on typed arrays. They are fully testable in Node.
2. **Browser API integration** — `AudioContext`, `AudioBufferSourceNode`, `decodeAudioData`, Canvas 2D. These APIs do not exist in Node/jsdom, or exist only as stubs that do not reflect real behaviour. Testing them in jsdom gives false confidence.
3. **User flows** — file upload, waveform render, loop playback, export download. These require a real browser with a real DOM, real Web Audio API, and real file system interaction.

A testing strategy that ignores layer 2 and 3 will miss the bugs that matter most. A strategy that uses jsdom for browser APIs will produce tests that pass while the real application is broken.

Testing is not optional. Every use case has defined acceptance criteria. Those criteria are the specification for what must be covered by tests. A feature is not done until its acceptance criteria have passing tests.

---

## Decision

Use a two-layer testing stack:

- **Layer 1 — Unit tests: Vitest**
- **Layer 2 — End-to-end tests: Playwright**

No jsdom-based component testing. No testing library that stubs Web Audio API. If a behaviour requires a real browser to be meaningful, it is tested in Playwright, not Vitest.

---

## Layer 1 — Vitest (Unit Tests)

### Scope

All pure TypeScript functions that take inputs and return outputs with no side effects:

| Module | What to test |
|--------|-------------|
| `src/audio/loopDetection.ts` | Zero-crossing detection, slope sign matching, autocorrelation period estimation, composite score computation, candidate ranking and deduplication |
| `src/audio/encodeWav.ts` | RIFF header correctness, PCM data encoding (16-bit and 24-bit), `smpl` chunk byte layout, output `ArrayBuffer` length |
| `src/audio/mixToMono.ts` | Channel averaging, stereo → mono correctness |
| `src/audio/energyScore.ts` | RMS window computation, boundary energy comparison |
| Score weighting constants | That weights sum to 1.0 |

### What Vitest does NOT cover

- Any code that touches `AudioContext`, `AudioBuffer`, `AudioBufferSourceNode`
- Canvas rendering
- React component rendering
- File drag-and-drop

### Test fixture strategy

Synthetic audio data generated programmatically in test setup — never binary files checked into the repo:

```ts
// Example: generate a 440 Hz sine wave at 44100 Hz for 2 seconds
function syntheticSine(frequency: number, sampleRate: number, durationSeconds: number): Float32Array {
  const samples = new Float32Array(sampleRate * durationSeconds)
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin(2 * Math.PI * frequency * i / sampleRate)
  }
  return samples
}
```

Sine waves have known, mathematically predictable zero-crossings — ideal for asserting exact algorithm behaviour.

### Configuration

- Config file: `vitest.config.ts` at project root
- Environment: `node` (not jsdom — the tested modules do not touch the DOM)
- Coverage: `@vitest/coverage-v8`
- Coverage threshold: **80% line coverage** on all files under `src/audio/`
- Run command: `npm run test:unit`

---

## Layer 2 — Playwright (End-to-End Tests)

### Scope

Every use case (UC-001 through UC-007) must have at least one Playwright test that covers its primary acceptance criteria. Test names must reference the UC ID.

| Use Case | Key flows to cover |
|----------|--------------------|
| UC-001 | Drop a WAV file → app transitions to waveform view; drop unsupported format → error message shown |
| UC-002 | After upload, canvas element is visible and non-empty; waveform redraws on window resize |
| UC-003 | After upload, at least one loop candidate card appears; candidates are ranked (first has highest score) |
| UC-004 | Click Play on a candidate → playback starts; Space key toggles play/stop; Up/Down keys cycle candidates |
| UC-005 | Click Export → a `.wav` file is downloaded; downloaded file is a valid RIFF WAV with correct header |
| UC-006 | Enter a BPM value → candidate cards update to show bar/beat annotations |
| UC-007 | Drag a loop boundary marker → loop start/end time updates in the UI |

### Browser configuration

Tests run against Chromium only (the production target). No Firefox or WebKit in CI — this is a desktop-first tool and Chromium covers the primary user base.

Playwright must be launched with:

```ts
// playwright.config.ts
use: {
  launchOptions: {
    args: ['--autoplay-policy=no-user-gesture-required']
  }
}
```

This is required because Web Audio API playback is blocked by autoplay policy in headless Chromium without it.

### Test fixture strategy

A small set of synthetic WAV files generated once by a script (`scripts/generate-fixtures.ts`) and stored in `tests/fixtures/`. These files are committed to the repo. They must be small (< 50 KB each):

| Fixture | Description | Purpose |
|---------|-------------|---------|
| `sine-440hz-2s.wav` | 440 Hz sine, 44100 Hz, mono, 16-bit, 2 seconds | Standard upload / decode test |
| `sine-220hz-4s.wav` | 220 Hz sine, 44100 Hz, mono, 16-bit, 4 seconds | Loop detection (longer, multiple candidate pairs) |
| `noise-1s.wav` | White noise, 44100 Hz, mono, 16-bit, 1 second | Edge case: low-quality loop candidates |
| `stereo-sine-2s.wav` | 440 Hz sine, stereo (L/R identical), 44100 Hz, 16-bit, 2 seconds | Stereo decode and mono downmix |

Binary WAV fixtures are generated by the fixture script, not authored by hand. The script must be re-runnable and deterministic.

### Configuration

- Config file: `playwright.config.ts` at project root
- Test directory: `tests/e2e/`
- Dev server: Playwright starts the Vite dev server automatically before running tests (`webServer` config)
- Run command: `npm run test:e2e`

---

## Enforcement

### Local — pre-push hook (Husky)

Unit tests run automatically on every `git push` via a Husky pre-push hook. End-to-end tests are too slow for pre-push but must pass in CI.

```sh
# .husky/pre-push
npm run test:unit
```

A push that causes unit test failures is rejected. The developer must fix the tests before the push is accepted.

### CI — GitHub Actions

Both test layers run in CI on every push to any branch and on every pull request targeting `main`.

Pipeline stages (in order, defined in `.github/workflows/ci.yml`):
1. Run unit tests (`npm run test:unit`) — fail fast on any unit test failure
2. Build the application (`npm run build`) — fail fast on any TypeScript or build error
3. Run E2E tests (`npm run test:e2e`) — fail fast on any E2E failure

A PR may not be merged if any stage fails.

**This workflow covers testing and build validation only.** The container image build and publication to the registry is a separate concern handled by `.github/workflows/release.yml`. See ADR-008 for the full containerization and CD pipeline specification.

---

## Definition of Done

A use case is considered implemented and complete when:

1. The feature works correctly in the browser
2. All acceptance criteria from the use case document have a corresponding passing test (unit or E2E as appropriate)
3. Unit test coverage on `src/audio/` does not drop below 80%
4. CI pipeline passes on the feature branch

No exceptions. The test files for a use case are part of the same commit or PR as the implementation.

---

## Alternatives Considered

**Vitest + jsdom for everything**
Rejected. `AudioContext` in jsdom is either absent or a non-functional stub. Tests for playback and waveform rendering would pass regardless of whether the actual feature works. This produces false confidence and misses the most likely failure modes.

**Cypress instead of Playwright**
Rejected. Playwright has native support for file download testing (`page.waitForEvent('download')`), which is required for UC-005. Playwright's Web Audio API support in Chromium is more mature. Playwright is also faster in CI due to parallelisation. Both are valid choices; Playwright is the better fit for this application.

**Manual QA only**
Rejected. Manual QA does not scale across iterations and cannot be enforced in CI. The acceptance criteria in the use cases are specific enough to automate; not automating them wastes the investment made in writing them.

---

## Consequences

- A `vitest.config.ts` and `playwright.config.ts` must be created as part of the first implementation task
- A `scripts/generate-fixtures.ts` script must be created before any E2E tests are written
- Husky must be installed and configured in the project (`npm install --save-dev husky`)
- `.github/workflows/ci.yml` must be created before the first feature branch is merged to `main`
- Every coding agent working on this project must write tests alongside the feature code — tests are not a separate phase
- The `src/audio/` directory is the boundary for the 80% coverage threshold; UI components (React) are not subject to a coverage threshold but must be covered by E2E tests at the UC acceptance-criteria level
