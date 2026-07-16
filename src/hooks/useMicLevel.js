import { useEffect, useRef, useState } from "react";

const BAR_COUNT = 14;

// ponytail: separate lightweight getUserMedia + AnalyserNode purely for the
// pill's waveform visual, independent of AudioManager's actual recording
// stream (which lives deep in audioManager.js). Two readers of the same mic
// is fine in browsers; this avoids touching the transcription-critical
// pipeline for a cosmetic effect. Unify into one stream later if desired.
export function useMicLevel(active) {
  const [levels, setLevels] = useState(() => new Array(BAR_COUNT).fill(0.15));
  const streamRef = useRef(null);
  const audioCtxRef = useRef(null);
  const rafRef = useRef(null);

  useEffect(() => {
    if (!active) {
      setLevels(new Array(BAR_COUNT).fill(0.15));
      return;
    }

    let cancelled = false;

    const start = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;

        const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
        const audioCtx = new AudioContextCtor();
        audioCtxRef.current = audioCtx;
        const source = audioCtx.createMediaStreamSource(stream);
        const analyser = audioCtx.createAnalyser();
        analyser.fftSize = 64;
        analyser.smoothingTimeConstant = 0.6;
        source.connect(analyser);

        const data = new Uint8Array(analyser.frequencyBinCount);
        // ~20fps is visually indistinguishable for the waveform but cuts
        // React state updates (and re-renders) to a third of 60fps rAF.
        const FRAME_INTERVAL_MS = 50;
        let lastFrame = 0;
        const tick = (now) => {
          if (now - lastFrame >= FRAME_INTERVAL_MS) {
            lastFrame = now;
            analyser.getByteFrequencyData(data);
            const step = Math.floor(data.length / BAR_COUNT) || 1;
            const next = new Array(BAR_COUNT).fill(0).map((_, i) => {
              const value = data[i * step] / 255;
              return Math.max(0.15, Math.min(1, value));
            });
            setLevels(next);
          }
          rafRef.current = requestAnimationFrame(tick);
        };
        tick(performance.now());
      } catch {
        // no mic permission — pill falls back to the static idle bar heights
      }
    };

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
      audioCtxRef.current?.close().catch(() => {});
      streamRef.current = null;
      audioCtxRef.current = null;
    };
  }, [active]);

  return levels;
}
