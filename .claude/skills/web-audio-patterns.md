---
name: web-audio-patterns
description: Reference for correct Web Audio API usage patterns in this project. Use when implementing anything that touches AudioContext, AudioBuffer, AudioBufferSourceNode, or the analysis Web Worker.
argument-hint: "<topic: decode | playback | worker | export>"
---

# Web Audio API Patterns

This project uses the Web Audio API exclusively for all audio processing (ADR-003). No third-party audio libraries. These patterns must be followed exactly — incorrect usage causes silent bugs or browser-policy failures.

---

## Pattern: Decoding an audio file

```ts
// AudioContext must be created inside a user gesture handler
// Never construct it at module load time — browsers block it
let ctx: AudioContext | null = null

function getAudioContext(): AudioContext {
  if (!ctx) ctx = new AudioContext()
  return ctx
}

async function decodeFile(file: File): Promise<AudioBuffer> {
  const arrayBuffer = await file.arrayBuffer()
  return getAudioContext().decodeAudioData(arrayBuffer)
  // decodeAudioData detaches the ArrayBuffer — do not reuse it
}
```

**Supported formats via decodeAudioData:** WAV, AIFF, MP3, OGG, FLAC (browser-dependent — Chromium supports all; see UC-001)

---

## Pattern: Transferring audio data to a Web Worker

`AudioBuffer` is **not transferable** — it cannot be sent to a worker directly.
Extract `Float32Array` channel data first, then transfer the underlying `ArrayBuffer`:

```ts
const channels: Float32Array[] = []
for (let i = 0; i < audioBuffer.numberOfChannels; i++) {
  channels.push(audioBuffer.getChannelData(i))
  // getChannelData returns a live view — copy it before transfer
}

// Clone before transfer (transfer detaches the buffer)
const transferable = channels.map(ch => ch.slice())
const buffers = transferable.map(ch => ch.buffer)

worker.postMessage(
  { type: 'analyse', channels: transferable, sampleRate: audioBuffer.sampleRate },
  buffers  // transfer ownership — avoids copying
)
// After transfer, transferable[i].buffer.byteLength === 0
```

---

## Pattern: Looped playback (UC-004)

`AudioBufferSourceNode` is single-use — create a new one for each play:

```ts
let sourceNode: AudioBufferSourceNode | null = null

function playLoop(buffer: AudioBuffer, startTime: number, endTime: number): void {
  stopPlayback()  // always stop before creating a new node
  const ctx = getAudioContext()
  sourceNode = ctx.createBufferSource()
  sourceNode.buffer = buffer
  sourceNode.loop = true
  sourceNode.loopStart = startTime   // seconds
  sourceNode.loopEnd = endTime       // seconds
  sourceNode.connect(ctx.destination)
  sourceNode.start(0, startTime)     // start immediately at loop start
}

function stopPlayback(): void {
  if (sourceNode) {
    sourceNode.stop()
    sourceNode.disconnect()
    sourceNode = null
  }
}
```

**Real-time loop boundary update during drag (UC-007):**
Setting `loopStart`/`loopEnd` on a playing node takes effect immediately — no stop/restart needed:

```ts
function updateLoopBoundary(startTime: number, endTime: number): void {
  if (sourceNode) {
    sourceNode.loopStart = startTime
    sourceNode.loopEnd = endTime
    // change is immediate — no restart required
  }
}
```

---

## Pattern: Playhead position

`AudioContext.currentTime` is the clock. Compare against the time the source was started:

```ts
let startedAt = 0
let loopStart = 0
let loopDuration = 0

function startLoop(buffer: AudioBuffer, start: number, end: number): void {
  loopStart = start
  loopDuration = end - start
  startedAt = getAudioContext().currentTime - start
  // ... create and start sourceNode
}

function getPlayheadPosition(): number {
  const elapsed = getAudioContext().currentTime - startedAt
  return loopStart + (elapsed % loopDuration)  // position in seconds within the buffer
}

// Drive canvas playhead with requestAnimationFrame:
function animatePlayhead(): void {
  const pos = getPlayheadPosition()
  drawPlayhead(pos)
  if (isPlaying) requestAnimationFrame(animatePlayhead)
}
```

---

## Pattern: Autoplay policy

In Playwright E2E tests, launch Chromium with:
```ts
launchOptions: { args: ['--autoplay-policy=no-user-gesture-required'] }
```
In the real app, always create `AudioContext` inside a click/keydown handler — never at module load.

---

## Common mistakes to avoid

| Mistake | Consequence | Correct approach |
|---------|-------------|-----------------|
| Creating `AudioContext` at module load | Browser blocks audio, silent failure | Create inside user gesture handler |
| Reusing `AudioBufferSourceNode` | `InvalidStateError` at runtime | Create new node for every play |
| Transferring `AudioBuffer` to worker | `DataCloneError` | Transfer `Float32Array.buffer` instead |
| Testing `AudioContext` with jsdom | Tests pass, real app broken | Use Playwright for all playback tests |
| Not calling `URL.revokeObjectURL()` after download | Memory leak | Revoke in a `setTimeout` after anchor click |
