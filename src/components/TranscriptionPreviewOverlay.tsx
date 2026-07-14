import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import { wordDiff } from "../utils/wordDiff";
import { useMicLevel } from "../hooks/useMicLevel";

type PreviewPhase = "listening" | "live" | "cleanup" | "final" | "changes" | "transformProcessing";

const FINAL_HIDE_DURATION_MS = 4000;
const CHANGES_HIDE_DURATION_MS = 6000;
const COPIED_RESET_MS = 1400;
const HIDE_ANIMATION_MS = 220;
const TARGET_WIDTH = 520;

export default function TranscriptionPreviewOverlay() {
  const { t } = useTranslation();
  const [rawText, setRawText] = useState("");
  const [finalText, setFinalText] = useState("");
  const [phase, setPhase] = useState<PreviewPhase>("listening");
  const [isVisible, setIsVisible] = useState(false);
  const [copied, setCopied] = useState(false);
  const [hasOverflow, setHasOverflow] = useState(false);
  const [countdownKey, setCountdownKey] = useState(0);
  const [changesId, setChangesId] = useState("");
  const [changesName, setChangesName] = useState("");
  const [changesBefore, setChangesBefore] = useState("");
  const [changesAfter, setChangesAfter] = useState("");
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const [processingName, setProcessingName] = useState("");

  const isRecording = phase === "listening" || phase === "live";
  const levels = useMicLevel(isRecording);
  const [time, setTime] = useState(0);

  useEffect(() => {
    if (!isRecording) return;
    let frameId;
    const tick = () => {
      setTime((t) => (t + 0.15) % (Math.PI * 2));
      frameId = requestAnimationFrame(tick);
    };
    tick();
    return () => {
      if (frameId) cancelAnimationFrame(frameId);
    };
  }, [isRecording]);

  const wavePaths = useMemo(() => {
    if (!isRecording) return [];
    
    const width = 180;
    const height = 32;
    const midY = height / 2;
    
    const waves = [
      { phase: 0, amp: 1.0, opacity: 0.6, strokeWidth: 1.5 },
      { phase: Math.PI / 3, amp: 0.75, opacity: 0.35, strokeWidth: 1.2 },
      { phase: (2 * Math.PI) / 3, amp: 0.45, opacity: 0.15, strokeWidth: 1.0 },
    ];
    
    return waves.map((w) => {
      const points = [];
      const numPoints = 8;
      const step = width / (numPoints - 1);
      
      for (let i = 0; i < numPoints; i++) {
        const x = i * step;
        const lvlIdx = Math.min(levels.length - 1, Math.floor((i / numPoints) * levels.length));
        const rawLevel = levels[lvlIdx] || 0.15;
        const angle = time + i * 0.8 + w.phase;
        const amplitude = (rawLevel - 0.12) * (height / 2) * w.amp;
        const y = midY + Math.sin(angle) * Math.max(1.5, amplitude);
        
        points.push({ x, y });
      }
      
      let pathStr = `M 0,${midY}`;
      for (let i = 0; i < points.length - 1; i++) {
        const p0 = points[i];
        const p1 = points[i + 1];
        const cpX = (p0.x + p1.x) / 2;
        pathStr += ` Q ${p0.x},${p0.y} ${cpX},${(p0.y + p1.y) / 2}`;
      }
      pathStr += ` T ${width},${midY}`;
      
      return { path: pathStr, opacity: w.opacity, strokeWidth: w.strokeWidth };
    });
  }, [levels, time, isRecording]);

  const renderWave = useCallback(() => {
    if (!isRecording) return null;
    return (
      <div className="flex items-center justify-center h-8 my-1 overflow-hidden w-full select-none pointer-events-none">
        <svg width="180" height="32" viewBox="0 0 180 32" className="overflow-visible">
          {wavePaths.map((w, idx) => (
            <path
              key={idx}
              d={w.path}
              fill="none"
              stroke="var(--color-primary)"
              strokeWidth={w.strokeWidth}
              strokeLinecap="round"
              opacity={w.opacity}
              className="transition-all duration-75"
            />
          ))}
        </svg>
      </div>
    );
  }, [isRecording, wavePaths]);

  const shellRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const phaseRef = useRef<PreviewPhase>("listening");
  const rawTextRef = useRef("");
  const hideTimerRef = useRef<number | null>(null);
  const copiedTimerRef = useRef<number | null>(null);
  const resetTimerRef = useRef<number | null>(null);

  useEffect(() => {
    phaseRef.current = phase;
  }, [phase]);

  useEffect(() => {
    rawTextRef.current = rawText;
  }, [rawText]);

  const clearTimer = (timerRef: { current: number | null }) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const clearLifecycleTimers = useCallback(() => {
    clearTimer(hideTimerRef);
    clearTimer(resetTimerRef);
  }, []);

  const resetCopyState = useCallback(() => {
    clearTimer(copiedTimerRef);
    copiedTimerRef.current = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, []);

  const startHideTimer = useCallback((delayMs: number) => {
    clearTimer(hideTimerRef);
    hideTimerRef.current = window.setTimeout(() => {
      window.electronAPI?.hideDictationPreview?.();
    }, delayMs);
  }, []);

  const activeText =
    phase === "changes"
      ? changesAfter
      : phase === "transformProcessing"
        ? ""
        : phase === "final"
          ? finalText || rawText
          : rawText;

  useEffect(() => {
    if (phase === "final" || phase === "changes") {
      setCountdownKey((k) => k + 1);
    }
  }, [phase]);

  const showFinalResult = useCallback(
    (text: string) => {
      const trimmed = text.trim();
      if (!trimmed) {
        window.electronAPI?.hideDictationPreview?.();
        return;
      }

      clearLifecycleTimers();
      setFinalText(trimmed);
      setPhase("final");
      setCopied(false);
      setIsVisible(true);
      startHideTimer(FINAL_HIDE_DURATION_MS);
    },
    [clearLifecycleTimers, startHideTimer]
  );

  const requestResize = useCallback(() => {
    if (!isVisible || !shellRef.current || !window.electronAPI?.resizeTranscriptionPreviewWindow) {
      return;
    }

    const nextHeight = Math.ceil(shellRef.current.getBoundingClientRect().height) + 16;
    window.electronAPI.resizeTranscriptionPreviewWindow(TARGET_WIDTH, nextHeight).catch(() => {});
  }, [isVisible]);

  useEffect(() => {
    if (!isVisible || !shellRef.current) return;

    const node = shellRef.current;
    const frameId = window.requestAnimationFrame(() => requestResize());
    const observer = new ResizeObserver(() => requestResize());
    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [isVisible, requestResize]);

  useEffect(() => {
    const el = textRef.current;
    if (!el) return;
    requestAnimationFrame(() => {
      el.scrollTop = el.scrollHeight;
      setHasOverflow(el.scrollHeight > el.clientHeight + 2);
    });
  }, [rawText, finalText, phase]);

  useEffect(() => {
    const handlePreviewText = window.electronAPI?.onPreviewText?.((incoming: string) => {
      clearLifecycleTimers();
      clearTimer(copiedTimerRef);
      setRawText(incoming?.trim?.() || "");
      setFinalText("");
      setCopied(false);
      setHasOverflow(false);
      setPhase(incoming?.trim?.() ? "live" : "listening");
      setIsVisible(true);
    });

    const handlePreviewAppend = window.electronAPI?.onPreviewAppend?.((chunk: string) => {
      const trimmedChunk = chunk?.trim?.();
      if (!trimmedChunk) return;

      setRawText((prev) => (prev ? `${prev} ${trimmedChunk}` : trimmedChunk));
      if (phaseRef.current !== "cleanup" && phaseRef.current !== "final") {
        setPhase("live");
      }
      setIsVisible(true);
    });

    const handlePreviewHold = window.electronAPI?.onPreviewHold?.((payload) => {
      clearTimer(hideTimerRef);
      setCopied(false);

      if (phaseRef.current === "final") return;

      if (payload?.showCleanup) {
        setPhase("cleanup");
      } else {
        showFinalResult(rawTextRef.current);
      }
    });

    const handlePreviewResult = window.electronAPI?.onPreviewResult?.((payload) => {
      const nextText = payload?.text?.trim?.();
      if (!nextText) {
        window.electronAPI?.hideDictationPreview?.();
        return;
      }

      showFinalResult(nextText);
    });

    const handlePreviewHide = window.electronAPI?.onPreviewHide?.(() => {
      clearLifecycleTimers();
      clearTimer(copiedTimerRef);
      setIsVisible(false);

      clearTimer(resetTimerRef);
      resetTimerRef.current = window.setTimeout(() => {
        setRawText("");
        setFinalText("");
        setCopied(false);
        setHasOverflow(false);
        setPhase("listening");
      }, HIDE_ANIMATION_MS);
    });

    // Win+Alt+O: redisplay the most recent transform's before/after in this
    // same overlay window instead of a new one.
    const handleTransformChanges = window.electronAPI?.onTransformChanges?.((payload) => {
      clearLifecycleTimers();
      clearTimer(copiedTimerRef);
      setChangesId(payload?.id || "");
      setChangesName(payload?.name || "");
      setChangesBefore(payload?.before || "");
      setChangesAfter(payload?.after || "");
      setVote(null);
      setCopied(false);
      setPhase("changes");
      setIsVisible(true);
      startHideTimer(CHANGES_HIDE_DURATION_MS);
    });

    // A transform's hotkey was pressed and its LLM call is running — no
    // fixed duration (unlike final/changes), stays until the run finishes
    // and either transform-changes or preview-hide replaces it.
    const handleTransformProcessing = window.electronAPI?.onTransformProcessing?.((payload) => {
      clearLifecycleTimers();
      clearTimer(copiedTimerRef);
      setProcessingName(payload?.name || "");
      setCopied(false);
      setPhase("transformProcessing");
      setIsVisible(true);
    });

    return () => {
      clearLifecycleTimers();
      clearTimer(copiedTimerRef);
      handlePreviewText?.();
      handlePreviewAppend?.();
      handlePreviewHold?.();
      handlePreviewResult?.();
      handlePreviewHide?.();
      handleTransformChanges?.();
      handleTransformProcessing?.();
    };
  }, [clearLifecycleTimers, showFinalResult, startHideTimer]);

  const handleCopy = useCallback(async () => {
    const textToCopy = activeText.trim();
    if (!textToCopy) return;

    try {
      const result = await window.electronAPI?.writeClipboard?.(textToCopy);
      if (result?.success === false) throw new Error("clipboard-write-failed");
    } catch {
      try {
        await navigator.clipboard.writeText(textToCopy);
      } catch {
        setCopied(false);
        return;
      }
    }

    setCopied(true);
    resetCopyState();
    if (phaseRef.current === "final" || phaseRef.current === "changes") {
      startHideTimer(
        phaseRef.current === "changes" ? CHANGES_HIDE_DURATION_MS : FINAL_HIDE_DURATION_MS
      );
      setCountdownKey((k) => k + 1);
    }
  }, [activeText, resetCopyState, startHideTimer]);

  const handleDismiss = useCallback(() => {
    window.electronAPI?.dismissDictationPreview?.();
  }, []);

  const diff = useMemo(() => wordDiff(changesBefore, changesAfter), [changesBefore, changesAfter]);

  const handleVote = useCallback(
    (nextVote: "up" | "down") => {
      setVote(nextVote);
      // Best-effort local feedback log (localStorage is user-mutable, so parse defensively).
      try {
        const parsed = JSON.parse(localStorage.getItem("transformFeedback") || "[]");
        const list = Array.isArray(parsed) ? parsed : [];
        list.push({
          ts: Date.now(),
          name: changesName,
          before: changesBefore,
          after: changesAfter,
          vote: nextVote,
        });
        localStorage.setItem("transformFeedback", JSON.stringify(list.slice(-100)));
      } catch {
        // ignore — feedback must never break the card
      }
    },
    [changesName, changesBefore, changesAfter]
  );

  const handleRetry = useCallback(() => {
    if (!changesId || !changesBefore.trim()) return;
    void window.electronAPI?.retryTransform?.({ id: changesId, text: changesBefore });
  }, [changesId, changesBefore]);

  const handleConfigure = useCallback(() => {
    void window.electronAPI?.openTransformsView?.();
  }, []);

  const suspendAutoHide = useCallback(() => {
    if (phaseRef.current === "changes") clearTimer(hideTimerRef);
  }, []);

  const resumeAutoHide = useCallback(() => {
    if (phaseRef.current === "changes") {
      startHideTimer(CHANGES_HIDE_DURATION_MS);
      setCountdownKey((k) => k + 1);
    }
  }, [startHideTimer]);

  const hasContent = rawText || finalText || phase === "changes" || phase === "transformProcessing";
  if (!hasContent && !isVisible) {
    return <div className="h-full w-full bg-transparent" />;
  }

  // The changes phase renders its own header ("N Changes"), so no status
  // label case for it here.
  const statusLabel =
    phase === "transformProcessing"
      ? t("transcriptionPreview.transformProcessing", {
          defaultValue: "{{name}}...",
          name: processingName,
        })
      : phase === "final"
        ? t("transcriptionPreview.ready", { defaultValue: "Ready" })
        : phase === "cleanup"
          ? t("transcriptionPreview.polishing", { defaultValue: "Polishing..." })
          : t("transcriptionPreview.listening", { defaultValue: "Listening..." });

  return (
    <div className="meeting-notification-window h-full w-full bg-transparent p-2">
      <div
        ref={shellRef}
        onMouseEnter={suspendAutoHide}
        onMouseLeave={resumeAutoHide}
        className={[
          "relative overflow-hidden rounded-xl border p-3 glassmorphic-card",
          phase === "changes"
            ? "border-white/10 bg-[#1c1a17]/95"
            : phase === "final"
              ? "border-emerald-500/22 shadow-[0_0_15px_rgba(16,185,129,0.06)]"
              : phase === "cleanup" || phase === "transformProcessing" || isRecording
                ? "border-accent-glowing animate-glow-pulse"
                : "border-border/35",
          isVisible ? "animate-spring-up" : "animate-spring-down"
        ].join(" ")}
      >
        {phase !== "changes" && (
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 min-w-0">
            {phase === "final" ? (
              <Check className="h-3.5 w-3.5 shrink-0 text-emerald-500/70" />
            ) : phase === "cleanup" || phase === "transformProcessing" ? (
              <div className="flex items-end gap-[2px] shrink-0 h-3.5">
                {[5, 9, 7].map((h, i) => (
                  <span
                    key={i}
                    className="w-[2px] rounded-full bg-accent/60"
                    style={{
                      height: h,
                      animation: "preview-bars 0.8s ease-in-out infinite",
                      animationDelay: `${i * 0.1}s`,
                    }}
                  />
                ))}
              </div>
            ) : (
              <span
                className={[
                  "block h-1.5 w-1.5 shrink-0 rounded-full animate-pulse",
                  rawText ? "bg-primary/70" : "bg-muted-foreground/30",
                ].join(" ")}
              />
            )}
            <span className="text-[12px] font-medium tracking-tight text-muted-foreground/70 truncate">
              {statusLabel}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            {activeText ? (
              <button
                onClick={handleCopy}
                className={[
                  "inline-flex h-6 items-center gap-1 rounded-md border px-1.5 text-[11px] font-medium transition-colors",
                  copied
                    ? "border-emerald-500/15 text-emerald-500/70"
                    : "border-border/30 text-muted-foreground/60 hover:border-border/50 hover:bg-background/40 hover:text-foreground/80",
                ].join(" ")}
              >
                {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                {copied
                  ? t("transcriptionPreview.copied", { defaultValue: "Copied" })
                  : t("transcriptionPreview.copy", { defaultValue: "Copy" })}
              </button>
            ) : null}

            <button
              onClick={handleDismiss}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground/40 transition-colors hover:bg-background/40 hover:text-muted-foreground/70"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        </div>
        )}

        {phase === "changes" ? (
          <div>
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] font-semibold text-white">
                {t("transcriptionPreview.changesCount", {
                  defaultValue: "{{count}} Changes",
                  count: diff.changeCount,
                })}
              </span>
              <button
                onClick={handleConfigure}
                className="shrink-0 text-[12px] font-medium text-white/85 transition-colors hover:text-white"
              >
                {t("transcriptionPreview.configureTransform", {
                  defaultValue: "Configure {{name}}",
                  name: changesName,
                })}
              </button>
            </div>

            <div className="preview-text-scroll mt-3 max-h-[180px] select-text overflow-y-auto text-[13px] leading-[2] text-white/90 break-words [text-wrap:pretty]">
              {diff.ops.map((op, i) =>
                op.type === "same" ? (
                  <span key={i}>{op.text} </span>
                ) : op.type === "del" ? (
                  <span key={i} className="text-white/35 line-through decoration-white/35">
                    {op.text}{" "}
                  </span>
                ) : (
                  <span key={i} className="rounded bg-emerald-400/20 px-1 py-0.5 text-emerald-200">
                    {op.text}{" "}
                  </span>
                )
              )}
            </div>

            <div className="mt-3 flex items-center gap-1">
              <button
                onClick={handleCopy}
                title={t("transcriptionPreview.copy", { defaultValue: "Copy" })}
                className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
              >
                {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
              <button
                onClick={() => handleVote("up")}
                title={t("transcriptionPreview.goodResult", { defaultValue: "Good result" })}
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10",
                  vote === "up" ? "text-emerald-300" : "text-white/55 hover:text-white",
                ].join(" ")}
              >
                <ThumbsUp className="h-3.5 w-3.5" />
              </button>
              <button
                onClick={() => handleVote("down")}
                title={t("transcriptionPreview.badResult", { defaultValue: "Bad result" })}
                className={[
                  "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors hover:bg-white/10",
                  vote === "down" ? "text-red-300" : "text-white/55 hover:text-white",
                ].join(" ")}
              >
                <ThumbsDown className="h-3.5 w-3.5" />
              </button>
              {!!changesId && (
                <button
                  onClick={handleRetry}
                  title={t("transcriptionPreview.retry", { defaultValue: "Retry" })}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-md text-white/55 transition-colors hover:bg-white/10 hover:text-white"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>
        ) : (
          !!activeText && (
            <div className="relative mt-2">
              {hasOverflow && (
                <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-5 rounded-t-lg bg-gradient-to-b from-background/60 to-transparent dark:from-surface-2/60" />
              )}

              <div
                ref={textRef}
                className={[
                  "preview-text-scroll rounded-lg border px-2.5 py-2 max-h-[220px] overflow-y-auto",
                  phase === "final"
                    ? "border-emerald-500/10 bg-emerald-500/[0.03]"
                    : phase === "cleanup"
                      ? "border-accent/12 bg-accent/[0.03]"
                      : "border-border/25 bg-background/30",
                ].join(" ")}
              >
                <p className="select-text text-[13px] leading-[1.52] text-foreground whitespace-pre-wrap break-words [text-wrap:pretty]">
                  {activeText}
                </p>
              </div>
              {phase === "live" && (
                <div className="mt-2.5 flex justify-center">
                  {renderWave()}
                </div>
              )}
            </div>
          )
        )}

        {phase === "listening" && !rawText && (
          <div className="mt-4 flex flex-col items-center justify-center gap-3 py-4 select-none pointer-events-none">
            {renderWave()}
            <span className="text-[12px] font-medium text-muted-foreground/50 tracking-wide animate-pulse">
              {t("transcriptionPreview.waitingForInput", { defaultValue: "Listening for voice..." })}
            </span>
          </div>
        )}

        {(phase === "final" || phase === "changes") && (
          <div className="absolute bottom-0 inset-x-0 h-[2px] overflow-hidden rounded-b-xl">
            <div
              key={countdownKey}
              className="h-full rounded-b-xl bg-emerald-500/25"
              style={{
                animation: `preview-countdown ${
                  phase === "changes" ? CHANGES_HIDE_DURATION_MS : FINAL_HIDE_DURATION_MS
                }ms linear forwards`,
              }}
            />
          </div>
        )}
      </div>

      <style>{`
        .glassmorphic-card {
          --shadow-base: 0 8px 32px 0 rgba(0, 0, 0, 0.08);
          --border-glow-inset: rgba(255, 255, 255, 0.3);
          --glow-intensity-base: 6%;
          --glow-intensity-pulse: 22%;
          opacity: 0;
          transform: translateY(18px) scale(0.94);
          background: rgba(255, 255, 255, 0.45);
          backdrop-filter: blur(28px) saturate(140%);
          -webkit-backdrop-filter: blur(28px) saturate(140%);
          border: 1px solid color-mix(in srgb, var(--color-primary) 18%, transparent);
          box-shadow: var(--shadow-base), 
                      0 0 1px 0 var(--border-glow-inset) inset,
                      0 0 12px 0 color-mix(in srgb, var(--color-primary) var(--glow-intensity-base), transparent);
        }
        .dark .glassmorphic-card {
          --shadow-base: 0 8px 32px 0 rgba(0, 0, 0, 0.24);
          --border-glow-inset: rgba(255, 255, 255, 0.1);
          --glow-intensity-base: 10%;
          --glow-intensity-pulse: 32%;
          background: rgba(18, 17, 16, 0.55);
          backdrop-filter: blur(28px) saturate(130%);
          -webkit-backdrop-filter: blur(28px) saturate(130%);
          border: 1px solid rgba(255, 255, 255, 0.08);
        }
        .glassmorphic-card.border-accent-glowing {
          border-color: var(--color-primary);
        }
        @keyframes glow-pulse {
          0%, 100% {
            box-shadow: var(--shadow-base),
                        0 0 1px 0 var(--border-glow-inset) inset,
                        0 0 12px 0 color-mix(in srgb, var(--color-primary) var(--glow-intensity-base), transparent);
          }
          50% {
            box-shadow: var(--shadow-base),
                        0 0 1px 0 var(--border-glow-inset) inset,
                        0 0 20px 3px color-mix(in srgb, var(--color-primary) var(--glow-intensity-pulse), transparent);
          }
        }
        .animate-glow-pulse {
          animation: glow-pulse 2.2s ease-in-out infinite;
        }
        @keyframes spring-up {
          0% {
            transform: translateY(18px) scale(0.94);
            opacity: 0;
          }
          70% {
            transform: translateY(-2px) scale(1.005);
            opacity: 1;
          }
          100% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
        }
        @keyframes spring-down {
          0% {
            transform: translateY(0) scale(1);
            opacity: 1;
          }
          100% {
            transform: translateY(14px) scale(0.95);
            opacity: 0;
          }
        }
        .animate-spring-up {
          animation: spring-up 0.42s cubic-bezier(0.23, 1, 0.32, 1) forwards;
        }
        .animate-spring-down {
          animation: spring-down 0.18s cubic-bezier(0.3, 0, 0.8, 0.15) forwards;
        }
        @keyframes preview-countdown {
          from { width: 100%; }
          to { width: 0%; }
        }
        .preview-text-scroll::-webkit-scrollbar { display: none; }
        .preview-text-scroll { scrollbar-width: none; }
      `}</style>
    </div>
  );
}
