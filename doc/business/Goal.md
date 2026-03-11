# Goals

Goals are broken into product goals (what the application must achieve) and experience goals (how it must feel to use). Both matter equally.

---

## Product Goals

### G1 — Audio upload and decoding
The user can drag-and-drop or select a WAV or AIFF file (and ideally MP3/OGG/FLAC). The application decodes it entirely in the browser using the Web Audio API. No server upload required.

> **Creator note:** AIFF is as common as WAV in Mac-based production workflows. Logic Pro, GarageBand, and most hardware recorders default to AIFF. Treating it as an afterthought ("ideally") is the wrong framing — WAV and AIFF should both be listed as primary supported formats.

### G2 — Waveform visualization
The decoded audio is displayed as a waveform. The visualization is clear, responsive, and updates to reflect detected loop regions once analysis is complete.

### G3 — Automatic loop detection
The application analyzes the audio and returns a ranked list of loopable fragment candidates. Each candidate defines a start point and an end point in the audio. Detection must account for:
- **Zero-crossing alignment**: loop boundaries land at zero-crossings with matching slope direction, preventing amplitude discontinuities
- **Waveform shape continuity**: the waveform shape immediately after the start matches the shape immediately before the end, so the transition sounds natural
- **Duration range**: candidates must span the full range of creative needs — from micro-duration sustain loops (milliseconds, for sound designers building instrument patches) through note/chord-length loops (for musicians) up to beat, bar, and phrase-length loops (for producers). The search must not impose a minimum duration tied to musical period.
- **Musical period affinity**: when a candidate's duration aligns with a likely musical period (detected via autocorrelation), such as one bar or two bars, that is a positive signal for producers and musicians. It is not a requirement, and must not penalise micro-duration candidates.

### G4 — Loop preview / audition
Each candidate can be played back in a seamless loop directly in the browser. The user can switch between candidates and hear the loop without any gap or click.

### G5 — Export
The user can export a selected loop as a trimmed WAV file. The exported file contains only the loop region, ready to drop into any DAW or sampler.

---

## Experience Goals

### E1 — Inspiring visual design
The UI must feel crafted for creative people. Use a dark, atmospheric aesthetic with intentional typography and color. It should feel closer to a musical instrument than a file utility.

### E2 — No friction
From drop to playback in under five seconds for typical samples. No sign-up, no loading screens beyond necessary processing, no configuration required.

### E3 — Clarity of results
Loop candidates are presented in a scannable, ranked list. Each candidate clearly shows its duration, start/end time, and a quality indicator. The best candidates appear first.

### E4 — Browser-native, no install
The entire application runs in a modern browser. No backend, no plugins, no Electron. Works offline once loaded.

---

## Out of Scope (v1)

- Automatic BPM detection
- Beat-grid alignment or time-stretching
- Multi-track or stem analysis
- Cloud storage or project saving
- Mobile-optimized layout (desktop-first for v1)
- Collaboration or sharing features

> **Creator note:** Automatic BPM detection is out of scope, but user-supplied BPM input (a simple number field) is low-cost and high-value. A producer or musician typing "120" into a tempo field unlocks musically-aware loop duration scoring and bar-count annotations on candidates and filenames. This is not BPM detection — it is BPM input — and the distinction matters. Consider moving "user-supplied BPM hint" into scope for v1 as a lightweight input, even if automated detection remains out of scope. See UC-006.
