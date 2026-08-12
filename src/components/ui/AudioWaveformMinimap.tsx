import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { decodeAudioPeaks } from "../../utils/audioWaveform";
import { cn } from "../lib/utils";

const NUM_PEAKS = 300; // ~one bucket per pixel-column at typical minimap widths

interface AudioWaveformMinimapProps {
  /** Raw audio bytes for the note/transcript's saved recording. `null`/`undefined` renders nothing. */
  audioBuffer: ArrayBuffer | null | undefined;
  /** Playback duration in seconds, used as a fallback until the buffer is decoded. */
  fallbackDurationSeconds?: number | null;
  /** Current playback position in seconds, for the playhead indicator. */
  currentTime: number;
  /** Called with the target time in seconds when the user clicks the waveform. */
  onSeek: (time: number) => void;
  className?: string;
}

/**
 * Compact click-to-seek waveform rendered from a note/transcript's saved
 * audio via the Web Audio API (no charting library). Peaks are decoded once
 * per `audioBuffer` reference and cached for the component's lifetime.
 */
export default function AudioWaveformMinimap({
  audioBuffer,
  fallbackDurationSeconds,
  currentTime,
  onSeek,
  className,
}: AudioWaveformMinimapProps) {
  const { t } = useTranslation();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [peaks, setPeaks] = useState<Float32Array | null>(null);
  const [decodedDuration, setDecodedDuration] = useState<number | null>(null);
  const [isDecoding, setIsDecoding] = useState(false);

  useEffect(() => {
    setPeaks(null);
    setDecodedDuration(null);
    if (!audioBuffer) return;

    let cancelled = false;
    setIsDecoding(true);
    decodeAudioPeaks(audioBuffer, NUM_PEAKS)
      .then(({ peaks: decodedPeaks, duration }) => {
        if (cancelled) return;
        setPeaks(decodedPeaks);
        setDecodedDuration(duration);
      })
      .catch(() => {
        // ponytail: silent — the click-to-seek fallback (audio element's own
        // seek bar, if present) still works if waveform decode fails.
      })
      .finally(() => {
        if (!cancelled) setIsDecoding(false);
      });

    return () => {
      cancelled = true;
    };
  }, [audioBuffer]);

  const duration = useMemo(
    () => decodedDuration ?? fallbackDurationSeconds ?? 0,
    [decodedDuration, fallbackDurationSeconds]
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !peaks) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;
    const mid = height / 2;
    ctx.clearRect(0, 0, width, height);

    const barWidth = width / peaks.length;
    const waveColor = getComputedStyle(canvas).color || "#6d4fe0";
    ctx.fillStyle = waveColor;
    for (let i = 0; i < peaks.length; i++) {
      const barHeight = Math.max(1, peaks[i] * height);
      ctx.globalAlpha = 0.75;
      ctx.fillRect(i * barWidth, mid - barHeight / 2, Math.max(1, barWidth - 1), barHeight);
    }

    if (duration > 0 && currentTime >= 0) {
      const playheadX = Math.min(width, (currentTime / duration) * width);
      ctx.globalAlpha = 1;
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(playheadX, 0, 1.5, height);
    }
  }, [peaks, currentTime, duration]);

  if (!audioBuffer) return null;

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (duration <= 0) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const fraction = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(fraction * duration);
  };

  return (
    <div className={cn("relative w-full h-10", className)}>
      {isDecoding && !peaks && (
        <div className="absolute inset-0 flex items-center justify-center text-[10px] text-muted-foreground/50 font-medium">
          {t("notes.waveform.loading")}
        </div>
      )}
      {peaks && (
        <canvas
          ref={canvasRef}
          width={NUM_PEAKS}
          height={40}
          onClick={handleClick}
          className="w-full h-full cursor-pointer text-primary"
        />
      )}
    </div>
  );
}
