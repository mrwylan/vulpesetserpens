# ADR-006 — Audio Export Format

**Date:** 2026-03-08
**Status:** Accepted

## Context

When the user selects a loop candidate and requests an export, the application must produce a downloadable audio file containing only the loop region, trimmed from the original sample. This file must be immediately usable in any DAW, hardware sampler, or software instrument without conversion. The export must be performed entirely in the browser (no server, per ADR-002), and must not require any third-party audio encoding library (per ADR-001's minimal dependency principle).

## Decision

Export the selected loop region as a **16-bit PCM WAV file** encoded entirely in the browser.

The WAV file is constructed by hand: a JavaScript function writes the RIFF/WAV header bytes followed by the interleaved 16-bit PCM sample data directly into an `ArrayBuffer`. No external WAV encoding library is used. The buffer is wrapped in a `Blob` with MIME type `audio/wav`, and the download is triggered by programmatically creating an `<a>` element with a `download` attribute pointing to an `URL.createObjectURL(blob)` URL, then simulating a click.

The exported file preserves the sample rate of the original decoded audio. Channel count matches the original (mono exports mono, stereo exports stereo). The loop region is the exact sample range `[startSample, endSample]` from the decoded `AudioBuffer`, with no additional processing unless the user has opted into a crossfade (see ADR-004).

## Rationale

**Universal DAW compatibility.** 16-bit PCM WAV is the most universally supported audio format across DAWs, hardware samplers, and software instruments. Every major DAW (Ableton Live, Logic Pro, Pro Tools, FL Studio, Bitwig, Reaper) and every hardware sampler from the 1990s onward can read a standard RIFF/WAV file with 16-bit PCM encoding. No conversion step is needed after export.

**Lossless.** 16-bit PCM is lossless at the chosen bit depth. The user receives the exact loop region they auditioned, with no lossy compression artifacts. At 44.1 kHz stereo, 16-bit PCM produces a bit-perfect representation of everything a standard audio interface captures. For the use case (samples and loops destined for a DAW project), 16-bit depth is standard and sufficient.

**No dependency.** The RIFF/WAV format is fully specified in a publicly available standard. The header structure is fixed and simple: a 44-byte header followed by raw interleaved sample data. Writing this header in JavaScript requires approximately 30 lines of code using `DataView`. This is far preferable to importing an npm package whose size, maintenance status, and licensing must be tracked.

**In-browser encoding is fast.** Converting `Float32Array` PCM data (which is what `AudioBuffer.getChannelData()` returns) to 16-bit integer PCM is a simple linear scaling operation: `Math.max(-32768, Math.min(32767, Math.round(sample * 32767)))`. For loop regions up to several minutes, this operation completes in milliseconds on modern hardware.

**Blob + anchor download is the standard browser download mechanism.** `URL.createObjectURL()` and the `download` attribute on an anchor element are the canonical, widely supported browser APIs for triggering a file save from JavaScript. This approach works in all target browsers without polyfills or special permissions.

## Alternatives Considered

**MP3 export** — MP3 is a lossy format. For a tool whose primary purpose is preparing sample material for music production, introducing lossy compression at the export stage would degrade the user's material. MP3 was rejected on quality grounds. Additionally, MP3 encoding in the browser requires a JavaScript encoder (e.g., lamejs), which adds a significant dependency and encoding overhead.

**OGG Vorbis export** — OGG is also lossy. Rejected for the same quality reasons as MP3. The MediaRecorder API can produce OGG in some browsers, but browser support for audio-only MediaRecorder is inconsistent and the output format is not universally supported in DAWs.

**24-bit or 32-bit float WAV** — Higher bit depth exports (24-bit integer or 32-bit float WAV) would preserve more dynamic range and avoid the quantisation step from Float32 to 16-bit integer. These were considered for a "high quality" export option but deferred to a future ADR. For v1, 16-bit is the industry-standard depth for sample content and is what the majority of hardware samplers and older DAW projects expect. 32-bit float WAV is less universally supported outside of high-end DAWs. If a future ADR adds bit-depth selection, the encoding function must be extended, not replaced.

> **Musician note:** 24-bit is the de facto standard in modern professional production — it is the default recording depth for virtually every audio interface and DAW project created in the last 15 years. While 16-bit is adequate for final delivery, it introduces unnecessary dithering noise when the source material was recorded or processed at 24-bit. The encoder should be designed with a `bitDepth` parameter from day one, even if only 16-bit ships in v1, so that adding 24-bit in v1.1 requires no architectural change.

**Using the MediaRecorder API or OfflineAudioContext for encoding** — `OfflineAudioContext` can render audio to an `AudioBuffer`, and `MediaRecorder` can capture audio streams. Neither provides a clean path to a downloadable WAV file: `OfflineAudioContext` renders to an `AudioBuffer` (still requiring manual encoding), and `MediaRecorder` produces a container format (WebM or OGG) determined by the browser, not the application. Manual RIFF/WAV construction is simpler, more predictable, and format-stable.

**A WAV encoding npm package (e.g., audiobuffer-to-wav, wav-encoder)** — Several small npm packages implement WAV encoding. They were rejected because the encoding task is simple enough (fixed-format header + sample loop) that a dependency is unnecessary overhead. The custom implementation is trivially auditable — its correctness can be verified against the RIFF/WAV specification in minutes.

## Consequences

- The WAV encoder is a single, pure TypeScript function with the signature `encodeWav(channelData: Float32Array[], sampleRate: number, bitDepth?: number): ArrayBuffer`. The `bitDepth` parameter defaults to 16 but is designed for extension to 24. It has no side effects and is fully unit-testable by comparing its output against a known-good WAV file.
- The exported WAV file includes a `smpl` chunk (WAV sampler metadata chunk) containing one loop point entry pointing to the full extent of the exported file (`Start = 0`, `End = loopLengthSamples - 1`). This enables hardware samplers, soft-synths, and DAW sampler instruments to auto-detect the loop configuration on import without manual setup by the musician.
- The output format is always 16-bit PCM WAV, RIFF (little-endian). Big-endian AIFF and RF64 (for files exceeding 4 GB) are out of scope.
- The maximum export file size is bounded by the maximum loop duration and sample rate. A 5-minute stereo loop at 44.1 kHz, 16-bit, produces approximately 52 MB — well within the range that `URL.createObjectURL()` and browser memory can handle.
- The download filename is derived from the original uploaded filename with a suffix indicating the loop index and time range (e.g., `breakbeat_loop-01_0.23s-2.87s.wav`). The filename is sanitised to remove characters that are invalid in file systems.
- After the download is triggered, the object URL must be released with `URL.revokeObjectURL()` to free browser memory. This must happen after the download has begun (use a short timeout or the `<a>` element's `click` event).
- The encoder function is located at `/src/audio/encodeWav.ts`. It is imported only by the export action handler in the UI layer. It must not be called from the analysis Web Worker (the worker's output is loop point indices; encoding happens on the main thread at export time).
- If the user's browser does not support `URL.createObjectURL()` (an extremely rare edge case in any browser released after 2012), the application must display an error message rather than failing silently.
