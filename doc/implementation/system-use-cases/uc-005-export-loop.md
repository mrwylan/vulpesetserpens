# UC-005 — Export Loop

## Trigger

The user clicks the "Export" (or "Download") button associated with a specific loop candidate in the candidate list UI, or a global "Export Selected Loop" button when a candidate is already selected.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- At least one loop candidate exists in the candidate list.
- The user has either explicitly selected a candidate (via UC-004's "Play" action or by clicking a "Select" control) or is clicking "Export" directly on a specific candidate row.
- The browser supports `AudioBuffer`, `OfflineAudioContext`, and either the File System Access API or `URL.createObjectURL()` with a synthetic `<a>` element for download triggering.

## Main Flow

1. The system identifies the target candidate: the candidate whose "Export" button was clicked, or the currently selected candidate if a global export button was used.
2. The system reads the candidate's `startSample` and `endSample` from application state.
3. The system creates a new `AudioBuffer` (the "loop buffer") containing only the loop region:
   - `loopLengthSamples = endSample - startSample`
   - Create a new `AudioBuffer` via `new AudioBuffer({ numberOfChannels: sourceBuffer.numberOfChannels, length: loopLengthSamples, sampleRate: sourceBuffer.sampleRate })`.
   - For each channel `c`, copy the relevant sample range: `loopBuffer.getChannelData(c).set( sourceBuffer.getChannelData(c).subarray(startSample, endSample) )`.
   - Note: this preserves the original channel count. A mono source exports as mono; a stereo source exports as stereo.
4. If the candidate's `crossfadeDuration > 0` (from UC-003's Phase 5), apply the crossfade to the loop buffer in-place:
   - The crossfade is applied as a linear blend at the very end of the loop buffer, where the last `crossfadeSamples = Math.round(crossfadeDuration * sampleRate)` of the buffer fade linearly from their original values toward the first `crossfadeSamples` values (the loop start). For each channel:
     ```
     for t in [0, crossfadeSamples):
       weight = t / crossfadeSamples          // 0 at start of fade, 1 at end
       idx_end = loopLengthSamples - crossfadeSamples + t
       data[idx_end] = data[idx_end] * (1 - weight) + data[t] * weight
     ```
   - This bakes the crossfade into the exported file so the loop is ready to use as a seamless looping sample in any DAW or sampler.
5. Encode the loop `AudioBuffer` as a WAV file in memory:
   - WAV format: PCM, 16-bit signed integer, little-endian. Sample rate and channel count taken from the loop buffer.
   - Build the WAV binary using the following structure:
     - RIFF header (12 bytes): `"RIFF"`, file size - 8 (uint32 LE), `"WAVE"`
     - `fmt ` chunk (24 bytes): chunk ID `"fmt "`, chunk size `16` (uint32 LE), audio format `1` (PCM, uint16 LE), num channels (uint16 LE), sample rate (uint32 LE), byte rate = `sampleRate * numChannels * 2` (uint32 LE), block align = `numChannels * 2` (uint16 LE), bits per sample `16` (uint16 LE)
     - `smpl` chunk (60 bytes for a single loop point): embed a WAV sampler chunk containing one loop point entry. Set `MIDIUnityNote` to 60 (middle C), `MIDIPitchFraction` to 0, `SamplePeriod` to `Math.round(1e9 / sampleRate)` nanoseconds, and write one `SampleLoop` record with `Identifier = 0`, `Type = 0` (forward loop), `Start = 0` (start of the data chunk), `End = loopLengthSamples - 1`, `Fraction = 0`, `PlayCount = 0` (infinite). The `smpl` chunk signals to DAWs and hardware samplers that this file is intended as a loop, and some will automatically configure their sampler engine accordingly.
     - `data` chunk: chunk ID `"data"`, data size = `loopLengthSamples * numChannels * 2` (uint32 LE), then interleaved 16-bit PCM samples: for each sample frame, write all channels in order. Convert float sample `s` in [-1.0, 1.0] to int16 via `Math.max(-32768, Math.min(32767, Math.round(s * 32767)))`.
   - Assemble the above into a single `ArrayBuffer` and wrap it in a `Blob` with MIME type `audio/wav`.

> **Musician note:** The `smpl` chunk is a standard WAV metadata chunk used by hardware samplers (Roland, Akai, Korg), soft-synths (Kontakt, EXS24/Quick Sampler, HALion), and DAW samplers (Logic Pro's Quick Sampler, Ableton's Simpler) to identify a WAV file as a looping sample and set the loop point boundaries automatically. Without this chunk the exported file is just a trimmed audio file — the user must manually configure loop points in their sampler every time they import it. With the `smpl` chunk, drag-and-drop into a sampler "just works." This is one of the most impactful quality-of-life features for the target audience and costs only 60 extra bytes per file.
6. Trigger a browser download of the WAV blob:
   - Create an `<a>` element, set `a.href = URL.createObjectURL(blob)`.
   - Set `a.download` to a descriptive filename: `<original-filename-without-extension>_loop<rank>_<duration-rounded-to-ms>s.wav`. For example, if the original file is `my-sample.wav`, rank 1, duration 2.580 s: `my-sample_loop1_2.580s.wav`. If a BPM is known (user-supplied via UC-006), append the bar count: `my-sample_loop1_2.580s_2bars.wav`.

> **Musician note:** The original proposed filename pattern (`my-sample_loop_1_1240-3820ms.wav`) is not how producers name loop files. The start and end timestamps in milliseconds are meaningless to a musician who just wants to know "how long is this loop?" A filename like `my-sample_loop1_2.580s.wav` or (better) `my-sample_loop1_2bars_120bpm.wav` is instantly parseable at a glance in a file browser and matches how commercial sample packs are named. Avoid the start/end millisecond range in the filename — it adds visual noise without answering the question the musician actually has.
   - Programmatically click the `<a>` element.
   - After a tick (via `setTimeout(..., 0)`), call `URL.revokeObjectURL(a.href)` to release the object URL and avoid memory leaks.
7. Display a brief, non-blocking confirmation in the UI: "Loop exported: `<filename>`" (toast notification or status line). The confirmation disappears after 3 seconds.

## Alternate Flows

### AF-1: User clicks Export on multiple candidates in succession

Each export is independent. Each click triggers a new download. The system does not batch or zip multiple exports. Each download produces a separate WAV file with a unique filename reflecting that candidate's rank and time range.

### AF-2: Candidate has `crossfadeDuration === 0`

Step 4 is skipped entirely. The exported file is a direct sample copy with no modifications. The resulting loop boundary in the file is a clean zero-crossing cut as determined by UC-003.

### AF-3: Source audio is stereo

Main Flow step 3 creates a 2-channel loop buffer and copies both channels. Main Flow step 5 writes interleaved stereo PCM (L sample, R sample, L sample, R sample, …). The exported WAV file is stereo.

### AF-4: Export while audio is playing (UC-004 active)

Export does not affect playback. The system reads from the stored `AudioBuffer` in application state, which is independent of any currently playing `AudioBufferSourceNode`. The user may export while listening.

## Failure / Error Cases

### FC-1: No candidate is selected and no specific candidate is targeted

- Detection: the global "Export Selected Loop" button is clicked but no candidate has been selected or played.
- Response: the export button is rendered as disabled (not clickable) when no candidate is selected. If the export is triggered programmatically without a selection, show an informational message: "Please select a loop candidate before exporting." Take no further action.

### FC-2: Loop region is zero-length or inverted

- Detection: `endSample <= startSample` for the target candidate.
- Response: display an error: "The selected loop region is invalid and cannot be exported." Log a warning. Do not attempt to create the WAV buffer.

### FC-3: WAV file would exceed browser memory limits

- Detection: computed WAV size = `loopLengthSamples * numChannels * 2 + 44` (bytes) exceeds 200 MB.
- Response: display an error: "The loop region is too large to export (exceeds 200 MB). Try selecting a shorter region." Do not attempt to build the blob.
- Note: 200 MB at 44100 Hz stereo 16-bit corresponds to approximately 23 minutes of audio. In practice, loop regions should be well under this limit, but the guard must exist.

### FC-4: `URL.createObjectURL` is unavailable

- Detection: `typeof URL.createObjectURL !== 'function'`.
- Response: display a message: "Your browser does not support file downloads from this application. Please upgrade to a modern browser." Disable all export controls.

### FC-5: Sample value clipping during WAV encoding

- Detection: any source float sample has absolute value > 1.0 (this can occur if the `AudioBuffer` was produced by processing that introduced gain).
- Response: do not error. The clamping in Main Flow step 5 (`Math.max(-32768, Math.min(32767, ...))`) handles this silently. Optionally log a debug-level console warning if clipping is detected: "Warning: audio samples were clipped during WAV encoding."

## Acceptance Criteria

1. Clicking "Export" on a candidate causes a WAV file to be downloaded by the browser within 2 seconds for loop regions up to 30 seconds in duration.
2. The exported WAV file is a valid PCM WAV file readable by at least the following: Audacity, GarageBand, Logic Pro, Ableton Live, and any standard WAV-compatible application.
3. The exported WAV file contains exactly `endSample - startSample` sample frames (verifiable by inspecting the `data` chunk size in a hex editor or audio analysis tool).
4. The sample rate in the WAV header matches the sample rate of the source `AudioBuffer`.
5. The channel count in the WAV header matches the channel count of the source `AudioBuffer`.
6. The filename of the downloaded file follows the pattern `<original-filename-without-extension>_loop<rank>_<durationSeconds>s.wav` (with BPM/bar annotation appended when a tempo reference is available).
7. For a candidate with `crossfadeDuration > 0`, the last `crossfadeSamples` of the exported file are a linear blend of the end region and the start region (verifiable by reading the raw PCM samples of the file).
8. For a candidate with `crossfadeDuration === 0`, the exported PCM data is bit-identical to the corresponding subarray of the source `AudioBuffer` converted to 16-bit integers.
9. Exporting does not interrupt or affect ongoing audio playback from UC-004.
10. After export, `URL.revokeObjectURL` is called and the object URL is no longer resolvable.
11. Clicking "Export" on two different candidates produces two separate downloaded files with different filenames.
12. When no candidate is selected and the global export button is present, the export button is in a visually disabled state and does not respond to clicks.
13. The exported WAV file contains a valid `smpl` chunk. When the file is imported into a WAV-compatible sampler (e.g., Kontakt, Logic Pro Quick Sampler), the sampler automatically detects and applies the loop point without manual configuration.
14. The `smpl` chunk's `Start` and `End` loop point values correspond to sample indices 0 and `loopLengthSamples - 1` respectively (relative to the start of the exported file's `data` chunk).

## Notes / Constraints

- WAV encoding runs on the main thread (it is synchronous and fast for the expected loop durations of under 60 seconds). For very long loops (approaching the 200 MB limit), consider offloading to a Web Worker using a transferable `ArrayBuffer`.

> **Musician note:** Many professional producers work at 24-bit or 32-bit float throughout their session and expect exported loops to preserve that resolution. 16-bit is fine for sample packs and legacy hardware samplers, but a modern Kontakt library or Ableton project running at 24-bit will incur unnecessary dithering noise when importing a 16-bit file. The encoder should be designed from the start to support multiple bit depths, even if v1 only ships 16-bit. The WAV encoder function signature should include a `bitDepth` parameter (defaulting to 16) so that adding 24-bit output in v2 is a matter of implementing one additional encoding branch, not a refactor. See ADR-006 for the decision rationale.
- The WAV encoder must be implemented as a pure function: `encodeWAV(audioBuffer: AudioBuffer): Blob`. It must not have side effects and must not depend on application state. This makes it independently testable.
- Use `DataView` to write the WAV header fields with correct endianness. Do not use string concatenation or `TextEncoder` for binary data. Multi-byte integer fields (sample rate, byte rate, data size) must be written as little-endian using `dataView.setUint32(offset, value, true)` (the `true` flag specifies little-endian).
- The PCM interleaving order for multi-channel audio must follow the WAV standard: for each sample frame, write channel 0 then channel 1 (and further channels if present) as consecutive 16-bit integers.
- The `new AudioBuffer(...)` constructor (used in step 3) requires a modern browser (Chrome 55+, Firefox 53+, Safari 14.1+). Do not use the deprecated `audioContext.createBuffer()` factory method for creating the loop buffer; prefer the constructor.
- The original file name (without extension) should be stored in application state during UC-001 step 7 as `originalFileName`. Strip the extension by removing everything after the last `.` in the filename. If the filename has no extension, use the full filename.
- Do not use the File System Access API (the `showSaveFilePicker` API) in v1. The `<a download>` approach is universally supported and does not require any permissions dialog.
- The `<a>` element used for the download trigger should not be appended to the DOM. Create it detached (`document.createElement('a')`), set its attributes, call `.click()`, and discard it.
- Float-to-int16 conversion must handle the case where `s * 32767` rounds to exactly `32768` (can happen for `s = 1.0` with some rounding modes): `Math.round(1.0 * 32767) = 32767`, which is safe. The clamp handles `-1.0 * 32768 = -32768` correctly. No special-casing is required beyond the clamp.
