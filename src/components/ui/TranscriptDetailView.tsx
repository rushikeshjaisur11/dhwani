import { useState, useEffect, useRef } from "react";
import { ChevronLeft, Play, Pause, Copy, BadgeInfo, LayoutTemplate, Sparkles, X } from "lucide-react";
import type { TranscriptionItem } from "../../types/electron";
import { normalizeDbDate } from "../../utils/dateFormatting";
import { cn } from "../lib/utils";
import { categorizeApp } from "../../utils/appCategory";
import { useSettingsStore } from "../../stores/settingsStore";

interface TranscriptDetailViewProps {
  transcript: TranscriptionItem;
  onBack?: () => void;
  onClose?: () => void;
  t: (key: string, opts?: Record<string, unknown>) => string;
}

export default function TranscriptDetailView({
  transcript,
  onBack,
  onClose,
  t,
}: TranscriptDetailViewProps) {
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);

  const styleToneWork = useSettingsStore((s) => s.styleToneWork);
  const styleToneEmail = useSettingsStore((s) => s.styleToneEmail);
  const styleTonePersonal = useSettingsStore((s) => s.styleTonePersonal);
  const styleToneOther = useSettingsStore((s) => s.styleToneOther);
  const cleanupModel = useSettingsStore((s) => s.cleanupModel);

  const personalizedStyles = {
    work: styleToneWork,
    email: styleToneEmail,
    personal: styleTonePersonal,
    other: styleToneOther
  };

  let appliedStyleLabel = "Polished";
  let exactAppName = "";
  if (transcript.target_app) {
    const category = categorizeApp(transcript.target_app);
    const styleKey = personalizedStyles[category as keyof typeof personalizedStyles];
    if (styleKey && styleKey !== "off") {
      const translated = t(`settingsPage.general.personalizedStyles.${styleKey}.label`, { defaultValue: styleKey });
      appliedStyleLabel = translated.charAt(0).toUpperCase() + translated.slice(1);
      
      exactAppName = transcript.target_app
        .replace(/\.exe$/i, '')
        .replace(/-/g, ' ')
        .replace(/\b\w/g, c => c.toUpperCase());
    }
  }

  useEffect(() => {
    let url = "";
    if (transcript.has_audio) {
      window.electronAPI?.getAudioBuffer?.(transcript.id).then((buffer) => {
        if (buffer) {
          const blob = new Blob([buffer], { type: "audio/webm" });
          url = URL.createObjectURL(blob);
          setAudioUrl(url);
        }
      });
    }
    return () => {
      if (url) URL.revokeObjectURL(url);
    };
  }, [transcript.id, transcript.has_audio]);

  const togglePlay = () => {
    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      const current = audioRef.current.currentTime;
      let duration = audioRef.current.duration;
      
      // Fallback for WebM Infinity duration bug
      if (!isFinite(duration) && transcript.audio_duration_ms) {
        duration = transcript.audio_duration_ms / 1000;
      }
      
      if (isFinite(duration) && duration > 0) {
        setProgress((current / duration) * 100);
      }
    }
  };

  const handleSeek = (e: React.MouseEvent<HTMLDivElement>) => {
    if (audioRef.current) {
      let duration = audioRef.current.duration;
      
      if (!isFinite(duration) && transcript.audio_duration_ms) {
        duration = transcript.audio_duration_ms / 1000;
      }
      
      if (isFinite(duration) && duration > 0) {
        const rect = e.currentTarget.getBoundingClientRect();
        const pos = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        audioRef.current.currentTime = pos * duration;
      }
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-gradient-to-br from-background/40 to-background/10">
      {/* Sleek App-bar Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-white/5 bg-black/5 dark:bg-white-[0.02] backdrop-blur-md">
        {onBack && (
          <button
            onClick={onBack}
            className="p-1.5 rounded-full hover:bg-black/10 dark:hover:bg-white/10 active:scale-95 transition-all text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft size={18} />
          </button>
        )}
        <div className="flex-1 min-w-0 flex items-center gap-3">
          <div className="flex flex-col">
            <h2 className="text-sm font-semibold text-foreground/90 tracking-tight truncate">
              {normalizeDbDate(transcript.created_at).toLocaleString(undefined, { 
                month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
              })}
            </h2>
            <div className="flex items-center gap-1.5 mt-0.5 text-[10px] font-medium text-muted-foreground/60 uppercase tracking-wider">
              <span>{transcript.provider}</span>
              <span className="w-1 h-1 rounded-full bg-border/50" />
              <span>{transcript.model}</span>
            </div>
          </div>
          
          {transcript.text !== transcript.raw_text && (
            <div className="ml-auto flex items-center gap-2">
              {exactAppName && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/10 dark:bg-white/5 border border-black/5 dark:border-white/10 text-muted-foreground text-[10px] font-semibold uppercase tracking-widest shadow-sm">
                  <LayoutTemplate size={12} className="opacity-70" />
                  {exactAppName}
                </div>
              )}
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-gradient-to-r from-primary/10 to-primary/5 border border-primary/20 text-primary text-[10px] font-bold uppercase tracking-widest shadow-[0_0_15px_rgba(var(--primary),0.1)]">
                <Sparkles size={12} className="opacity-80" />
                {appliedStyleLabel}
              </div>
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-black/5 dark:bg-white/5 border border-black/10 dark:border-white/10 text-muted-foreground text-[10px] font-medium uppercase tracking-widest">
                <span>{cleanupModel || "Default Model"}</span>
              </div>
            </div>
          )}
        </div>
        {onClose && (
          <button
            onClick={onClose}
            className="p-1.5 rounded-full bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10 active:scale-95 transition-all text-muted-foreground/70 hover:text-foreground ml-2"
          >
            <X size={16} />
          </button>
        )}
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
        {/* Sleek Audio Player */}
        {audioUrl ? (
          <div className="group relative flex items-center gap-5 p-4 rounded-2xl bg-gradient-to-r from-background/80 to-muted/30 border border-white/5 shadow-[0_4px_24px_-8px_rgba(0,0,0,0.2)] overflow-hidden">
            <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none" />
            
            <button
              onClick={togglePlay}
              className="relative w-12 h-12 flex shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-[0_0_20px_rgba(var(--primary),0.3)] hover:scale-105 active:scale-95 hover:shadow-[0_0_30px_rgba(var(--primary),0.5)] transition-all duration-300 outline-none"
            >
              {isPlaying ? <Pause size={20} className="fill-current" /> : <Play size={20} className="fill-current ml-1" />}
            </button>
            
            <div className="flex-1 space-y-2.5 pr-2 relative z-10">
              <div className="flex justify-between items-center text-[10px] font-mono font-medium text-muted-foreground/60 px-1">
                <span>Audio Recording</span>
                <span>{Math.round(progress)}%</span>
              </div>
              <div 
                className="h-1.5 w-full bg-black/10 dark:bg-white/10 rounded-full overflow-hidden cursor-pointer relative hover:h-2 transition-all duration-200"
                onClick={handleSeek}
              >
                <div 
                  className="h-full bg-gradient-to-r from-primary/80 to-primary rounded-full transition-all duration-75 ease-linear relative shadow-[0_0_10px_rgba(var(--primary),0.5)]"
                  style={{ width: `${progress}%` }}
                />
              </div>
            </div>

            <audio
              ref={audioRef}
              src={audioUrl}
              onEnded={() => setIsPlaying(false)}
              onTimeUpdate={handleTimeUpdate}
              className="hidden"
            />
          </div>
        ) : (
          <div className="flex items-center justify-center p-6 rounded-2xl border border-dashed border-white/10 bg-white/5 text-xs text-muted-foreground/50 font-medium">
            No audio recording available for this transcript.
          </div>
        )}

        <div className="space-y-6">
          {/* Polished Text */}
          <div className="group/card relative">
            <div className="flex items-center justify-between mb-3 px-1">
              <h3 className="text-[11px] font-bold text-foreground/80 uppercase tracking-widest flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                Polished Result
              </h3>
              <button 
                onClick={() => navigator.clipboard.writeText(transcript.text)}
                className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground hover:text-foreground transition-all active:scale-95 opacity-0 group-hover/card:opacity-100"
              >
                <Copy size={12} /> Copy
              </button>
            </div>
            <div className="relative p-5 bg-gradient-to-br from-background to-muted/20 rounded-2xl border border-white/10 shadow-[0_8px_30px_rgb(0,0,0,0.12)] text-[14px] text-foreground/95 leading-[1.7] tracking-tight selection:bg-primary/30">
              {transcript.text}
            </div>
          </div>

          {/* Raw Text */}
          {transcript.raw_text && transcript.raw_text !== transcript.text && (
            <div className="group/card relative pt-4">
              <div className="flex items-center justify-between mb-3 px-1">
                <h3 className="text-[11px] font-bold text-muted-foreground/50 uppercase tracking-widest">
                  Original (Raw)
                </h3>
                <button 
                  onClick={() => navigator.clipboard.writeText(transcript.raw_text!)}
                  className="text-[10px] font-bold uppercase tracking-wider flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-white/5 hover:bg-white/10 text-muted-foreground/60 hover:text-foreground transition-all active:scale-95 opacity-0 group-hover/card:opacity-100"
                >
                  <Copy size={12} /> Copy
                </button>
              </div>
              <div className="relative p-5 bg-black/10 dark:bg-white/[0.02] rounded-2xl border border-dashed border-white/10 text-[13px] text-muted-foreground/70 leading-[1.6] tracking-tight">
                {transcript.raw_text}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
