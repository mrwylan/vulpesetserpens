# UC-009 — Batch Export Loop Candidates

> **Creator note:** A producer who has identified 8 usable loops from a single sample should not have to click "Export" 8 times. Batch export collapses that work into one action. The result is either a ZIP archive containing all selected loop files, or sequential individual downloads. The filename convention from UC-005 applies to each file in the batch.

## Trigger

The user clicks a "Export All" (or "Export Selected") button in the candidate list toolbar, after at least one candidate is present. Alternatively, the user selects a subset of candidates using checkboxes and clicks "Export Selected".

## Preconditions

- A valid `AudioBuffer` is present in application state.
- At least one loop candidate exists in the candidate list.
- The export format (WAV or AIFF) and bit depth (16-bit or 24-bit) are already configured via the same selectors used by UC-005.

## Main Flow

1. The user clicks "Export All" (exports every candidate) or "Export Selected" (exports only checked candidates). If "Export Selected" is clicked and no candidates are checked, the button is disabled (see FC-1).
2. The system determines the set of candidates to export: all candidates if "Export All" was clicked, or the checked subset otherwise.
3. The system checks whether the `JSZip` API or a native `CompressionStream`-based ZIP implementation is available. If ZIP creation is possible, proceed with the ZIP path (steps 4–7). Otherwise, proceed with the sequential download fallback (steps 8–10).

   **ZIP path:**
4. For each candidate in the export set, encode the loop `AudioBuffer` slice as a WAV or AIFF file in memory, exactly as described in UC-005 Main Flow steps 3–5 (crossfade, encoding, format, bit depth).
5. Generate a filename for each encoded file using the same pattern as UC-005 step 6: `<base>_loop<rank>_<duration>s.<ext>`.
6. Add each encoded `ArrayBuffer` to a ZIP archive in memory. The ZIP archive filename is `<original-filename-without-extension>_loops.zip`.
7. Trigger a single browser download of the ZIP blob. Display a confirmation: "Exported `<N>` loops as `<archive-name>.zip`."

   **Sequential download fallback:**
8. For each candidate in the export set (in rank order), encode and trigger a download as described in UC-005 Main Flow steps 3–6, with a brief pause between triggers (one tick via `setTimeout(..., 0)`) to avoid browser blocking of multiple simultaneous downloads.
9. Display a progress indicator: "Exporting loop `<current>` of `<total>`…" that updates after each download is triggered.
10. After all downloads are triggered, display: "Exported `<N>` loops."

## Alternate Flows

### AF-1: Only one candidate in export set

Proceed as for multiple candidates. The result is a ZIP containing a single file (ZIP path) or a single download (sequential path). This is acceptable behaviour — the user may have deliberately selected one candidate via checkbox.

### AF-2: User cancels mid-export (sequential fallback)

The browser may block subsequent downloads in the sequence if they occur too quickly. The system handles this gracefully: each download is triggered with a tick delay and the progress indicator reflects which exports completed. There is no explicit cancel button for this iteration — cancellation is handled by the browser's own download manager.

### AF-3: Export format changed between exports

The format and bit depth selectors always reflect the current state. Whatever format is active when the batch export button is clicked is used for all files in the batch. There is no per-file format override.

### AF-4: Some candidates have `crossfadeDuration > 0`

Each candidate's crossfade setting from UC-003 Phase 5 is applied individually during encoding, exactly as in UC-005. Candidates with `crossfadeDuration === 0` are exported as clean cuts.

## Failure / Error Cases

### FC-1: No candidates selected when "Export Selected" is clicked

- Detection: the export set is empty (no checkboxes checked and "Export Selected" was used).
- Response: the "Export Selected" button is rendered as disabled when no candidates are checked. If triggered programmatically, display: "No loops selected for export." Take no further action.

### FC-2: ZIP encoding fails

- Detection: ZIP assembly throws an exception (e.g., out-of-memory during large batch).
- Response: fall back to sequential download path and inform the user: "ZIP creation failed — downloading files individually."

### FC-3: Total export size exceeds 200 MB

- Detection: sum of all encoded file sizes would exceed 200 MB.
- Response: display an error: "The selected loops total more than 200 MB and cannot be exported as a batch. Export them individually or select fewer loops." Do not proceed.

### FC-4: All downloads blocked by browser

- Detection: the sequential download path triggers no actual download (browser blocked all).
- Response: display: "Your browser blocked multiple simultaneous downloads. Please try exporting loops one at a time." Log a warning.

## Acceptance Criteria

1. Clicking "Export All" with 3 candidates present triggers either a single ZIP download or 3 sequential WAV/AIFF downloads, depending on ZIP availability.
2. Each file in the batch follows the filename convention: `<base>_loop<rank>_<duration>s.<ext>`.
3. A ZIP archive produced by batch export is a valid ZIP file, extractable by standard OS tools (Windows Explorer, macOS Archive Utility, unzip).
4. Each file within the ZIP is a valid WAV or AIFF file with correct header, `smpl`/`INST` loop chunk, and PCM data, identical to what UC-005 would produce for the same candidate.
5. The ZIP archive filename is `<original-filename-without-extension>_loops.zip`.
6. After batch export completes, a confirmation message shows the count of exported loops.
7. "Export Selected" is disabled when no candidates have checkboxes checked.
8. "Export Selected" with 2 of 5 candidates checked exports exactly those 2 candidates.
9. The selected format (WAV or AIFF) and bit depth (16-bit or 24-bit) apply to every file in the batch.
10. Batch export does not interrupt ongoing audio playback from UC-004.
11. For a batch where one candidate has `crossfadeDuration > 0`, that candidate's exported file includes the crossfade blend; other candidates' files are clean cuts.
12. If ZIP path is used, only one browser download dialog appears. If sequential path is used, one dialog appears per file.

## Test Coverage

### Unit (Vitest)
- AC-3: a ZIP blob produced by the batch encoding function is a valid ZIP (first 4 bytes are `50 4B 03 04`)
- AC-4: each entry in the produced ZIP has a filename matching the UC-005 pattern and its content parses as a valid WAV/AIFF header
- AC-5: the ZIP archive filename is derived correctly from the source filename
- AC-2: filename-generation function produces the correct pattern for each candidate rank and duration in a batch
- AC-8: batch encoding function with a subset of candidates produces exactly that number of encoded files
- AC-9: batch encoding with AIFF format produces `.aif` entries in the ZIP

### E2E (Playwright)
- AC-1: with 3 candidates present, clicking "Export All" triggers a download within 5 seconds; the downloaded file is either a ZIP or the first of 3 sequential WAV/AIFF files
- AC-3: if a ZIP is downloaded, its first 4 bytes are `50 4B 03 04`
- AC-6: after export completes, a confirmation message with the export count is visible in the UI
- AC-7: "Export Selected" button has `disabled` attribute when no checkboxes are checked
- AC-10: batch export triggered while audio is playing does not interrupt playback — the "playing" indicator remains visible

## Notes / Constraints

- ZIP creation without a library dependency: use the browser's native `CompressionStream` API with `deflate-raw` if available (Chrome 80+, Firefox 113+), or construct a Store-only (uncompressed) ZIP manually using the ZIP local file header format. A Store-only ZIP is smaller to implement, universally compatible, and adequate for audio files (which are already compressed). If `CompressionStream` is available, use deflate for smaller archives.
- Do not add an npm dependency on `jszip` or similar libraries — implement ZIP encoding as a pure function in `src/audio/encodeZip.ts` using the native browser APIs described above. See ADR-003 (no audio libraries) and the general principle of preferring native APIs.
- The batch export function signature: `encodeBatch(candidates: LoopCandidate[], sourceBuffer: AudioBuffer, options: BatchExportOptions): Promise<Blob>` where `BatchExportOptions = { format: 'wav' | 'aiff', bitDepth: 16 | 24, baseFileName: string }`. The returned `Blob` is either a ZIP or a single file if only one candidate is provided.
- The "Export All" and "Export Selected" buttons are part of the candidate list toolbar, not individual candidate cards. Candidate cards retain their individual "Export" button (UC-005).
- Candidate selection state (checkboxes) is local UI state — it does not need to be persisted or synced with any other part of application state.
- The sequential download fallback must space downloads by at least one event loop tick to avoid browser download-blocking heuristics. `setTimeout(..., 0)` per download is sufficient.
