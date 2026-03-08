# ADR-001 — Frontend Framework and Build Tool

**Date:** 2026-03-08
**Status:** Accepted

## Context

The application is a pure browser-side tool: no server rendering, no backend, no login. It needs to manage non-trivial UI state — file upload, async audio decoding progress, a ranked list of loop candidates, waveform visualization, and a playback transport — while remaining a single deployable artifact. The build toolchain must support TypeScript, hot-module replacement for fast iteration, and produce a small, optimised output bundle.

The audience for the codebase includes coding agents as well as human contributors. Framework choice affects how readily any agent can read, extend, and reason about the code without requiring specialised knowledge.

## Decision

Use **React 18** as the UI framework, **TypeScript** as the language, and **Vite** as the build tool.

The application is a **pure Single-Page Application (SPA)**. No Server-Side Rendering (SSR), no static site generation. The entire app is served as a single `index.html` + bundled assets and runs entirely in the browser.

## Rationale

**React 18** provides a component model that maps cleanly onto the discrete UI regions of this application (file drop zone, waveform canvas, candidate list, transport controls). Its unidirectional data flow makes state changes from async audio processing predictable and traceable. React's hook model (`useState`, `useEffect`, `useRef`, `useCallback`) is sufficient for all state management needs; no additional state management library is required. React 18's concurrent features (`startTransition`) allow the UI to remain responsive while analysis results are committed incrementally.

React has the broadest documentation coverage, the largest pool of Stack Overflow answers, and the highest familiarity among code-generation models. This is a practical advantage when coding agents are doing the bulk of the implementation.

**TypeScript** catches interface mismatches between the audio processing layer (which works with raw `Float32Array` buffers) and the UI layer early, before runtime. Given that audio DSP bugs are often silent (the output compiles and runs but produces wrong numerical results), static types on buffer lengths, sample rates, channel counts, and loop point indices provide a meaningful safety net.

**Vite** offers near-instant cold starts and hot-module replacement with no configuration required for a React + TypeScript project. Its build output uses Rollup under the hood, producing well-optimised, tree-shaken bundles. Vite's defaults handle the asset pipeline (CSS, SVG, static files) without ceremony.

No SSR is needed. The application has no SEO requirements, no initial data to hydrate from a server, and no multi-page routing. Introducing SSR would add operational complexity (a Node.js server or edge runtime) that directly contradicts the no-backend architecture (see ADR-002).

## Alternatives Considered

**Vue 3 + Vite** — Vue 3 with the Composition API is a legitimate alternative and shares Vite as a build tool. It was rejected primarily on the basis of ecosystem reach: React's dominance in code-generation model training data makes agent-assisted development more reliable. Vue's template syntax also adds a compilation step that introduces a subtle conceptual layer between the component definition and the JavaScript output, which reduces transparency when reasoning about the code.

**Svelte / SvelteKit** — Svelte compiles components to vanilla JS with no runtime, which produces smaller bundles. It was rejected because its reactive model — while elegant — is less familiar to coding agents, and its conventions are more implicit (reactivity by assignment) in ways that increase the chance of subtle bugs in complex async flows. SvelteKit adds SSR/routing infrastructure that is unnecessary for this project.

**Vanilla TypeScript (no framework)** — A no-framework approach minimises bundle size and avoids framework churn. It was rejected because the application's state surface (async decode progress, ranked candidates, playback state, selected candidate, export status) is complex enough that hand-rolled DOM manipulation or a minimal reactive utility would recreate a subset of React's functionality with less clarity and more maintenance overhead.

## Consequences

- All components are written as React functional components with hooks. Class components are not used.
- The project is bootstrapped with `npm create vite@latest` using the `react-ts` template. No custom Webpack or Rollup configuration is added unless a concrete need arises.
- TypeScript strict mode (`"strict": true`) is enabled from the start. No `any` types without an explicit comment explaining why.
- No additional state management library (Redux, Zustand, Jotai, MobX) is introduced unless a future ADR justifies one. React's built-in `useState`, `useReducer`, and `useContext` are the only state primitives.
- No SSR, no file-based routing framework (no Next.js, no Remix). React Router may be added if multi-page navigation is needed, but v1 is a single view.
- Bundle size is a concern because all audio processing runs in the browser. Every dependency added to the project must be justified by a concrete need. Prefer native browser APIs over npm packages wherever possible.
