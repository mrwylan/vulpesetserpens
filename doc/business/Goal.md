# Goals

Goals are broken into product goals (what the application must achieve) and experience goals (how it must feel to use). Both matter equally.

---

## Product Goals

### G1 — Audio upload and decoding
The user can drag-and-drop or select a WAV file (and ideally MP3/OGG/FLAC). The application decodes it entirely in the browser using the Web Audio API. No server upload required.

### G2 — Waveform visualization
The decoded audio is displayed as a waveform. The visualization is clear, responsive, and updates to reflect detected loop regions once analysis is complete.

### G3 — Automatic loop detection
The application analyzes the audio and returns a ranked list of loopable fragment candidates. Each candidate defines a start point and an end point in the audio. Detection must account for:
- **Zero-crossing alignment**: loop boundaries land at zero-crossings with matching slope direction, preventing amplitude discontinuities
- **Waveform shape continuity**: the waveform shape immediately after the start matches the shape immediately before the end, so the transition sounds natural
- **Musical duration**: preference for loop lengths that correspond to likely musical periods (detected via autocorrelation), such as one bar, two bars, etc.

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

- BPM detection or beat-grid alignment
- Multi-track or stem analysis
- Cloud storage or project saving
- Mobile-optimized layout (desktop-first for v1)
- Collaboration or sharing features
