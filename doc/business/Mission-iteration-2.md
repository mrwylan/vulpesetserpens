# Mission — Iteration 2: Technical Producer Alignment

**Iteration theme: Make the output production-ready.**

The first iteration delivers a working loop finder. Iteration 2 makes the exported results immediately usable in a professional production environment — without manual cleanup in a DAW. Every feature in this iteration removes a step that currently sits between the tool's output and the producer's workflow.

---

## Context

Iteration 1 establishes the core loop detection and export pipeline. Feedback from the musician review identified a set of gaps that are not UX problems — they are correctness problems from the perspective of a professional producer. A 16-bit-only WAV without sampler metadata, no AIFF support, and no way to refine a loop point manually means the tool produces results that require additional work before they are usable. Iteration 2 closes those gaps.

---

## Goals

### M2-G1 — 24-bit WAV export

Add a bit-depth selector (16-bit / 24-bit) to the export step. The WAV encoder in iteration 1 is already designed with a `bitDepth` parameter; this iteration exposes that parameter in the UI. Most modern production sessions run at 24-bit. Exporting at 16-bit from a 24-bit source introduces unnecessary quantisation noise and signals to the producer that the tool does not take audio quality seriously.

### M2-G2 — AIFF export format

Add AIFF as an export format option alongside WAV. AIFF is the default audio format in Logic Pro and is ubiquitous in Mac-based production. A producer who records and organises in AIFF should be able to export loops in the same format without a conversion step. The encoder shares PCM data encoding with the WAV encoder — only the container header differs.

### M2-G3 — Manual loop point adjustment

Implement UC-007: the ability to drag loop boundary markers on the waveform and refine the algorithm's output. The algorithm surfaces candidates; the producer decides whether they are correct. Without refinement, every result that is "close but not right" sends the musician back to their DAW. Iteration 2 ships at minimum the nudge controls (step-forward / step-backward by one zero-crossing), with drag-to-adjust following as the priority feature within this iteration. Zero-crossing snap must remain active during manual adjustment.

### M2-G4 — Scoring weight calibration

The loop quality scoring weights (zero-crossing 35%, waveform shape 30%, musical period 20%, energy continuity 15%) are initial estimates derived from first principles. Iteration 2 includes an empirical calibration pass against a diverse sample corpus: drum loops, melodic loops, field recordings, and vocal chops. Weights are adjusted based on observed ranking quality. The calibrated weights are documented in ADR-004 and frozen until explicitly revised.

### M2-G5 — Batch export

Allow the producer to export all candidates (or a selected subset) in a single action. The result is either a ZIP archive containing all loop WAV/AIFF files, or sequential individual downloads triggered automatically. A producer who has identified 8 usable loops from a single sample should not have to click "Export" 8 times. The filename convention from UC-005 applies to each file.

---

## What Iteration 2 Is Not

- It does not redesign or refine the UI layout (that is iteration 3)
- It does not add automatic BPM detection
- It does not add cloud storage, sharing, or project persistence
- It does not add time-stretching or pitch-shifting of loop candidates

---

## Success Condition

A professional producer can take a 24-bit stereo WAV or AIFF recording, run it through the tool, refine the best loop candidate using the nudge or drag controls, and export a 24-bit WAV (or AIFF) file that — when dropped directly into Kontakt, Ableton Simpler, Logic Quick Sampler, or a hardware sampler — automatically plays as a seamless loop with no manual configuration required.
