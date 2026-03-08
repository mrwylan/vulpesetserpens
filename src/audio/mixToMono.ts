/**
 * Mix a multi-channel audio buffer to mono by averaging channel samples.
 * Returns a new Float32Array — does not mutate inputs.
 */
export function mixToMono(channels: Float32Array[]): Float32Array {
  if (channels.length === 0) {
    return new Float32Array(0)
  }
  if (channels.length === 1) {
    // Single channel — return a copy to keep immutability
    return new Float32Array(channels[0]!)
  }

  const length = channels[0]!.length
  const mono = new Float32Array(length)
  const numChannels = channels.length

  for (let i = 0; i < length; i++) {
    let sum = 0
    for (let c = 0; c < numChannels; c++) {
      sum += channels[c]![i]!
    }
    mono[i] = sum / numChannels
  }

  return mono
}
