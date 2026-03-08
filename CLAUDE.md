# CLAUDE.md — Project Orientation

This file is the entry point for any coding agent working on this project. Read it fully before writing any code.

---

## What this project is

**vulpesetserpens** is a browser-only SPA that lets musicians upload audio samples and get back a ranked list of click-free loopable fragments. All processing runs in the browser — no backend, no server.

---

## Documentation map

Before implementing any feature, read the relevant documents in this order:

| What you need | Where to find it |
|---------------|-----------------|
| Why the project exists | `doc/business/Vision.md` |
| What the tool does and for whom | `doc/business/Mission.md` |
| Product and experience goals | `doc/business/Goal.md` |
| Iteration 1 scope (current) | `doc/business/Mission.md` |
| Iteration 2 scope | `doc/business/Mission-iteration-2.md` |
| Iteration 3 scope | `doc/business/Mission-iteration-3.md` |
| Binding technical decisions | `doc/implementation/architecture-decision-records/` |
| Feature specifications | `doc/implementation/system-use-cases/` |
| UI layout and design tokens | `doc/implementation/ui-layout-spec.md` |
| Testing strategy and enforcement | `doc/implementation/architecture-decision-records/adr-007-testing-strategy.md` |
| Project file structure | `doc/implementation/project-structure.md` |

---

## Architecture Decision Records (ADRs)

ADRs are **binding**. Do not contradict them without creating a superseding ADR first.

| ADR | Decision |
|-----|----------|
| ADR-001 | React 18 + TypeScript + Vite, pure SPA |
| ADR-002 | No backend — all processing in the browser |
| ADR-003 | Web Audio API for decode and DSP. No audio libraries. |
| ADR-004 | Loop detection: zero-crossing + slope + autocorrelation + energy scoring |
| ADR-005 | Plain CSS with custom properties. No Tailwind, no CSS-in-JS. |
| ADR-006 | 16-bit PCM WAV export with manual RIFF encoding + `smpl` chunk |
| ADR-007 | Vitest (unit) + Playwright (E2E). Enforced via Husky + GitHub Actions. |
| ADR-008 | Multi-arch container image (amd64 + arm64) published to ghcr.io |

---

## Definition of done

A feature is **not complete** until:

1. It works correctly in the browser
2. Every acceptance criterion in the use case document has a passing automated test
3. Unit test coverage on `src/audio/` is ≥ 80%
4. The CI pipeline passes on the feature branch

**Tests are not a separate phase.** Write them alongside the implementation.

---

## Key constraints

- **No `any` in TypeScript** without an explicit comment explaining why
- **No hardcoded colour values or magic numbers** in CSS — use tokens from `src/styles/theme.css`
- **No new npm dependencies** without justification — prefer native browser APIs
- **Web Audio API is not available in Node/jsdom** — test browser behaviour with Playwright, not Vitest
- **The loop detection algorithm runs in a Web Worker** (`src/worker/analysisWorker.ts`) — it has no DOM access
- **`AudioBuffer` cannot be transferred to a Worker** — extract `Float32Array` channel data first and transfer those

---

## File placement rules

See `doc/implementation/project-structure.md` for the full tree. Key rules:

- Audio DSP logic → `src/audio/`
- Web Worker → `src/worker/`
- React components → `src/components/`
- CSS tokens → `src/styles/theme.css`
- Global styles → `src/styles/global.css`
- Unit tests → alongside source files as `*.test.ts`
- E2E tests → `tests/e2e/`
- Test fixtures → `tests/fixtures/`

---

## Running the project

```sh
npm install          # install dependencies
npm run dev          # start Vite dev server
npm run build        # production build
npm run test:unit    # Vitest unit tests
npm run test:e2e     # Playwright E2E tests (requires built app or dev server)
```
