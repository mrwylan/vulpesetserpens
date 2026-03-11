# Mission — Iteration 2: Creator-Ready Output

**Iteration theme: Make the output immediately usable.**

The first iteration delivers a working loop finder. Iteration 2 makes the exported results immediately usable across all three creator profiles — without manual cleanup in a DAW, a sampler editor, or an audio converter. Every feature in this iteration removes a step that currently sits between the tool's output and the creator's workflow.

---

## Context

Iteration 1 establishes the core loop detection and export pipeline. Feedback from the creator review identified a set of gaps that are not UX problems — they are correctness problems that affect all three creator profiles. A 16-bit-only WAV without sampler metadata, no AIFF support, and no way to refine a loop point manually means the tool produces results that require additional work before they are usable — in a sampler patch, in a DAW session, or in an arrangement. Iteration 2 closes those gaps.

---

## Goals

### M2-G1 — 24-bit WAV export

Add a bit-depth selector (16-bit / 24-bit) to the export step. The WAV encoder in iteration 1 is already designed with a `bitDepth` parameter; this iteration exposes that parameter in the UI. Most modern production sessions run at 24-bit. Exporting at 16-bit from a 24-bit source introduces unnecessary quantisation noise and signals to the producer that the tool does not take audio quality seriously.

### M2-G2 — AIFF export format

Add AIFF as an export format option alongside WAV. AIFF is the default audio format in Logic Pro and is ubiquitous in Mac-based production. A producer who records and organises in AIFF should be able to export loops in the same format without a conversion step. The encoder shares PCM data encoding with the WAV encoder — only the container header differs.

### M2-G3 — Manual loop point adjustment

Implement UC-007: the ability to drag loop boundary markers on the waveform and refine the algorithm's output. The algorithm surfaces candidates; the producer decides whether they are correct. Without refinement, every result that is "close but not right" sends the creator back to their DAW or sampler editor. Iteration 2 ships at minimum the nudge controls (step-forward / step-backward by one zero-crossing), with drag-to-adjust following as the priority feature within this iteration. Zero-crossing snap must remain active during manual adjustment.

### M2-G4 — Scoring weight calibration

The loop quality scoring weights (zero-crossing 35%, waveform shape 30%, musical period 20%, energy continuity 15%) are initial estimates derived from first principles. Iteration 2 includes an empirical calibration pass against a diverse sample corpus: drum loops, melodic loops, field recordings, and vocal chops. Weights are adjusted based on observed ranking quality. The calibrated weights are documented in ADR-004 and frozen until explicitly revised.

### M2-G5 — Batch export

Allow the producer to export all candidates (or a selected subset) in a single action. The result is either a ZIP archive containing all loop WAV/AIFF files, or sequential individual downloads triggered automatically. A producer who has identified 8 usable loops from a single sample should not have to click "Export" 8 times. The filename convention from UC-005 applies to each file.

### M2-G6 — Automatic BPM detection

Analyze the audio to infer tempo automatically, removing the need for the creator to supply a BPM value manually. When detection succeeds:
- The BPM field (introduced in v1 as a manual input, G6) is populated automatically and shown as a detected value, not a user override
- The creator can correct a wrong detection by typing a new value; the corrected value takes precedence
- Detection is performed in the analysis worker alongside loop detection — it must not add perceptible latency to the result display
- Detection confidence is shown alongside the value (e.g. "120 BPM detected" vs "120 BPM (unconfirmed)") so the producer knows when to verify

Automatic detection is a must-have for iteration 2 because producers and beatmakers rarely know the exact BPM of a recorded or found sample, and requiring manual entry makes the BPM feature feel like a burden rather than a benefit. Detection turns it into a service.

### M2-G7 — Beat-aligned loop boundaries for Producer and Musician profiles

When a BPM value is available (detected automatically or entered manually) and the active profile is **Producer** or **Musician**, loop candidate start and end points must be quantized to — or strongly biased toward — beat positions in the detected grid. A loop that starts and ends on a beat plays back in phase when triggered in a DAW, sampler, or live performance context without any manual grid-alignment step by the creator.

Concretely:
- After BPM is established, compute a beat grid: `beatPositions[n] = n × (60 / BPM)` seconds, for n = 0, 1, 2, …
- For Producer and Musician profiles, the scoring pipeline assigns a **beat-alignment bonus** to candidates whose `startSample` and `endSample` fall within a configurable snap window (≤ 10 ms) of a beat position. Candidates that land exactly on a beat rank higher than otherwise equivalent candidates that do not.
- The snap window tightens to ≤ 5 ms for the Producer profile (bar-tight rhythmic loops) and is relaxed to ≤ 20 ms for the Musician profile (melodic phrasing is less grid-strict).
- Beat alignment is **not applied** to the Sound Designer profile. Micro sustain loops exist within a single note's waveform; their loop boundaries are determined by zero-crossing quality alone, never by a rhythmic grid that has no meaning at that scale.

This feature depends on M2-G6: beat alignment requires a BPM value. If no BPM is available the scoring falls back to the existing zero-crossing and waveform quality criteria for all profiles.

---

## What Iteration 2 Is Not

- It does not redesign or refine the UI layout (that is iteration 3)
- It does not add cloud storage, sharing, or project persistence
- It does not add time-stretching or pitch-shifting of loop candidates

---

## Success Condition

All three creator profiles can complete their workflow without leaving the tool:

- A **sound designer** can load a 24-bit mono recording of a single sustained note, refine the sustain loop boundary to the exact zero-crossing they need, and export a 24-bit WAV that drops directly into Kontakt or a hardware sampler and loops seamlessly with no further editing.
- A **musician** can load a stereo recording of an instrument phrase, see the tempo detected automatically, and find that the top-ranked candidates already start and end at phrase boundaries that align with the beat grid — so the exported loop drops into a DAW session without a manual grid-align step. They can refine the boundary with nudge or drag and export a WAV or AIFF ready to use as a one-shot or loop.
- A **producer** can load a 24-bit stereo WAV or AIFF recording, see the tempo detected automatically, and get a ranked candidate list whose boundaries are quantized to beat positions. The best bar-length loop candidate starts on beat 1 and ends cleanly on the downbeat of the following bar. They refine if needed, export a 24-bit file that — when dropped into Ableton Simpler, Logic Quick Sampler, or a hardware sampler — automatically plays as a seamless, in-phase loop with no manual configuration required. Each candidate is annotated with its bar count at the detected tempo. When multiple usable loops exist in a single sample, all can be exported in one action.
