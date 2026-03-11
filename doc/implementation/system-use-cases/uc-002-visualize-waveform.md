# UC-002 — Visualize Waveform

## Trigger

An "audio-loaded" event (or equivalent state change) is dispatched by the system after UC-001 completes successfully and a decoded `AudioBuffer` is available in application state.

## Preconditions

- A valid `AudioBuffer` is present in application state.
- A `<canvas>` element designated for waveform rendering is mounted in the DOM and has a non-zero layout width and height.
- The canvas element's 2D rendering context (`canvas.getContext('2d')`) is available.

## Main Flow

1. The system reads the layout dimensions of the canvas element using `canvas.clientWidth` and `canvas.clientHeight`, then sets `canvas.width = canvas.clientWidth * window.devicePixelRatio` and `canvas.height = canvas.clientHeight * window.devicePixelRatio` to ensure crisp rendering on high-DPI (retina) displays. The canvas 2D context scale is set to `devicePixelRatio` in both axes.
2. The system extracts peak amplitude data from the `AudioBuffer` by downsampling:
   a. If the buffer has more than one channel, the channels are mixed to mono by averaging corresponding samples across all channels before peak extraction.
   b. The total number of samples in the (mono-mixed) channel is divided by the canvas pixel width (`canvas.width`) to produce a "bin size" — the number of audio samples represented by each horizontal pixel column.
   c. For each pixel column `x`, the system finds the minimum and maximum sample values within the corresponding sample range `[x * binSize, (x+1) * binSize)`. These become the lower and upper extent of the waveform bar drawn at that column.
3. The system clears the canvas (`ctx.clearRect`) and fills it with the application background color.
4. The system draws the waveform. For each pixel column, a vertical line segment is drawn from the lower peak to the upper peak, centered vertically on the canvas. Amplitude values in the range `[-1.0, 1.0]` are mapped linearly to canvas y-coordinates spanning from the top to the bottom of the canvas, with 0.0 mapping to the vertical midpoint.
5. A horizontal center line (representing silence / zero amplitude) is drawn across the full width of the canvas at the vertical midpoint, in a color visually distinct from but subordinate to the waveform.
6. The system stores the computed peak arrays (min and max per pixel column) in application state alongside the `AudioBuffer` so that overlay rendering (step 7 and loop region overlays from UC-003) can redraw without re-reading the `AudioBuffer`.
7. The system calls a "render overlays" pass on top of the waveform. On initial load this renders nothing; once UC-003 completes, loop candidate regions are drawn as colored highlight overlays (see Alternate Flows). The overlay pass always executes as the final rendering step so overlays appear above the waveform.

## Alternate Flows

### AF-1: Loop candidate regions available (post UC-003)

When UC-003 has produced a ranked list of loop candidates, the system re-invokes the overlay pass (step 7) without re-computing the waveform peak data:
- Each candidate region is rendered as a translucent colored rectangle spanning the pixel range corresponding to its start and end time, drawn above the waveform bars.
- The highest-ranked candidate uses a more opaque or distinctly colored highlight compared to lower-ranked candidates.
- The currently selected/auditioning candidate (if any) is rendered with a solid, high-contrast border.
- Loop boundary markers (thin vertical lines) are drawn at the start and end sample of the selected candidate.

### AF-2: Window or container is resized

1. A `ResizeObserver` (or `window` resize event listener) detects that the canvas container has changed size.
2. The system re-executes from Main Flow step 1, re-reading `clientWidth`/`clientHeight` and re-computing peak data for the new pixel width.
3. Any existing loop candidate overlays are re-rendered at the new scale.
4. The redraw is debounced by at least 100 ms to avoid thrashing during continuous resize drag operations.

### AF-3: Multi-channel audio

The channel-mixing step (Main Flow 2a) ensures the waveform display is always mono. The number of channels in the source file is shown as a metadata label (e.g., "Stereo", "Mono") adjacent to the waveform but the visual representation itself is always single-track.

## Failure / Error Cases

### FC-1: Canvas context unavailable

- Detection: `canvas.getContext('2d')` returns `null`.
- Response: display a fallback message in the UI ("Waveform display is not available in this browser environment.") and proceed with the rest of the application flow (loop detection and audition still function without the waveform).

### FC-2: AudioBuffer is unexpectedly empty

- Detection: `audioBuffer.length === 0` or `audioBuffer.numberOfChannels === 0`.
- Response: draw the center line only. Display a label on the canvas: "No audio data to display." Do not throw; allow the rest of the application to continue.

### FC-3: Canvas is zero-sized

- Detection: `canvas.clientWidth === 0` or `canvas.clientHeight === 0` at render time.
- Response: skip rendering and schedule a retry once the layout stabilizes (one `requestAnimationFrame` later). If the canvas is still zero-sized after one retry, skip silently.

### FC-4: Peak extraction throws (e.g., detached ArrayBuffer)

- Detection: any exception thrown during sample access in Main Flow step 2.
- Response: log the error to the console. Display an error label on the canvas. Application state is not corrupted; the `AudioBuffer` reference is left intact.

## Acceptance Criteria

1. After a successful file load, a waveform is visibly rendered on the canvas within 500 ms of the "audio-loaded" event firing, for audio files up to 10 minutes in length.
2. The waveform fills the full width of the canvas exactly one pixel column per display pixel (accounting for `devicePixelRatio`).
3. On a high-DPI display (`devicePixelRatio >= 2`), the waveform does not appear blurry or aliased.
4. The center (zero-amplitude) line is visible and horizontally centered on the canvas.
5. A silent audio file (all samples zero) renders as a flat line at the vertical midpoint and nothing else.
6. A full-scale sine wave renders as a symmetric waveform filling the full vertical height of the canvas.
7. Resizing the browser window causes the waveform to re-render at the new dimensions within 200 ms of the resize completing (debounce applied).
8. After UC-003 completes, colored overlay regions appear on the waveform corresponding to the detected loop candidate regions without redrawing the underlying waveform peak data.
9. The selected loop candidate is visually distinguishable from non-selected candidates (distinct color or border).
10. The waveform for a stereo file is rendered as a single mono-mixed track, and a "Stereo" label is displayed adjacent to the canvas.
11. Loop boundary markers (vertical lines) for the selected candidate are visible at the correct pixel positions corresponding to the candidate's start and end times.

## Test Coverage

### Unit (Vitest)
- AC-5: peak-extraction function on a zeroed Float32Array produces min=0 and max=0 for every column
- AC-6: peak-extraction function on a full-scale sine wave produces min ≈ -1.0 and max ≈ 1.0 across columns
- AC-2: peak-extraction output array length equals the pixel-width argument passed to the function
- AC-10: mono-mix function averages L and R channels correctly for a synthetic stereo Float32Array

### E2E (Playwright)
- AC-1: after uploading a WAV fixture, a `<canvas>` element is visible and non-empty within 500 ms of the audio-loaded event
- AC-2: the canvas pixel width matches `canvas.clientWidth * devicePixelRatio` (verified via JS evaluation in Playwright)
- AC-3: on a simulated high-DPI viewport (`devicePixelRatio = 2`), the canvas width attribute is twice the CSS width
- AC-4: the center line is present — a pixel sample at the vertical midpoint of the canvas has a non-background color
- AC-7: resizing the browser window causes the canvas to redraw at new dimensions within 200 ms of the resize completing
- AC-8: after loop candidates are detected, colored overlay regions appear on the canvas without the page reloading
- AC-9: the selected candidate's overlay is visually distinct from unselected overlays (pixel color differs at the same x position)
- AC-10: after uploading a stereo fixture, a "Stereo" label is visible adjacent to the canvas
- AC-11: loop boundary marker lines are rendered at pixel positions corresponding to the candidate's start and end times

## Notes / Constraints

- All rendering must use the HTML5 Canvas 2D API. Do not use WebGL for this feature.
- Peak extraction must run on the raw `Float32Array` data obtained via `audioBuffer.getChannelData(channelIndex)`. Do not copy the data into a new array; iterate over the typed array in-place to minimize memory allocation.
- The waveform rendering must use `requestAnimationFrame` for the actual draw call so it is synchronized with the browser's paint cycle. The peak extraction (CPU-intensive) may happen synchronously before the `requestAnimationFrame` call if the buffer is short (< 60 seconds). For longer buffers, extract peaks in a Web Worker to avoid blocking the main thread, posting the result back and then drawing on the main thread.
- Canvas pixel dimensions (`canvas.width`, `canvas.height`) must always be integer values. Use `Math.round()` when multiplying by `devicePixelRatio`.
- The y-axis mapping formula for a sample value `s` in `[-1.0, 1.0]` to canvas y-coordinate is: `y = (1 - s) / 2 * canvas.height`. Positive values map upward (smaller y), negative values map downward (larger y).
- The overlay rendering pass must be implemented as a composable function that can be called independently of the waveform draw pass. Both must share the same canvas context. Use `ctx.save()` and `ctx.restore()` around overlay drawing to prevent state leakage.
- Waveform fill color and overlay colors are defined by the application design tokens (CSS custom properties or a shared constants file), not hardcoded in the rendering function.
- Audio duration and sample rate should be displayed as text metadata near the waveform (e.g., "4.32 s · 44100 Hz · Stereo").

> **Creator note:** Duration in decimal seconds alone is uninformative for most production decisions. If a tempo reference has been entered by the user (see UC-006), the metadata line should additionally show the approximate bar/beat count at that tempo — e.g., "4.32 s · 44100 Hz · Stereo · ≈ 2 bars @ 120 BPM". Even without a user-entered tempo, displaying duration as `mm:ss.ms` (e.g., "0:04.320") is more immediately readable than a plain decimal seconds value, because musicians read time this way from DAW transport displays.
