/**
 * Peak-normalize multi-channel audio data.
 *
 * Finds the maximum absolute sample value across all channels and scales
 * every channel by 1.0 / peak. A single gain factor is used for all channels
 * to preserve stereo balance. Silent input (peak === 0) is returned as
 * copied-but-unscaled arrays.
 *
 * Returns new Float32Array[] — does not mutate the input.
 */
export function normalizeChannelData(channels: Float32Array[]): Float32Array[] {
  let peak = 0
  for (const ch of channels) {
    for (let i = 0; i < ch.length; i++) {
      const abs = Math.abs(ch[i] ?? 0)
      if (abs > peak) peak = abs
    }
  }

  if (peak === 0) return channels.map(ch => ch.slice())

  const gain = 1.0 / peak
  return channels.map(ch => {
    const out = new Float32Array(ch.length)
    for (let i = 0; i < ch.length; i++) out[i] = (ch[i] ?? 0) * gain
    return out
  })
}
