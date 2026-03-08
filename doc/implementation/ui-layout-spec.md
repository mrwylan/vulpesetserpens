# UI Layout Specification

**Status:** v1 reference — covers iteration 1 scope
**References:** ADR-005 (styling), UC-001 through UC-007, Vision.md

---

## Design Principles (implementation guidance)

1. **Dark atmospheric base.** The background is near-black. Surfaces are dark purple-grey. Nothing competes with the waveform and the audio content.
2. **Amber as the single accent.** One warm accent colour (amber/ochre) used sparingly — active states, primary actions, loop region highlights. No rainbow palette.
3. **Typography carries hierarchy.** Size and weight do the work. Avoid decorative elements that do not carry information.
4. **Waveform is the centrepiece.** It occupies the widest, most prominent region of the layout at all times once a file is loaded. Everything else orbits it.
5. **Candidates are colour-coded, not numbered only.** Each loop candidate gets a consistent hue used in the waveform overlay, the card, and any annotation. The musician should be able to track "the teal loop" visually without reading.

---

## Design Tokens

These are the CSS custom properties that must be defined in `src/styles/theme.css` (per ADR-005). No hardcoded colour values anywhere in component CSS.

### Colour

```css
/* Backgrounds */
--color-bg:            #09090f;   /* page background */
--color-surface:       #111118;   /* cards, panels */
--color-surface-raised:#1a1a27;   /* elevated surfaces, hover states */
--color-border:        #25253a;   /* subtle dividers */
--color-border-strong: #3a3a55;   /* visible borders, focused inputs */

/* Text */
--color-text-primary:  #e8e8f0;   /* headings, primary labels */
--color-text-secondary:#8888a8;   /* metadata, muted labels */
--color-text-disabled: #44445a;   /* unavailable controls */

/* Accent — amber / warm */
--color-accent:        #f0a500;   /* primary CTA, active state, waveform playhead */
--color-accent-dim:    #7a5200;   /* accent background tints */
--color-accent-glow:   rgba(240,165,0,0.15); /* subtle glow on hover */

/* Semantic */
--color-success:       #34d399;   /* high-confidence score indicator */
--color-warning:       #fbbf24;   /* low-confidence flag */
--color-error:         #f87171;   /* error states */

/* Candidate palette — one colour per slot, used consistently */
--color-loop-1:        #f0a500;   /* amber */
--color-loop-2:        #22d3ee;   /* cyan */
--color-loop-3:        #a78bfa;   /* violet */
--color-loop-4:        #34d399;   /* emerald */
--color-loop-5:        #fb923c;   /* orange */
--color-loop-6:        #e879f9;   /* fuchsia */
/* up to 10 slots for the max candidate count */
```

### Typography

```css
--font-ui:      'Inter', system-ui, sans-serif;  /* all UI labels */
--font-mono:    'JetBrains Mono', 'Fira Code', monospace; /* time values, sample counts */

--text-xs:      0.6875rem;  /* 11px — sub-labels, metadata details */
--text-sm:      0.8125rem;  /* 13px — card labels, secondary info */
--text-base:    0.9375rem;  /* 15px — body, input fields */
--text-lg:      1.125rem;   /* 18px — section headings */
--text-xl:      1.5rem;     /* 24px — app name */

--weight-normal: 400;
--weight-medium: 500;
--weight-bold:   700;
```

### Spacing and Layout

```css
--space-1:  4px;
--space-2:  8px;
--space-3:  12px;
--space-4:  16px;
--space-5:  24px;
--space-6:  32px;
--space-8:  48px;

--radius-sm: 4px;
--radius-md: 8px;
--radius-lg: 12px;

--layout-max-width: 1400px;
--waveform-height:  140px;  /* canvas height, CSS pixels */
--candidate-card-width: 220px;
```

---

## Application States

The application has three distinct visual states. Each renders a different primary region.

---

### State 1 — Empty (no file loaded)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│                                                                      │
│                      vulpesetserpens                                 │
│                   ─────────────────────                              │
│                   find your perfect loop                             │
│                                                                      │
│                                                                      │
│         ┌───────────────────────────────────────────────┐           │
│         │                                               │           │
│         │                                               │           │
│         │         ↓  drop a sample here                │           │
│         │              or click to browse               │           │
│         │                                               │           │
│         │         WAV  ·  AIFF  ·  MP3  ·  FLAC        │           │
│         │                                               │           │
│         └───────────────────────────────────────────────┘           │
│                                                                      │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- The drop zone fills the viewport minus generous padding. It should feel like a stage, not a form field.
- The border of the drop zone is `--color-border` at rest. On drag-over it transitions to `--color-accent` with a soft glow (`box-shadow: 0 0 0 2px var(--color-accent-glow)`).
- The app name uses `--text-xl`, `--weight-bold`, `--color-text-primary`. The tagline uses `--text-sm`, `--color-text-secondary`.
- The icon (↓ arrow) is purely decorative — do not use an icon library; a CSS-drawn or Unicode arrow is sufficient.
- On drag-over, the label changes to "release to load" and the drop zone background shifts to `--color-accent-dim`.
- The entire viewport background is `--color-bg`.

---

### State 2 — Analyzing (file decoding or detection running)

```
┌──────────────────────────────────────────────────────────────────────┐
│                                                                      │
│  vulpesetserpens                              kick-loop.wav   ✕      │
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  ████████████████████████████████████████████████████░░░░░░░░░░░░  │
│                  waveform drawing in...                              │
│                                                                      │
│                                                                      │
│  ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─  │
│                                                                      │
│  analysing sample for loop candidates...                             │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

**Implementation notes:**
- The waveform canvas appears immediately and "draws in" as `decodeAudioData` completes. Render the waveform peak data incrementally if possible; if not, show a horizontal animated shimmer in the canvas region during decode.
- The progress text below the waveform transitions through stages: "decoding…" → "finding zero-crossings…" → "scoring candidates…" → done. These map to the worker's stage-completion messages (ADR-004).
- The ✕ button in the header allows cancelling and returning to State 1. It terminates the worker (`worker.terminate()`).
- The dashed divider (─ ─ ─) is a visual placeholder for the candidate list area, which is empty during analysis.

---

### State 3 — Results (candidates ready)

This is the primary working state. Full layout:

```
┌──────────────────────────────────────────────────────────────────────┐
│  vulpesetserpens            kick-loop.wav                    ✕ load  │  ← HEADER
│  44100 Hz · Stereo · 8.3 s              BPM  [ 120 ]                │
├──────────────────────────────────────────────────────────────────────┤
│                                                                      │  ← WAVEFORM REGION
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │░░░░░░▓██████▓░░░░░▓████████▓░░░░▓████████████▓░░░▓██████▓░░░░│  │
│  │      [══════]          [═══════════]                           │  │  ← loop overlays
│  │░░░░░░▓██████▓░░░░░▓████████▓░░░░▓████████████▓░░░▓██████▓░░░░│  │
│  │      ↑ start  ↑ end                                            │  │  ← boundary markers
│  └────────────────────────────────────────────────────────────────┘  │
│  0:00.0                                                       0:08.3  │  ← time ruler
│                                                                      │
├──────────────────────────────────────────────────────────────────────┤
│  LOOP CANDIDATES  (8 found)                        [↓ export all]   │  ← CANDIDATE HEADER
│                                                                      │
│  ┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐    │  ← CANDIDATE CARDS
│  │ ▌ #1        ████ │ │ ▌ #2        ███░ │ │ ▌ #3        ██░░ │    │
│  │   2 bars·120bpm  │ │   4 bars·120bpm  │ │   1 bar ·120bpm  │    │
│  │   2.000 s        │ │   4.000 s        │ │   1.000 s        │    │
│  │   0.12 – 2.12 s  │ │   0.08 – 4.08 s  │ │   0.12 – 1.12 s  │    │
│  │                  │ │                  │ │                  │    │
│  │  [▶ play]  [↓]   │ │  [▶ play]  [↓]   │ │  [▶ play]  [↓]   │    │
│  └──────────────────┘ └──────────────────┘ └──────────────────┘    │
│                                                                      │
│  ┌──────────────────┐  ...                                          │
│  │ ▌ #4        ██░░ │                                               │
│  │   ...            │                                               │
│  └──────────────────┘                                               │
│                                                                      │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Component Breakdown — State 3

### Header bar

```
vulpesetserpens            kick-loop.wav                    ✕  load new
44100 Hz · Stereo · 8.3 s                         BPM [ 120 ]
```

- Two rows, full width, `--color-surface` background, `--space-4` padding.
- Row 1: app name (left, `--text-lg`, `--weight-bold`), filename (centre or right of name, `--text-sm`, `--color-text-secondary`), "✕ load new" link (far right, `--text-sm`, `--color-text-secondary`).
- Row 2: audio metadata (left, `--font-mono`, `--text-xs`, `--color-text-secondary`), BPM input (far right, `--text-sm`).
- BPM input: plain `<input type="number">`, 60px wide, `--color-surface-raised` background, `--color-border` border, `--color-accent` border on focus. Label "BPM" immediately to the left. Placeholder "—".

---

### Waveform region

```
┌──────────────────────────────────────────────────────────────────────┐
│░░░░░░░░░▓████████████▓░░░░░░▓███████████████████▓░░░░░░░░░░░░░░░░░░│  ← channel data
│         [════════════]                                               │  ← loop overlay #1
│░░░░░░░░░▓████████████▓░░░░░░▓███████████████████▓░░░░░░░░░░░░░░░░░░│
│         ▲start        ▲end                          ┆ playhead      │
└──────────────────────────────────────────────────────────────────────┘
0:00.0                                                           0:08.3
```

- `<canvas>` element, full container width, `--waveform-height` tall. Scales with `devicePixelRatio`.
- Waveform peaks rendered in `--color-text-disabled` (subtle, not dominant).
- Each candidate's loop region rendered as a translucent fill using its candidate colour (`--color-loop-N` at 25% opacity). The currently selected candidate's region uses 40% opacity.
- Boundary markers: 1px vertical lines in the candidate colour, full canvas height. Hit area is 24px wide for drag interaction (UC-007).
- Playhead: 1px vertical line in `--color-accent`, animated via `requestAnimationFrame` during playback.
- Time ruler: row below the canvas, tick marks and labels in `--font-mono`, `--text-xs`, `--color-text-secondary`.

---

### Candidate card

```
┌───────────────────────┐
│ ▌  #1           ████  │  ← colour strip (left), rank, score bar (right)
│    2 bars · 120 bpm   │  ← musical annotation (shown if BPM set)
│    2.000 s            │  ← duration, monospace
│    0.120 – 2.120 s    │  ← start – end, monospace, secondary colour
│                       │
│    [▶  Play]   [↓]    │  ← play button (primary), export icon button
└───────────────────────┘
```

- Fixed width: `--candidate-card-width`. Variable height.
- Left edge: 4px colour strip using the candidate's `--color-loop-N`. This is the visual identity marker used across the card and the waveform overlay.
- Rank label (`#1`, `#2`, …) in `--text-sm`, `--weight-bold`.
- Score bar: a narrow horizontal bar (not a number) showing the composite score as a filled proportion. Fill colour matches the candidate colour.
- Musical annotation row (BPM-dependent): `--text-sm`, `--color-text-secondary`. Hidden if no BPM is set.
- Duration: `--font-mono`, `--text-base`, `--color-text-primary`.
- Start–end: `--font-mono`, `--text-xs`, `--color-text-secondary`.
- **Play button:** `--color-accent` background, `--color-bg` text, `--radius-sm`, `--space-2` padding. Label is "▶ Play" at rest; "■ Stop" while this candidate is playing. Pressing play on a different card stops the current playback.
- **Export button:** icon-only (↓ or similar), `--color-surface-raised` background, `--color-border` border. Triggers UC-005 for this candidate only.
- **Selected state:** card has `--color-border-strong` border and `--color-surface-raised` background. The corresponding waveform overlay brightens.
- **Low-confidence flag:** if `lowConfidence: true`, a small "⚠" label appears near the score bar with `--color-warning`. Tooltip: "No high-quality loop point found — this is the best available result."
- **User-modified flag:** if `userModified: true`, a small pencil icon replaces the score bar, label "(adjusted)". The score field is not shown.

---

### Candidate grid layout

- Cards flow in a horizontal scrollable row (single row, `overflow-x: auto`). No wrapping. This allows the musician to keep all candidates visible and scroll through them laterally without losing the vertical layout context.
- Scrollbar: styled thin, `--color-border` track, `--color-accent` thumb.
- Gap between cards: `--space-3`.
- The row has `--space-4` padding on both sides to prevent the first and last cards from touching the viewport edge.

---

### Keyboard interaction map

Coding agents must implement these shortcuts globally (not requiring focus on a specific element):

| Key | Action |
|-----|--------|
| `Space` | Play / stop the selected candidate |
| `↑` / `↓` or `←` / `→` | Select previous / next candidate. If currently playing, auto-play the new selection. |
| `1` – `9` | Select candidate by rank number directly |
| `,` / `.` | Nudge selected candidate's active boundary left / right by one zero-crossing (UC-007) |
| `Escape` | Stop playback |

Focus management: the page must have a logical focus order (header → waveform → BPM input → candidate cards). Keyboard shortcuts work regardless of current focus target to avoid requiring the musician to click a specific area first.

---

## Layout Hierarchy (component tree reference)

```
<App>
  <DropZone>                        — State 1 only
  <AppShell>                        — States 2 and 3
    <Header>
      <AppName />
      <FileInfo />                  — filename, ✕ button
      <AudioMetadata />             — sample rate, channels, duration
      <BpmInput />                  — UC-006
    </Header>
    <WaveformRegion>
      <WaveformCanvas />            — canvas element, handles UC-002, UC-007 drag
      <TimeRuler />
    </WaveformRegion>
    <CandidateSection>
      <CandidateSectionHeader />    — "N found" label, export-all button
      <CandidateScroller>
        <CandidateCard />           — one per result, UC-004, UC-005, UC-007
        ...
      </CandidateScroller>
    </CandidateSection>
  </AppShell>
```

---

## What This Spec Does Not Cover

The following are intentionally deferred to iteration 3 (see Mission-iteration-3.md):

- Stereo dual-channel waveform display
- Beat grid overlay on the waveform
- Animated empty state / drop zone particle background
- Fine-adjustment scrubber below the waveform during drag
- Full Figma-quality visual design (typography refinement, spacing rhythm, icon set)

This spec is sufficient to implement a functional, visually coherent iteration 1. A higher-fidelity design reference should be added before iteration 3 begins.
