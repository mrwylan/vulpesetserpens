# ADR-003 — Audio Decoding and Processing via Web Audio API

**Date:** 2026-03-08
**Status:** Accepted

## Context

The core function of the application is audio analysis. The implementation must decode audio files (WAV, AIFF, MP3, OGG, and ideally FLAC) into raw PCM sample data, then apply DSP operations (zero-crossing detection, slope computation, autocorrelation) over those samples. It must also play back loop candidates in real time, seamlessly.

The choice of how to perform decoding and processing has direct consequences for bundle size, browser compatibility, performance, and the complexity of the implementation. Given the no-backend architecture (ADR-002) and the goal of minimal dependencies (ADR-001), third-party audio libraries must clear a high bar to justify inclusion.

## Decision

Use the browser's **native Web Audio API** exclusively for audio decoding and playback. Use **`Float32Array` manipulation in plain JavaScript** for all DSP operations (zero-crossing detection, slope analysis, autocorrelation). No third-party audio library is introduced.

Specifically:

- **Decoding:** `AudioContext.decodeAudioData(arrayBuffer)` is used to decode the uploaded file. The browser's native codec support handles WAV, MP3, OGG, and (in most browsers) FLAC without any additional decoder.
- **Sample access:** The decoded `AudioBuffer` exposes channel data as `Float32Array` via `audioBuffer.getChannelData(channelIndex)`. All analysis operates directly on these arrays.
- **Playback:** Loop candidates are played back by creating an `AudioBufferSourceNode`, setting its `loopStart`, `loopEnd`, and `loop` properties, and connecting it to the `AudioContext.destination`. This provides click-free seamless looping using the browser's own sample-accurate scheduling.
- **DSP:** All signal analysis — zero-crossing detection, slope calculation, autocorrelation — is implemented as plain JavaScript functions operating on `Float32Array` slices. No WASM, no WebGL, no library.

## Rationale

**No additional payload.** The Web Audio API is built into every modern browser. Using it means zero bytes added to the application bundle for decoding or playback. Any third-party audio library that provides equivalent functionality (decode + play) would add tens to hundreds of kilobytes.

**Broad, stable browser support.** `AudioContext.decodeAudioData()` has been supported in Chrome, Firefox, Safari, and Edge for over a decade. Its API is stable. There are no known compatibility issues for the file formats this application targets (WAV, MP3, OGG).

**Codec breadth for free.** The browser's built-in decoders leverage the platform's native codec support, including hardware-accelerated decoders on mobile and desktop. A JavaScript-based MP3 or OGG decoder would be both slower and larger.

**Sufficient for the required algorithms.** The DSP operations needed for loop detection (see ADR-004) — zero-crossing scan, slope sign comparison, autocorrelation over a sample window — are straightforward array traversals. They do not require specialised DSP primitives, FFT libraries, or matrix operations. Plain JavaScript loops over `Float32Array` are fast enough when executed off the main thread in a Web Worker.

**Transparency and maintainability.** A custom DSP implementation in plain TypeScript is fully readable and debuggable by any agent or contributor. A third-party library introduces an opaque API surface, version management overhead, and potential licensing constraints.

## Alternatives Considered

**Tone.js** — Tone.js is a high-level Web Audio wrapper providing scheduling, effects, and musical abstractions. It was rejected because it is a large dependency (tens of kilobytes gzipped) and provides abstractions at the wrong level: Tone.js targets music production applications with effects chains, not signal analysis tools. Its transport and scheduling model adds complexity irrelevant to this use case. The raw Web Audio API is both simpler and more appropriate.

**Wavesurfer.js** — Wavesurfer provides waveform rendering and a playback UI component. It was considered for the waveform visualisation feature but rejected because it couples rendering and playback into a single library component, preventing the fine-grained control over playback needed for seamless loop auditioning. It also adds a dependency that partially duplicates functionality provided natively. Waveform rendering will be implemented directly using the Canvas API (or SVG) over the raw sample data.

**Meyda (audio feature extraction library)** — Meyda provides spectral analysis features including RMS, ZCR, and spectral centroid computed via an FFT. It was considered for period estimation but rejected because autocorrelation-based period estimation on the raw time-domain signal is simpler, requires no FFT, and is sufficient for detecting musical repeat periods in loop candidates. Introducing Meyda would add a dependency for a single feature that can be implemented in under 50 lines of TypeScript.

**WebAssembly (compiled C++ audio library, e.g., libsndfile, SoundTouch)** — A WASM audio library would offer near-native performance for computationally intensive tasks. This is deferred, not rejected: if profiling on real audio samples reveals that the JavaScript autocorrelation or analysis loop is the bottleneck, a targeted WASM module may be introduced under a future ADR. For v1, WASM adds build complexity (toolchain, binary blob management) that is not justified by a measured need.

## Consequences

- All audio decoding goes through `AudioContext.decodeAudioData()`. No alternative decoding path is added.
- Decoded audio is always represented as one or more `Float32Array` channel buffers at the `AudioContext`'s sample rate. Analysis code receives these arrays directly; it does not work with compressed audio data.
- Supported input formats are whatever the user's browser supports. In practice this is WAV, AIFF, MP3, and OGG in all target browsers, plus FLAC in Chrome and Firefox. Safari's FLAC support should not be assumed. AIFF is natively supported by all major browsers via `decodeAudioData` and should be listed alongside WAV as a primary supported format, not as an afterthought. The UI must communicate format support clearly without hard-coding a format list that may differ by browser.

> **Musician note:** AIFF is the standard uncompressed audio format on macOS and is the default export from Logic Pro, GarageBand, and many hardware recorders. It is functionally identical to WAV for this tool's purposes (both are PCM containers). Omitting it from the format list silently excludes a large portion of Mac-based producers.
- Playback uses `AudioBufferSourceNode` with the loop properties set. The source node is reconstructed each time a new candidate is auditioned (source nodes are single-use).
- DSP functions must operate on `Float32Array` and return plain JavaScript numbers or arrays. They must not mutate the input buffer; the decoded `AudioBuffer` data is treated as immutable.
- All DSP computation runs in a Web Worker (see ADR-004) to keep the main thread free for UI updates. The `Float32Array` buffers are transferred (not copied) to the worker using `Transferable` semantics where possible.
- No audio processing is done on the server. Any code path that reads from or writes to a network socket is an architectural violation.
