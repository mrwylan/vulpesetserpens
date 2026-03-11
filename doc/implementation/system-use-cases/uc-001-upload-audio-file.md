# UC-001 — Upload Audio File

## Trigger

The user either:
- Drags one or more files from the operating system file manager and drops them onto the designated drop zone in the application UI, or
- Clicks the file-select control (a button or the drop zone itself) and picks a file from the native OS file picker dialog.

## Preconditions

- The application is loaded and in its initial "idle" state (no file currently loaded, or the user is replacing a previously loaded file).
- The browser supports the `File` API, the `FileReader` API, and `AudioContext.decodeAudioData()` (all modern evergreen browsers satisfy this).
- No audio is currently playing. If audio is playing, it must be stopped before a new file can be loaded (see Alternate Flows).

## Main Flow

1. The system registers a dragover event on the drop zone; it calls `event.preventDefault()` and applies a visual "drag-active" highlight state to the drop zone to signal readiness.
2. The user drops the file. The system reads `event.dataTransfer.files` and takes the first file in the list. If more than one file is dropped, the additional files are ignored and a non-blocking informational message is displayed: "Only one file can be loaded at a time. Loading: `<filename>`."

> **Creator note:** Silently ignoring extra dropped files is frustrating — a producer drags a folder or multi-selects by accident and has no idea what happened. A brief, friendly message confirming which file was picked avoids confusion without blocking the flow.
3. The system validates the file (see Failure / Error Cases for rejection conditions).
4. The system displays a loading/processing indicator and disables the drop zone to prevent concurrent uploads.
5. The system reads the file as an `ArrayBuffer` using `FileReader.readAsArrayBuffer()`.
6. The system calls `AudioContext.decodeAudioData(arrayBuffer)`, passing the raw bytes to the browser's native codec.
7. On successful decode, the system stores the resulting `AudioBuffer` in application state as the "current audio buffer". It also stores the file name and file size for display purposes.
8. The system dispatches an internal "audio-loaded" event (or equivalent state change) that triggers UC-002 (waveform visualization) and UC-003 (loop detection) in sequence.
9. The system removes the loading indicator and re-enables the drop zone. The file name is displayed in the UI as confirmation.

## Alternate Flows

### AF-1: File selected via the OS file picker

Steps 1–9 are identical except the file originates from `<input type="file">` change event (`event.target.files[0]`) rather than from `event.dataTransfer.files`.

### AF-2: User drops a file while another file is already loaded

1. The system stops any active audio playback (invokes the stop path from UC-004 if applicable).
2. The system clears all existing application state: the current `AudioBuffer`, waveform render data, loop candidate list, and any selected loop.
3. The system then proceeds from Main Flow step 3 as if loading fresh.

### AF-3: User drops a file while decoding is already in progress

The system rejects the new drop with an informational message ("Please wait — decoding in progress"). It does not cancel the in-progress decode. The drop zone remains in the disabled state.

## Failure / Error Cases

### FC-1: Unsupported file format

- Detection: the file's MIME type is not one of `audio/wav`, `audio/x-wav`, `audio/aiff`, `audio/x-aiff`, `audio/mpeg` (MP3), `audio/ogg`, `audio/flac`, `audio/x-flac`. Additionally, if `decodeAudioData` rejects its promise even though the MIME type was nominally acceptable, this is also treated as an unsupported format.
- Response: display a clearly worded error message identifying the file name and stating the accepted formats (WAV, AIFF, MP3, OGG, FLAC). The drop zone returns to the idle/ready state. No state is modified.

> **Creator note:** AIFF (Audio Interchange File Format) is a first-class citizen on macOS and is the default export format from Logic Pro, GarageBand, and many hardware recorders. Omitting AIFF from the accepted list would exclude a significant portion of Mac-based producers. AIFF and WAV are functionally equivalent for this tool's purposes — both are uncompressed PCM containers — and `decodeAudioData` handles AIFF natively in all major browsers.

### FC-2: File too large

- Detection: `file.size` exceeds 150 MB (157,286,400 bytes).
- Response: reject before reading the file. Display an error message stating the file size and the maximum permitted size. The drop zone returns to the idle/ready state.
- Rationale: decoding a very large file fully into an `AudioBuffer` allocates contiguous memory equal to `numChannels × numSamples × 4 bytes`. A 150 MB compressed MP3 could decode to several gigabytes of raw PCM, crashing the tab.

### FC-3: Empty file

- Detection: `file.size === 0`.
- Response: display "The selected file is empty and cannot be decoded." Drop zone returns to idle.

### FC-4: `decodeAudioData` failure

- Detection: the promise returned by `AudioContext.decodeAudioData()` rejects.
- Response: display an error message: "Audio decoding failed. The file may be corrupted or use an unsupported codec." Log the error to the browser console for debugging. Drop zone returns to idle. Do not leave the application in a partially loaded state.

### FC-5: File API not available (very old browser)

- Detection: `window.File` or `window.FileReader` or `window.AudioContext` (or `window.webkitAudioContext`) is `undefined` at application startup.
- Response: display a static banner at the top of the page stating that the browser is not supported and listing minimum supported browsers (Chrome 94+, Firefox 93+, Safari 15+, Edge 94+). The drop zone is rendered but disabled.

### FC-6: User cancels the file picker

- Detection: the `<input type="file">` change event fires with `event.target.files.length === 0`.
- Response: no-op. Application remains in its prior state.

## Acceptance Criteria

1. Dropping a valid WAV file onto the drop zone causes the application to reach the "audio-loaded" state within 5 seconds for files up to 50 MB on a modern desktop.
2. Dropping a valid AIFF, MP3, OGG, or FLAC file causes the same outcome as a WAV file (browser-native codec permitting).
3. Dropping a file with extension `.txt`, `.jpg`, `.pdf`, or any other non-audio MIME type causes an error message to appear and the drop zone to return to its ready state within 200 ms of the drop.
4. Dropping a file whose size exceeds 150 MB causes an error message to appear without any file reading occurring.
5. Clicking the file-select control and choosing a file produces the same result as drag-and-drop for all supported and unsupported file types.
6. After a successful load, the file name is visible in the UI.
7. While decoding is in progress, the drop zone rejects any further drops with an informational message.
8. Dropping a second valid file after a first is already loaded clears the previous state completely before loading the new file.
9. The application displays the drop zone in a visually distinct "drag-active" state while a file is being dragged over it, and reverts to the default state when the drag leaves or is cancelled.
10. If `decodeAudioData` rejects, the application shows an error message and does not attempt to proceed to waveform visualization or loop detection.

## Test Coverage

### Unit (Vitest)
- AC-3: pure MIME-type validation logic rejects non-audio types and accepts the supported set
- AC-4: file-size guard function returns an error result when `file.size > 157_286_400`
- AC-4: file-size guard function returns success for a file exactly at the 150 MB boundary

### E2E (Playwright)
- AC-1: drop a valid WAV fixture → app reaches "audio-loaded" state within 5 seconds
- AC-2: drop a valid AIFF/MP3/OGG/FLAC fixture → same "audio-loaded" outcome as WAV
- AC-3: drop a `.txt` file → error message appears and drop zone returns to ready state within 200 ms
- AC-4: attempt to drop a file reported as > 150 MB → error message appears before any file reading
- AC-5: select a file via the OS file picker → same result as drag-and-drop for a valid WAV
- AC-5: select an unsupported file via the file picker → same error as drag-and-drop for unsupported type
- AC-6: after successful load, the original filename is visible in the UI
- AC-7: while decoding is in progress, a second drop is rejected with an informational message
- AC-8: drop a second valid file after a first is loaded → previous state is cleared before new file loads
- AC-9: dragging a file over the drop zone applies a "drag-active" visual style; leaving or cancelling reverts it
- AC-10: simulate a `decodeAudioData` rejection → error message shown, waveform and loop detection not triggered

## Notes / Constraints

- The application must create a single shared `AudioContext` instance at startup and reuse it throughout the session. Do not create a new `AudioContext` per file load. Browser policy may suspend the context; call `audioContext.resume()` before decoding if `audioContext.state === 'suspended'`.
- Use the Promise-based overload of `decodeAudioData` (`audioContext.decodeAudioData(buffer).then(...).catch(...)`) rather than the callback-based form for cleaner error handling.
- The `AudioContext` must not be constructed before a user gesture (browser autoplay policy). Construct it on the first file selection/drop event if it has not yet been created.
- MIME type detection using only the file extension is unreliable; prefer `file.type` but also attempt to decode even if the MIME type is unexpected — let `decodeAudioData` be the final arbiter of decodability.
- All file handling is entirely client-side. No bytes are sent to any server.
- The loading indicator must be shown synchronously (before the async `readAsArrayBuffer` call begins) so the user receives immediate feedback.
- The decoded `AudioBuffer` is the authoritative representation of the audio throughout the session. It is immutable; no processing step modifies it in place. All derived data (waveform samples, loop regions) is computed from it without mutation.
