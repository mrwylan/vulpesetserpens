# Musician Review — Vulpesetserpens System Documentation

**Reviewer:** Musician-perspective review (15+ years in sample-based production, sound design, DAW work)
**Date:** 2026-03-08
**Scope:** All business docs, system use cases UC-001 through UC-005, ADRs 001–006

---

## Summary of Findings

The technical foundation is solid. The no-backend architecture, Web Audio API approach, and zero-crossing + slope-match algorithm are well-chosen and correctly specified. The documents are detailed and precise. The gaps are not architectural — they are in the musician's workflow experience: what happens after the algorithm runs, how a producer actually interacts with loop candidates, and what a loop file needs to contain to be immediately usable downstream.

---

## What Was Found

### 1. AIFF format completely absent (UC-001, ADR-003, Goal.md)

AIFF (Audio Interchange File Format) is a first-class uncompressed audio format on macOS. Logic Pro, GarageBand, Soundtrack Pro, and most professional hardware recorders default to AIFF output. Every Mac-based producer will frequently have `.aiff` files. The original documents listed WAV, MP3, OGG, FLAC — no AIFF anywhere.

This is not a technical gap (browsers handle AIFF via `decodeAudioData` natively) — it is a documentation and acceptance-criteria gap that would result in AIFF being rejected at the file validation step.

### 2. Multiple-file drop was silently ignored (UC-001)

When a user drops multiple files, the original spec said "silently ignored beyond the first." A musician who accidentally multi-selects files in their file manager and drops them gets no feedback about what happened. A brief non-blocking message ("Only one file can be loaded at a time. Loading: filename.wav") is the correct response.

### 3. Maximum loop duration was 30 seconds — too short (UC-003)

At 80 BPM (common in hip-hop, dub, ambient), a single 4-bar phrase is 12 seconds and an 8-bar phrase is 24 seconds. A 16-bar phrase — standard for a verse or chorus loop in many genres — is 48 seconds. The 30-second cap would silently exclude valid and common musical phrases. Changed to 60 seconds, which covers 16 bars at 60 BPM without making analysis intractably slow.

### 4. Loop quality scoring had no energy continuity term (UC-003, ADR-004)

The algorithm scored slope match, waveform shape, and musical period — but not energy continuity at the stitch point. A loop can pass all three tests and still sound jarring if the perceived loudness jumps suddenly at the boundary. Example: a loop that ends on a decaying cymbal tail (near zero amplitude) and restarts on a loud kick drum attack. The zero-crossing test passes; the energy context is completely discontinuous. Added an `S_energy` score based on RMS comparison across a 50 ms window on each side of the stitch, weighted at 15% of the composite score.

### 5. Candidate durations displayed in seconds only (UC-003, UC-002)

Musicians think in bars and beats, not decimal seconds. "3.812 s" is meaningless to a producer who is looking for their 2-bar loop. The documents showed duration as a float in seconds. This is fine as a data format but insufficient as a display format. Added: if a tempo reference is available (see UC-006), display annotations like "≈ 2 bars @ 120 BPM". Even without tempo, `mm:ss.ms` format is more readable than a raw decimal.

### 6. No keyboard shortcuts for audition (UC-004)

The audition use case only described clicking a Play button. Rapid candidate cycling — the core of how a producer evaluates loop options — requires keyboard shortcuts. Clicking back to a button between each candidate listen breaks the listening focus. Added: Space to toggle play/stop on the selected candidate; Up/Down arrows to cycle through the candidate list (and auto-play the new selection if already playing).

### 7. No playhead indicator during playback (UC-004)

When a loop is playing, there was no visual position indicator. Added: a moving vertical line on the waveform overlay showing the current read position, updated via `requestAnimationFrame`.

### 8. Candidate switching had a gap tolerance of 50 ms (UC-004)

The acceptance criterion allowed up to 50 ms silence/overlap when switching between candidates while playing. For rapid audition comparison, 50 ms is perceptible and disruptive. Tightened the target to 20 ms for the switch gap.

### 9. Exported WAV had no `smpl` chunk (UC-005, ADR-006)

This is the single highest-impact missing feature for the target audience. The `smpl` chunk is a standard WAV metadata chunk that tells hardware samplers and soft-synths (Kontakt, EXS24/Quick Sampler, HALion, Ableton Simpler, etc.) where the loop points are. Without it, the exported file is just a trimmed audio clip — the musician must manually configure loop start/end in their sampler every time they import the file. With it, drag-and-drop into a sampler automatically configures the loop. The cost is 60 extra bytes per file. Added the `smpl` chunk write to UC-005 Main Flow step 5 and ADR-006.

### 10. Export filename used start/end millisecond timestamps (UC-005)

The proposed pattern `my-sample_loop_1_1240-3820ms.wav` is not how producers name loop files. The start and end timestamps mean nothing at a glance. What a musician wants to know from the filename is: how long is this loop? A name like `my-sample_loop1_2.580s.wav` or `my-sample_loop1_2bars_120bpm.wav` is immediately parseable. Changed the filename pattern to duration-based, with optional bar-count annotation when BPM is known.

### 11. Export was designed only for 16-bit, with no path for 24-bit (UC-005, ADR-006)

16-bit is sufficient for legacy hardware samplers and final delivery, but most modern producers work at 24-bit throughout their session. A 16-bit export introduces unnecessary dithering noise when the source was recorded or processed at higher depth. The encoder function signature was updated to accept an optional `bitDepth` parameter (defaulting to 16) so that adding 24-bit output in v1.1 requires implementing one additional encoding branch, not a refactor.

### 12. BPM detection vs BPM input conflation in Goal.md

The "Out of Scope" section listed "BPM detection or beat-grid alignment" as a single item. Automatic BPM detection is correctly out of scope. But user-supplied BPM input (a number field) is a completely different — and very low-cost — feature that directly improves the quality of period scoring and the usefulness of result annotations. The distinction was clarified in Goal.md.

### 13. Two use cases were entirely missing

**UC-006 — Set Tempo Reference:** User types a BPM value. The system uses it to annotate candidates with bar counts and to bias the `S_period` score in UC-003. This does not require automatic BPM detection — the musician supplies the value they already know.

**UC-007 — Adjust Loop Points Manually:** The algorithm surfaces candidates but producers always want to refine them. A drag-to-adjust interface on the waveform's boundary markers, with zero-crossing snapping and real-time loop boundary update during playback, transforms the tool from a one-shot generator into an iterative creative instrument.

---

## What Was Changed and Why

| Document | Change | Reason |
|----------|--------|--------|
| `uc-001-upload-audio-file.md` | Added AIFF to accepted formats (FC-1, AC-2) | AIFF is a primary format on macOS; omitting it silently excludes Logic Pro users |
| `uc-001-upload-audio-file.md` | Added informational message on multi-file drop | Silent failure is confusing; producers need to know which file was loaded |
| `uc-002-visualize-waveform.md` | Added note on duration display format | Seconds alone are uninformative; bar/beat context is what musicians use |
| `uc-003-detect-loop-candidates.md` | Changed maxDuration from 30 s to 60 s | 30 s cuts off 8-bar loops at slow tempos; 60 s covers 16 bars at 60 BPM |
| `uc-003-detect-loop-candidates.md` | Added `S_energy` score and adjusted composite weights | Energy discontinuity at stitch is audible even when waveform tests pass |
| `uc-003-detect-loop-candidates.md` | Added `energyScore` to candidate object | Required for UI display and debugging |
| `uc-003-detect-loop-candidates.md` | Added note on BPM hint to worker | Connects UC-006 to the detection algorithm |
| `uc-003-detect-loop-candidates.md` | Added musician-readable duration display note | Seconds are engineer-speak; bars are musician-speak |
| `uc-003-detect-loop-candidates.md` | Updated AC-1 to include 80 BPM test case | Validates that the new 60 s ceiling actually works for slow tempos |
| `uc-004-audition-loop.md` | Added keyboard shortcut trigger (Space, arrow keys) | Essential for rapid candidate evaluation without mouse dependency |
| `uc-004-audition-loop.md` | Added playhead indicator (step 11) | Visual feedback for current play position; helps confirm loop boundaries |
| `uc-004-audition-loop.md` | Added musician notes on gain control and loop counter | Practical UX details that matter in a real production session |
| `uc-004-audition-loop.md` | Tightened switch gap to 20 ms | 50 ms is perceptible; rapid comparison requires near-instant switching |
| `uc-004-audition-loop.md` | Added keyboard shortcut acceptance criteria (AC-11, 12, 13) | Testable requirements for the new trigger |
| `uc-005-export-loop.md` | Added `smpl` WAV chunk to Main Flow step 5 | Hardware samplers and soft-synths use this to auto-configure loop points |
| `uc-005-export-loop.md` | Changed filename pattern to duration-based | Start/end timestamps are meaningless; duration is what producers care about |
| `uc-005-export-loop.md` | Added `smpl` chunk acceptance criteria (AC-13, 14) | Testable requirements for the new chunk |
| `uc-005-export-loop.md` | Added `bitDepth` note to encoder design | Future-proofs for 24-bit export without a refactor |
| `adr-003-audio-decoding-and-processing.md` | Added AIFF to supported formats in Context and Consequences | Aligns with UC-001 changes; AIFF is first-class, not optional |
| `adr-004-loop-detection-algorithm.md` | Added energy envelope matching as an included scoring factor | Corrects the "rejected" framing; it is now included as `S_energy` |
| `adr-004-loop-detection-algorithm.md` | Updated candidate object type to include all score fields | Required for UI display |
| `adr-006-audio-export-format.md` | Added `smpl` chunk to Consequences | Documents the architectural decision to include sampler metadata |
| `adr-006-audio-export-format.md` | Added `bitDepth` parameter to encoder signature in Consequences | Enables 24-bit extension without refactor |
| `adr-006-audio-export-format.md` | Added musician note on 24-bit in alternatives | Explains why 24-bit matters and why the encoder must be designed for it |
| `Goal.md` | Added AIFF to G1 | AIFF is co-equal with WAV, not optional |
| `Goal.md` | Clarified BPM detection vs BPM input in Out of Scope | These are different features; input is in scope, detection is not |
| `README.md` (use cases) | Added index table and UC-006, UC-007 | Documents new use cases |
| Created `uc-006-set-tempo-reference.md` | New use case | Missing workflow: user provides BPM to improve scoring and annotations |
| Created `uc-007-adjust-loop-points-manually.md` | New use case | Missing workflow: user refines algorithm output by dragging loop boundaries |

---

## Open Questions and Recommendations for the Team

These items require a product or architectural decision — they are not resolvable by documentation edits alone.

### OQ-1: Should 24-bit WAV export ship in v1?

The encoder design has been future-proofed with a `bitDepth` parameter, but the decision of whether to expose a bit-depth selector in the v1 UI has not been made. Recommendation: ship 16-bit as default with a "Quality" dropdown offering 16-bit and 24-bit. The implementation cost is low (one additional encoding branch in the WAV encoder). The user-facing benefit for professional producers is significant.

### OQ-2: Should AIFF be an export option alongside WAV?

AIFF is the native format for Logic Pro projects. Users who recorded source material as AIFF and work in an AIFF-native workflow may prefer to export loops as AIFF rather than WAV. AIFF encoding is structurally similar to WAV (different header, same PCM data) and could share most of the encoder code. Recommendation: add to the UC-005 alternate flows as a format choice. Implementation cost is moderate; user value for macOS producers is meaningful.

### OQ-3: Is the scoring weight tuning (0.35/0.30/0.20/0.15) correct?

The weights are initial estimates. They must be tested against a diverse corpus of real-world samples: drum loops, melodic loops, field recordings, vocal chops. The weight constants are defined in the worker script and are easily adjustable. Recommendation: prioritize empirical testing with real material before freezing the weights. A small corpus of 20–30 sample types with known correct loop points would be sufficient to validate or recalibrate.

### OQ-4: Should the tool support batch export?

A producer who generates 10 good loops from a single sample will want to export all of them at once, not click "Export" 10 times. Batch export (a "Export All" button that downloads a ZIP or triggers multiple individual downloads) is a quality-of-life feature that has not been spec'd. It is out of scope for v1 but should be on the v2 roadmap.

### OQ-5: Waveform stereo display — should both channels be shown?

The current spec collapses stereo to mono for waveform display. Many producers work with stereo loops where the L/R content differs significantly (e.g., a stereo drum loop with hihat panned hard right). Showing a mono-collapsed waveform hides that information. An optional dual-channel (L/R stacked) waveform display, toggled by the user, would give stereo-aware producers more information when selecting loop boundaries. This is a cosmetic and UX decision, not a correctness issue — the analysis correctly handles both channels at export.

### OQ-6: Should UC-007 (manual adjustment) be in scope for v1?

Manual loop point adjustment is the feature that separates a "useful demo" from a "production tool." Without it, every musician who gets a result that is close-but-not-right will abandon the tool for their DAW. However, it is a non-trivial interaction to implement correctly (drag on canvas, real-time loopStart/loopEnd update during playback, zero-crossing snap). Recommendation: implement UC-007 in v1, but it can be phased: the nudge buttons (step 10–12 of UC-007 Main Flow) are simpler than full drag and give most of the value with less implementation effort. Full drag can follow in v1.1.

### OQ-7: Where does the tempo field live in the UI?

**Resolved — see `doc/implementation/ui-layout-spec.md` (Header bar section).**

The BPM input sits inline in the second row of the header bar, far-right, alongside the audio metadata line (sample rate, channels, duration). It is always visible without scrolling. Implementation: plain `<input type="number">` with a "BPM" label, 60px wide, styled with `--color-surface-raised` background and `--color-accent` border on focus.
