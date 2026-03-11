# UC-005 — Export Loop

## Trigger

The user clicks the "Export" (or "Download") button associated with a specific loop candidate in the candidate list UI, or a global "Export Selected Loop" button when a candidate is already selected. For exporting multiple candidates at once, see UC-009.

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
5. Encode the loop `AudioBuffer` according to the selected export format and bit depth. The export format is chosen by the user via the format selector (WAV or AIFF); the bit depth is chosen via the bit-depth selector (16-bit or 24-bit, default 16-bit).

   **WAV path:**
   - WAV format: PCM, signed integer, little-endian. Bit depth is 16 or 24 as selected.
   - Build the WAV binary using the following structure:
     - RIFF header (12 bytes): `"RIFF"`, file size - 8 (uint32 LE), `"WAVE"`
     - `fmt ` chunk: chunk ID `"fmt "`, chunk size `16` (uint32 LE), audio format `1` (PCM, uint16 LE), num channels (uint16 LE), sample rate (uint32 LE), byte rate = `sampleRate * numChannels * bytesPerSample` (uint32 LE), block align = `numChannels * bytesPerSample` (uint16 LE), bits per sample (uint16 LE, 16 or 24)
     - `smpl` chunk (60 bytes for a single loop point): embed a WAV sampler chunk containing one loop point entry. Set `MIDIUnityNote` to 60 (middle C), `MIDIPitchFraction` to 0, `SamplePeriod` to `Math.round(1e9 / sampleRate)` nanoseconds, and write one `SampleLoop` record with `Identifier = 0`, `Type = 0` (forward loop), `Start = 0` (start of the data chunk), `End = loopLengthSamples - 1`, `Fraction = 0`, `PlayCount = 0` (infinite). The `smpl` chunk signals to DAWs and hardware samplers that this file is intended as a loop, and some will automatically configure their sampler engine accordingly.
     - `data` chunk: chunk ID `"data"`, data size = `loopLengthSamples * numChannels * bytesPerSample` (uint32 LE), then interleaved PCM samples. For 16-bit: convert float `s` via `Math.max(-32768, Math.min(32767, Math.round(s * 32767)))` and write as int16 LE. For 24-bit: convert via `Math.max(-8388608, Math.min(8388607, Math.round(s * 8388607)))` and write as 3-byte little-endian (least-significant byte first).
   - Assemble into a single `ArrayBuffer` and wrap in a `Blob` with MIME type `audio/wav`.

   **AIFF path:**
   - AIFF format: PCM, signed integer, big-endian. Bit depth is 16 or 24 as selected.
   - Build the AIFF binary using the following structure:
     - FORM header (12 bytes): `"FORM"`, file size - 8 (uint32 BE), `"AIFF"`
     - `COMM` chunk (26 bytes): chunk ID `"COMM"`, chunk size `18` (uint32 BE), num channels (int16 BE), num sample frames (uint32 BE), bit depth (int16 BE, 16 or 24), sample rate as 80-bit IEEE 754 extended (10 bytes big-endian)
     - `MARK` chunk: embed two markers — one at sample frame 0 (`MARK_ID = 1`, name `"start"`) and one at sample frame `loopLengthSamples - 1` (`MARK_ID = 2`, name `"end"`). The marker chunk signals loop point positions.
     - `INST` chunk (20 bytes): embed an AIFF instrument chunk. Set `sustainLoop.playMode = 1` (forward loop), `sustainLoop.beginLoop = 1` (MARK_ID of start marker), `sustainLoop.endLoop = 2` (MARK_ID of end marker). This is the AIFF equivalent of the WAV `smpl` chunk and is recognized by Logic Pro's Quick Sampler, Kontakt, and other AIFF-aware samplers.
     - `SSND` chunk: chunk ID `"SSND"`, chunk size = `loopLengthSamples * numChannels * bytesPerSample + 8` (uint32 BE), offset `0` (uint32 BE), blockSize `0` (uint32 BE), then interleaved PCM samples in big-endian order. For 16-bit: int16 BE. For 24-bit: 3-byte big-endian (most-significant byte first).
   - Assemble into a single `ArrayBuffer` and wrap in a `Blob` with MIME type `audio/aiff`.

> **Creator note:** The `smpl` chunk is a standard WAV metadata chunk used by hardware samplers (Roland, Akai, Korg), soft-synths (Kontakt, EXS24/Quick Sampler, HALion), and DAW samplers (Logic Pro's Quick Sampler, Ableton's Simpler) to identify a WAV file as a looping sample and set the loop point boundaries automatically. Without this chunk the exported file is just a trimmed audio file — the user must manually configure loop points in their sampler every time they import it. With the `smpl` chunk, drag-and-drop into a sampler "just works." This is one of the most impactful quality-of-life features for the target audience and costs only 60 extra bytes per file.
6. Trigger a browser download of the WAV blob:
   - Create an `<a>` element, set `a.href = URL.createObjectURL(blob)`.
   - Set `a.download` to a descriptive filename: `<original-filename-without-extension>_loop<rank>_<duration-rounded-to-ms>s.<ext>`, where `<ext>` is `wav` or `aif` based on the selected format. For example, if the original file is `my-sample.wav`, rank 1, duration 2.580 s, WAV format: `my-sample_loop1_2.580s.wav`. If a BPM is known (user-supplied or auto-detected via UC-006), append the bar count: `my-sample_loop1_2.580s_2bars.wav`. For AIFF: `my-sample_loop1_2.580s.aif`.

> **Creator note:** The original proposed filename pattern (`my-sample_loop_1_1240-3820ms.wav`) is not how producers name loop files. The start and end timestamps in milliseconds are meaningless to a creator who just wants to know "how long is this loop?" A filename like `my-sample_loop1_2.580s.wav` or (better) `my-sample_loop1_2bars_120bpm.wav` is instantly parseable at a glance in a file browser and matches how commercial sample packs are named. Avoid the start/end millisecond range in the filename — it adds visual noise without answering the question the creator actually has.
   - Programmatically click the `<a>` element.
   - After a tick (via `setTimeout(..., 0)`), call `URL.revokeObjectURL(a.href)` to release the object URL and avoid memory leaks.
7. Display a brief, non-blocking confirmation in the UI: "Loop exported: `<filename>`" (toast notification or status line). The confirmation disappears after 3 seconds.

## Alternate Flows

### AF-1: User clicks Export on multiple candidates in succession

Each export is independent. Each click triggers a new download. For batching multiple candidates in a single action, see UC-009. Each download produces a separate file with a unique filename reflecting that candidate's rank and duration.

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

### FC-3: Export file would exceed browser memory limits

- Detection: computed file size = `loopLengthSamples * numChannels * bytesPerSample + headerOverhead` (bytes) exceeds 200 MB.
- Response: display an error: "The loop region is too large to export (exceeds 200 MB). Try selecting a shorter region." Do not attempt to build the blob.
- Note: 200 MB at 44100 Hz stereo 24-bit corresponds to approximately 15 minutes of audio. In practice, loop regions should be well under this limit, but the guard must exist.

### FC-4: `URL.createObjectURL` is unavailable

- Detection: `typeof URL.createObjectURL !== 'function'`.
- Response: display a message: "Your browser does not support file downloads from this application. Please upgrade to a modern browser." Disable all export controls.

### FC-5: Sample value clipping during WAV encoding

- Detection: any source float sample has absolute value > 1.0 (this can occur if the `AudioBuffer` was produced by processing that introduced gain).
- Response: do not error. The clamping in Main Flow step 5 (`Math.max(-32768, Math.min(32767, ...))`) handles this silently. Optionally log a debug-level console warning if clipping is detected: "Warning: audio samples were clipped during WAV encoding."

## Acceptance Criteria

1. Clicking "Export" on a candidate causes a file download to be triggered by the browser within 2 seconds for loop regions up to 30 seconds in duration.
2. The exported WAV file is a valid PCM WAV file readable by at least the following: Audacity, GarageBand, Logic Pro, Ableton Live, and any standard WAV-compatible application.
3. The exported file contains exactly `endSample - startSample` sample frames (verifiable by inspecting the chunk size in a hex editor or audio analysis tool).
4. The sample rate in the file header matches the sample rate of the source `AudioBuffer`.
5. The channel count in the file header matches the channel count of the source `AudioBuffer`.
6. The filename of the downloaded file follows the pattern `<original-filename-without-extension>_loop<rank>_<durationSeconds>s.<ext>` (with BPM/bar annotation appended when a tempo reference is available; `<ext>` is `wav` or `aif`).
7. For a candidate with `crossfadeDuration > 0`, the last `crossfadeSamples` of the exported file are a linear blend of the end region and the start region (verifiable by reading the raw PCM samples of the file).
8. For a candidate with `crossfadeDuration === 0`, the exported PCM data is bit-identical to the corresponding subarray of the source `AudioBuffer` converted to integers at the selected bit depth.
9. Exporting does not interrupt or affect ongoing audio playback from UC-004.
10. After export, `URL.revokeObjectURL` is called and the object URL is no longer resolvable.
11. Clicking "Export" on two different candidates produces two separate downloaded files with different filenames.
12. When no candidate is selected and the global export button is present, the export button is in a visually disabled state and does not respond to clicks.
13. The exported WAV file contains a valid `smpl` chunk. When the file is imported into a WAV-compatible sampler (e.g., Kontakt, Logic Pro Quick Sampler), the sampler automatically detects and applies the loop point without manual configuration.
14. The `smpl` chunk's `Start` and `End` loop point values correspond to sample indices 0 and `loopLengthSamples - 1` respectively (relative to the start of the exported file's `data` chunk).
15. When bit depth is set to 24-bit and the source `AudioBuffer` contains non-zero 24-bit content, the exported WAV `fmt ` chunk reports 24 bits per sample and the `data` chunk size equals `loopLengthSamples * numChannels * 3`.
16. When bit depth is set to 24-bit, the encoded PCM values match `Math.round(s * 8388607)` clamped to [-8388608, 8388607], written as 3-byte little-endian integers in the WAV `data` chunk.
17. When AIFF format is selected, the downloaded file begins with the `FORM` header and `AIFF` type identifier (bytes `46 4F 52 4D` then ... `41 49 46 46`) and is parseable by Logic Pro and Audacity.
18. The exported AIFF file contains a valid `INST` chunk with `sustainLoop.playMode = 1` (forward loop) referencing the start and end markers, so that Logic Pro's Quick Sampler automatically configures the loop point on import.
19. The exported AIFF file's `COMM` chunk correctly reports bit depth (16 or 24), channel count, and sample count.
20. The filename extension for an AIFF export is `.aif`.
21. Switching between WAV and AIFF format does not require re-running loop detection.

## Test Coverage

### Unit (Vitest)
- AC-3: `encodeWAV(buffer, { bitDepth: 16 })` output `data` chunk size equals `loopLengthSamples * numChannels * 2` bytes for a synthetic mono buffer
- AC-4: `encodeWAV` writes the correct sample rate in the `fmt ` chunk (little-endian uint32 at byte offset 24)
- AC-5: `encodeWAV` writes the correct channel count in the `fmt ` chunk for a mono input and for a 2-channel input
- AC-7: for a candidate with `crossfadeDuration > 0`, the last `crossfadeSamples` of the returned PCM data are a linear blend of the end and start regions (computed from synthetic Float32Arrays with known values)
- AC-8: for a candidate with `crossfadeDuration === 0`, the exported PCM bytes are bit-identical to `Float32Array → int16` conversion of the source subarray
- AC-14: `encodeWAV` output contains a valid `smpl` chunk with `Start = 0` and `End = loopLengthSamples - 1`
- AC-6: filename-generation function produces `<base>_loop<rank>_<duration>s.wav` for WAV and `<base>_loop<rank>_<duration>s.aif` for AIFF, with bar annotation appended when BPM is provided
- AC-15: `encodeWAV(buffer, { bitDepth: 24 })` reports 24 in the `fmt ` chunk and `data` chunk size = `loopLengthSamples * numChannels * 3`
- AC-16: `encodeWAV(buffer, { bitDepth: 24 })` encodes sample value `1.0` as `0x7FFFFF` (8388607) in 3-byte LE
- AC-17: `encodeAIFF(buffer, { bitDepth: 16 })` output starts with bytes `46 4F 52 4D` (`FORM`) and contains `41 49 46 46` (`AIFF`) at byte 8
- AC-18: `encodeAIFF` output contains an `INST` chunk (`49 4E 53 54`) with `sustainLoop.playMode = 1`
- AC-19: `encodeAIFF` `COMM` chunk correctly encodes channel count and sample count
- AC-16 (24-bit AIFF): `encodeAIFF(buffer, { bitDepth: 24 })` encodes sample value `1.0` as `0x7FFFFF` in 3-byte BE

### E2E (Playwright)
- AC-1: clicking "Export" triggers a file download within 2 seconds for a loop region up to 30 seconds
- AC-2: the downloaded WAV file is parseable (RIFF header starts with `52 49 46 46`; `WAVE` at byte 8) — verified by reading download bytes in Playwright
- AC-6: the downloaded filename matches the expected pattern for the given candidate rank and duration
- AC-9: exporting while audio is playing (UC-004 active) does not interrupt playback — the "playing" indicator remains visible throughout the export
- AC-10: after export, attempting to fetch the object URL returns a network error (URL revoked)
- AC-11: clicking "Export" on two different candidates produces two separate downloaded files with different filenames
- AC-12: when no candidate is selected and a global export button is present, the button has a `disabled` attribute and does not trigger a download on click
- AC-13: the downloaded WAV file's binary content includes the 4-byte `smpl` chunk identifier (`73 6D 70 6C`) at the expected byte offset
- AC-17: switching the format selector to AIFF and clicking Export triggers a download whose first 4 bytes are `46 4F 52 4D` (`FORM`) and whose filename ends in `.aif`
- AC-15: switching to 24-bit and exporting produces a WAV whose `fmt ` chunk reports 24 bits per sample

## Notes / Constraints

- Encoding runs on the main thread (it is synchronous and fast for the expected loop durations of under 60 seconds). For very long loops (approaching the 200 MB limit), consider offloading to a Web Worker using a transferable `ArrayBuffer`.
- The WAV encoder must be implemented as a pure function: `encodeWAV(buffer: AudioBuffer, options: { bitDepth?: 16 | 24 }): Blob`. The AIFF encoder similarly: `encodeAIFF(buffer: AudioBuffer, options: { bitDepth?: 16 | 24 }): Blob`. Neither may have side effects or depend on application state.
- Use `DataView` to write the WAV header fields with correct endianness. Do not use string concatenation or `TextEncoder` for binary data. Multi-byte integer fields (sample rate, byte rate, data size) must be written as little-endian using `dataView.setUint32(offset, value, true)` (the `true` flag specifies little-endian).
- The PCM interleaving order for multi-channel audio must follow the WAV standard: for each sample frame, write channel 0 then channel 1 (and further channels if present) as consecutive 16-bit integers.
- The `new AudioBuffer(...)` constructor (used in step 3) requires a modern browser (Chrome 55+, Firefox 53+, Safari 14.1+). Do not use the deprecated `audioContext.createBuffer()` factory method for creating the loop buffer; prefer the constructor.
- The original file name (without extension) should be stored in application state during UC-001 step 7 as `originalFileName`. Strip the extension by removing everything after the last `.` in the filename. If the filename has no extension, use the full filename.
- Do not use the File System Access API (the `showSaveFilePicker` API) in v1. The `<a download>` approach is universally supported and does not require any permissions dialog.
- The `<a>` element used for the download trigger should not be appended to the DOM. Create it detached (`document.createElement('a')`), set its attributes, call `.click()`, and discard it.
- Float-to-int16 conversion must handle the case where `s * 32767` rounds to exactly `32768` (can happen for `s = 1.0` with some rounding modes): `Math.round(1.0 * 32767) = 32767`, which is safe. The clamp handles `-1.0 * 32768 = -32768` correctly. No special-casing is required beyond the clamp.
