# ADR-002 — No-Backend Architecture

**Date:** 2026-03-08
**Status:** Accepted

## Context

The application processes audio files uploaded by musicians. Audio files may contain personal field recordings, unreleased compositions, or commercially sensitive samples. Musicians have a reasonable expectation that files they load into a loop-finding tool do not leave their machine.

The project also has no budget for cloud infrastructure, no team to operate servers, and an explicit experience goal of working offline once the application is loaded (Goal E4). Any server-side component would create operational cost, latency, and a single point of failure that contradicts the product's core value proposition.

## Decision

The application has **no backend**. No server, no API endpoint, no cloud function, no database, no authentication service. Every operation — file reading, audio decoding, signal analysis, loop candidate ranking, waveform rendering, playback, and WAV export — runs entirely inside the user's browser.

The application is deployed as a **static asset bundle** (HTML, JS, CSS, and any static media). It can be hosted on any static file host (GitHub Pages, Netlify, a plain S3 bucket, or a local web server) with no server-side runtime.

## Rationale

**Privacy by architecture.** When audio never leaves the browser, there is nothing to intercept, log, or breach. This is a stronger privacy guarantee than any policy document: the server does not exist, so the data cannot be sent to it. This is especially important for users working with unreleased or commercially sensitive recordings.

**Zero operational overhead.** There is no server to provision, patch, scale, or monitor. There are no API keys to rotate, no databases to back up, no uptime SLAs to maintain. The project can be maintained by a single developer or a coding agent without infrastructure expertise.

**Offline capability.** Once the application bundle is cached by the browser (via standard HTTP caching or a Service Worker added in a future iteration), the tool works with no network connection at all. Musicians can use it in the studio, on a plane, or anywhere with no internet.

**Instant response.** There is no network round-trip for audio processing. Analysis latency is determined entirely by CPU speed, not bandwidth or server queue depth.

**Simplicity of deployment.** The entire application is a folder of static files. Deployment is a file copy. Rollback is a file copy. There are no environment variables, secrets, or container images to manage.

## Alternatives Considered

**Browser frontend + processing API (Node.js / Python backend)** — Offloading DSP to a server would allow more powerful algorithms (e.g., librosa-based analysis, ML models) and remove in-browser processing time constraints. This was rejected because it violates the privacy guarantee, introduces operational cost, requires authentication and rate-limiting to prevent abuse, and adds latency that contradicts the "drop to playback in under five seconds" experience goal. The required algorithms (zero-crossing analysis, autocorrelation, slope matching) are well within the capability of browser-side JavaScript.

**Electron (desktop app with Node.js backend)** — Electron would give access to native file system APIs and Node.js audio libraries, and would avoid the browser sandbox. It was rejected because it requires an installer, cannot be shared as a URL, cannot be used on a machine where the user lacks install privileges, and adds a large binary distribution problem. The application's goals are explicitly browser-native (Goal E4).

**WebAssembly module with a compiled C/C++ audio library** — A WASM module could provide near-native DSP performance. This was not rejected outright but is deferred: the native Web Audio API and JavaScript Float32Array manipulation are sufficient for v1's algorithm requirements (see ADR-003). If performance profiling reveals a bottleneck, a WASM module may be introduced under a future ADR without violating the no-backend constraint.

## Consequences

- No HTTP requests to any API are made at runtime. Any network request found in the codebase (outside of the initial page load) should be treated as an architectural violation.
- Audio files are read using the browser's `FileReader` API or by passing a `File` object directly to `AudioContext.decodeAudioData()`. Files are never uploaded to a URL.
- All intermediate data (decoded PCM samples, analysis results, loop candidate objects) lives in JavaScript memory for the lifetime of the browser session. There is no persistence. Refreshing the page resets all state.
- File size is practically limited by available browser memory. A reasonable v1 constraint is files up to approximately 100 MB (covering most sample and loop use cases). Files larger than this may cause tab crashes on memory-constrained devices. This limit should be documented in the UI.
- Processing time for analysis is bounded by the user's CPU. Long analysis runs (e.g., a 10-minute field recording) must not block the main thread. Compute-intensive operations must run in a Web Worker (see ADR-004).
- The application may be deployed to any static host. The build output must not assume a specific host URL, path prefix, or server behaviour. All asset references must be relative or correctly configured via Vite's `base` option.
- No cookies, no local storage, no IndexedDB are used in v1. Session state is ephemeral.
