# Mission

**Provide a browser-based tool that analyzes uploaded audio samples and surfaces click-free loopable fragments — with no plugins, no installs, and no compromise on quality.**

## What we do

Sound creators upload a WAV (or other audio) file. The application:

1. Decodes and visualizes the waveform
2. Analyzes the audio signal to detect candidate loop regions
3. Ranks candidates by loop quality — prioritizing fragment boundaries where the audio transitions seamlessly back to the start without an audible click or pop
4. Presents the best candidates in a clear, playable list so the creator can audition and export

## Core quality criterion: no clicks

A loop "clicks" when there is a sudden discontinuity in the waveform at the stitch point — the moment the loop wraps from end back to start. Our analysis must ensure that:

- The amplitude at the loop-end and loop-start are continuous (zero or near-zero crossing match)
- The slope (direction) of the waveform matches at the stitch point
- Optionally, a short crossfade is applied at the boundary to eliminate any remaining artifact

## Who we serve

Three distinct creative profiles, each working at a different scale:

- **Sound designers** building instrument patches who need seamless sustain loops within a single recorded note — micro-duration candidates where the loop boundary is everything
- **Musicians** isolating a clean note or chord from a recording so it can stand alone and loop naturally
- **Producers and beatmakers** carving beats, bars, and phrases into rearrangeable building blocks for sessions and arrangements

## What we are not

We are not a full DAW. We are not a sample store. We do not process audio on a server — all analysis runs in the browser for instant, private, offline-capable use.
