// Web Audio API waveform peak extraction — no charting library needed.
// decodeAudioPeaks() decodes a stored audio blob's ArrayBuffer into a small
// array of downsampled peaks (one per minimap pixel-column) for canvas rendering.

/**
 * Downsamples PCM channel data into `numPeaks` buckets, each holding the max
 * absolute sample amplitude in that bucket (0..1). Pure function — no DOM/Web
 * Audio dependency — so it's unit-testable without a browser AudioContext.
 */
export function computePeaks(channelData: Float32Array, numPeaks: number): Float32Array {
  const peaks = new Float32Array(numPeaks);
  if (channelData.length === 0 || numPeaks <= 0) return peaks;

  const blockSize = channelData.length / numPeaks;
  for (let i = 0; i < numPeaks; i++) {
    const start = Math.floor(i * blockSize);
    const end = i === numPeaks - 1 ? channelData.length : Math.floor((i + 1) * blockSize);
    let max = 0;
    for (let j = start; j < end; j++) {
      const abs = Math.abs(channelData[j]);
      if (abs > max) max = abs;
    }
    peaks[i] = max;
  }
  return peaks;
}

/**
 * Decodes a stored audio blob's ArrayBuffer via the Web Audio API and returns
 * downsampled peaks plus the real decoded duration (more reliable than the
 * WebM container's often-Infinity `duration` field).
 *
 * Takes a copy of `arrayBuffer` before decoding — `decodeAudioData` detaches
 * the buffer it's given, and callers (e.g. building a Blob for playback) may
 * still need the original.
 */
export async function decodeAudioPeaks(
  arrayBuffer: ArrayBuffer,
  numPeaks: number
): Promise<{ peaks: Float32Array; duration: number }> {
  const AudioContextCtor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  const ctx = new AudioContextCtor();
  try {
    const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
    const channelData = decoded.getChannelData(0);
    return { peaks: computePeaks(channelData, numPeaks), duration: decoded.duration };
  } finally {
    void ctx.close();
  }
}
