# Mission — Iteration 3: UI Excellence and UX Depth

**Iteration theme: Make the tool feel as good as it works.**

Iterations 1 and 2 build a technically correct, production-ready loop finder. Iteration 3 elevates the experience from functional to exceptional. The goal is that a creative person opens this tool, feels something, and keeps coming back — not because they have to, but because using it is genuinely pleasurable. Every feature in this iteration serves that feeling.

---

## Context

The vision for Vulpesetserpens states that the tool should feel like an instrument, not a utility. Iteration 1 ships a working tool with a dark aesthetic. That is the foundation. Iteration 3 is where that aesthetic becomes a considered, cohesive design — where interactions feel immediate and spatial, where the creator's attention is never fragmented, and where the visual language reinforces what the tool does rather than just containing it.

This iteration addresses UX gaps identified in the creator review (OQ-5, OQ-6 drag refinement, OQ-7) and goes further, treating the entire interface as a creative surface.

---

## Goals

### M3-G1 — Stereo waveform display

Offer an optional dual-channel (L/R stacked) waveform view for stereo files. Many producers work with stereo loops where the L and R channels carry meaningfully different content — a hi-hat panned hard right, a bass that is centered, a room mic that bleeds differently into each channel. A mono-collapsed waveform hides that spatial information. The toggle between mono and stereo view should be immediate and visual — a small icon in the waveform header, not buried in settings.

### M3-G2 — Spatial and immediate candidate comparison

Redesign the candidate list to support fast, focused comparison. Key improvements:

- **Keyboard-first navigation**: Space to play/stop, Up/Down arrows to cycle candidates with instant auto-play, number keys 1–9 to jump to a specific candidate directly
- **Visual candidate differentiation**: each candidate is assigned a distinct colour that appears consistently in the waveform overlay, the candidate card, and the waveform export annotation — so the creator can track "candidate 3" visually across the full interface without reading labels
- **Side-by-side waveform previews**: each candidate card shows a small waveform thumbnail of the loop region, not just a duration number — the producer can see the shape of each candidate before playing it

### M3-G3 — Refined loop boundary interaction (drag to adjust)

Iteration 2 ships nudge buttons. Iteration 3 completes the interaction with full drag-to-adjust on the waveform canvas. The boundary marker should behave like a professional tool:

- Drag snaps to the nearest zero-crossing by default; hold a modifier key to move freely at sample precision
- While dragging, the loop plays continuously and updates in real time — the producer hears the result of each position without releasing the mouse
- A fine-adjustment scrubber appears below the waveform during drag, giving sub-sample visual precision at high zoom
- The loop boundary update latency must not exceed 20 ms from drag position to audible result

### M3-G4 — BPM field placement and bar/beat integration

Iteration 2 delivers automatic BPM detection and a functional BPM input field. Iteration 3 elevates tempo awareness into a fully integrated spatial experience — the beat grid becomes visible on the canvas and the producer can feel the rhythm of the sample while choosing loop boundaries.

The tempo field sits inline in the waveform metadata bar (alongside sample rate, duration, and channel count), showing the auto-detected value or the creator's override. When a BPM value is present:

- Candidate durations display as bar/beat annotations (e.g. "2 bars @ 120 BPM") rather than raw seconds
- The waveform shows a faint beat grid overlay at the current tempo, giving the producer a rhythmic reference frame while selecting loop boundaries
- Beat grid snapping is available during manual loop point adjustment — dragging a boundary marker can snap to the nearest beat rather than only to the nearest zero-crossing

### M3-G5 — Drop zone and loading experience

Elevate the initial experience. The drop zone should feel like an invitation, not a file input:

- Animated waveform or particle background in the empty state — something that moves and breathes, establishing the audio-visual identity of the tool before any file is loaded
- Drag-over state is visually dramatic — not just a border change but a full atmospheric shift that makes the drop feel intentional
- File analysis progress is communicated with a waveform-drawing animation rather than a spinner — the waveform appears to "grow in" as the audio is decoded

### M3-G6 — Responsive and accessible baseline

Establish a solid accessibility and responsiveness foundation:

- All interactive elements are keyboard-reachable and have visible focus states consistent with the visual theme
- ARIA labels on all controls, especially the waveform canvas and playback buttons
- Minimum viable tablet layout (1024px breakpoint) so the tool works on a large iPad connected to a MIDI controller
- Colour contrast ratios meet WCAG AA for all text elements — the dark theme must not sacrifice readability

---

## Design Principles for This Iteration

1. **Atmosphere before decoration.** Every visual element earns its place by either conveying information or reinforcing the emotional register of the tool. No decorative elements that do not contribute to either.
2. **Sound and image move together.** Playback state should always be visible in the waveform. The waveform should always reflect what is playing. There is no gap between the visual representation and the audible reality.
3. **The fastest path is always available.** A creator should never need more than two interactions to hear a loop candidate. Drop file → press Space. That path must remain unobstructed regardless of what other UI elements are present.

---

## What Iteration 3 Is Not

- It does not add new audio processing features (that is a future iteration)
- It does not add collaborative or sharing features
- It does not add a plugin format or DAW integration (VST/AU/AAX)
- It does not redesign the export pipeline — only surfaces it more elegantly

---

## Success Condition

Any creator — sound designer, musician, or producer — who has never seen the tool can drop a sample, identify the best loop candidate for their purpose, refine it, and export it — entirely by feel, without reading documentation. A creator who uses the tool regularly describes it as part of their creative process, not as a utility they tolerate.
