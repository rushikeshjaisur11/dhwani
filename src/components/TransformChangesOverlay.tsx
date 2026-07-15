import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Check, Copy, RotateCcw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useTranslation } from "react-i18next";
import { wordDiff } from "../utils/wordDiff";

interface TransformChangesPayload {
  id: string | number;
  name: string;
  before: string;
  after: string;
}

const HIDE_DURATION_MS = 10000;
const COPIED_RESET_MS = 1400;

// Renders inside the shared transcription-preview BrowserWindow when it's
// opened for Win+Alt+O (redisplay last transform's before/after). The
// window is also used for the plain live-dictation preview, but nothing
// currently sends those events (see windowManager.js's preview-* senders),
// so this component only needs to handle "transform-changes".
export default function TransformChangesOverlay() {
  const { t } = useTranslation();
  const [changes, setChanges] = useState<TransformChangesPayload | null>(null);
  const [copied, setCopied] = useState(false);
  const [vote, setVote] = useState<"up" | "down" | null>(null);
  const cardRef = useRef<HTMLDivElement | null>(null);

  // Reports the card's real rendered height so the main process can resize
  // and reposition the window to hug it — a fixed guess height would either
  // clip long diffs or float far above the pill for short ones.
  useEffect(() => {
    const node = cardRef.current;
    if (!node) return;

    const OUTER_PADDING = 16; // the wrapper div's p-2 on all sides
    const reportSize = () => {
      const rect = node.getBoundingClientRect();
      window.electronAPI?.resizeTranscriptionPreviewWindow?.(
        Math.ceil(rect.width) + OUTER_PADDING,
        Math.ceil(rect.height) + OUTER_PADDING
      );
    };

    const frameId = window.requestAnimationFrame(reportSize);
    const observer = new ResizeObserver(reportSize);
    observer.observe(node);

    return () => {
      window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [changes]);

  useEffect(() => {
    let hideTimer: number | null = null;

    const cleanup = window.electronAPI?.onTransformChanges?.((payload: TransformChangesPayload) => {
      setChanges(payload);
      setVote(null);
      setCopied(false);
      if (hideTimer) window.clearTimeout(hideTimer);
      hideTimer = window.setTimeout(
        () => window.electronAPI?.hideTranscriptionPreview?.(),
        HIDE_DURATION_MS
      );
    });

    return () => {
      if (hideTimer) window.clearTimeout(hideTimer);
      cleanup?.();
    };
  }, []);

  const diff = useMemo(
    () => wordDiff(changes?.before || "", changes?.after || ""),
    [changes?.before, changes?.after]
  );

  const handleCopy = useCallback(async () => {
    const text = (changes?.after || "").trim();
    if (!text) return;
    try {
      const result = await window.electronAPI?.writeClipboard?.(text);
      if (result?.success === false) throw new Error("clipboard-write-failed");
    } catch {
      try {
        await navigator.clipboard.writeText(text);
      } catch {
        return;
      }
    }
    setCopied(true);
    window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
  }, [changes?.after]);

  const handleVote = useCallback(
    (next: "up" | "down") => {
      setVote(next);
      try {
        const parsed = JSON.parse(localStorage.getItem("transformFeedback") || "[]");
        const list = Array.isArray(parsed) ? parsed : [];
        list.push({ ts: Date.now(), name: changes?.name, before: changes?.before, after: changes?.after, vote: next });
        localStorage.setItem("transformFeedback", JSON.stringify(list.slice(-100)));
      } catch {
        // feedback must never break the card
      }
    },
    [changes]
  );

  const handleRetry = useCallback(() => {
    if (!changes?.id || !changes.before.trim()) return;
    void window.electronAPI?.retryTransform?.({ id: String(changes.id), text: changes.before });
  }, [changes]);

  const handleConfigure = useCallback(() => {
    void window.electronAPI?.openTransformsView?.();
  }, []);

  if (!changes) return null;

  return (
    <div className="meeting-notification-window h-full w-full bg-transparent p-2">
      <div
        ref={cardRef}
        className="relative overflow-hidden rounded-xl border border-white/10 bg-[#1c1a17]/95 p-3"
      >
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
              name: changes.name,
            })}
          </button>
        </div>

        <div className="preview-text-scroll mt-3 max-h-[220px] select-text overflow-y-auto text-[13px] leading-[2] text-white/90 break-words [text-wrap:pretty]">
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
          {!!changes.id && (
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
    </div>
  );
}
