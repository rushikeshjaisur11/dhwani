// Silence-aware chunking for live dictation typing. Buffered PCM is only cut
// at a pause so independently transcribed chunks never split a word. Pure
// function so it's unit-testable without audio hardware.

const DEFAULTS = {
  sampleRate: 16000,
  windowMs: 100, // RMS granularity
  silenceMs: 300, // consecutive quiet time that counts as a pause
  silenceRms: 0.008, // normalized RMS below this = quiet
  minChunkMs: 500, // don't emit chunks shorter than this
};

/**
 * Find the sample index to cut a live-typing chunk at, or null if the buffer
 * has no usable pause yet.
 *
 * Scans fixed windows for the LAST run of quiet windows spanning at least
 * silenceMs, and cuts at the middle of that run — both the emitted chunk and
 * the retained tail get half the pause as padding.
 *
 * @param {Int16Array} samples 16 kHz mono PCM
 * @param {object} [opts] override DEFAULTS
 * @returns {number|null} cut index (samples), always > 0 and < samples.length
 */
function findSilenceCut(samples, opts = {}) {
  const { sampleRate, windowMs, silenceMs, silenceRms, minChunkMs } = { ...DEFAULTS, ...opts };
  const windowSize = Math.floor((sampleRate * windowMs) / 1000);
  const windowCount = Math.floor(samples.length / windowSize);
  const quietWindowsNeeded = Math.ceil(silenceMs / windowMs);
  const minChunkSamples = Math.floor((sampleRate * minChunkMs) / 1000);
  if (windowCount < quietWindowsNeeded) return null;

  const quiet = new Array(windowCount);
  for (let w = 0; w < windowCount; w++) {
    let sumSq = 0;
    const start = w * windowSize;
    for (let i = start; i < start + windowSize; i++) {
      const n = samples[i] / 0x7fff;
      sumSq += n * n;
    }
    quiet[w] = Math.sqrt(sumSq / windowSize) < silenceRms;
  }

  // Last run of >= quietWindowsNeeded consecutive quiet windows.
  let runEnd = -1;
  let runLen = 0;
  for (let w = windowCount - 1; w >= 0; w--) {
    if (quiet[w]) {
      if (runEnd === -1) runEnd = w;
      runLen++;
      if (runLen >= quietWindowsNeeded) {
        const runStart = w;
        const cut = Math.floor(((runStart + runEnd + 1) / 2) * windowSize);
        if (cut < minChunkSamples) return null;
        if (cut >= samples.length) return null;
        return cut;
      }
    } else {
      runEnd = -1;
      runLen = 0;
    }
  }
  return null;
}

module.exports = { findSilenceCut, LIVE_TYPING_CUT_DEFAULTS: DEFAULTS };
