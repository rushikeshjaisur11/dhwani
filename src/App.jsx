import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import {
  Check,
  ChevronDown,
  ChevronUp,
  Loader2,
  Mic,
  Settings,
  Sparkles,
  SquarePen,
  X,
} from "lucide-react";
import { useToast } from "./components/ui/useToast";
import { useHotkey } from "./hooks/useHotkey";
import { formatHotkeyLabel } from "./utils/hotkeys";
import { useWindowDrag } from "./hooks/useWindowDrag";
import { useAudioRecording } from "./hooks/useAudioRecording";
import { useMicLevel } from "./hooks/useMicLevel";
import { usePolish } from "./hooks/usePolish";
import { useTransform } from "./hooks/useTransform";
import { useSettingsStore } from "./stores/settingsStore";
import { getEffectiveTransformsSync } from "./config/transforms/loadEffectiveTransforms";
import { Toggle } from "./components/ui/toggle";
import {
  LiveWaveform,
  SiriOrbVisualizer,
  NeonPulseVisualizer,
  ParticleSwarmVisualizer,
  RippleWaveVisualizer,
  LiquidPlasmaVisualizer,
  WavelineVisualizer,
  SpectrumVisualizer,
} from "./components/flowbar/visualizers";

// White pill tooltip opening to the left of a dock icon (Wispr style):
// "Dictate **Ctrl + Win**", "Scratchpad", "Polish **Win Alt 1**".
const Tooltip = ({ children, label, hotkey, offset = 10, enabled = true, direction = "up" }) => {
  const [isVisible, setIsVisible] = useState(false);
  // Extra horizontal nudge (px) on top of the base -50% centering, applied
  // after measuring the actual rendered rect. The dock's window is only
  // ~240px wide and icons near its edges (the sparkle in particular) sit
  // close to the window's own boundary -- Electron hard-clips anything
  // that renders past that boundary (no ellipsis, just a raw cut mid-
  // character), so pure CSS centering isn't enough near the edges.
  const [edgeNudge, setEdgeNudge] = useState(0);
  const tooltipRef = useRef(null);
  const isDown = direction === "down";

  useLayoutEffect(() => {
    if (!isVisible || !tooltipRef.current) return;
    setEdgeNudge(0);
    const rect = tooltipRef.current.getBoundingClientRect();
    const margin = 4;
    let nudge = 0;
    if (rect.right > window.innerWidth - margin) {
      nudge = window.innerWidth - margin - rect.right;
    } else if (rect.left < margin) {
      nudge = margin - rect.left;
    }
    if (nudge !== 0) setEdgeNudge(nudge);
  }, [isVisible, label, hotkey]);

  return (
    <div className="relative">
      <div
        onMouseEnter={() => enabled && setIsVisible(true)}
        onMouseLeave={() => setIsVisible(false)}
      >
        {children}
      </div>
      {isVisible && (
        <div
          ref={tooltipRef}
          className={`flow-tooltip-pill absolute left-1/2 z-10 max-w-[190px] truncate ${
            isDown ? "top-full" : "bottom-full"
          }`}
          style={{
            transform: `translateX(calc(-50% + ${edgeNudge}px))`,
            ...(isDown ? { marginTop: offset } : { marginBottom: offset }),
          }}
        >
          {label}
          {hotkey ? <span className="font-semibold"> {hotkey}</span> : null}
        </div>
      )}
    </div>
  );
};

const IDLE_PEEK_DELAY_MS = 5000;

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isPeeking, setIsPeeking] = useState(false);
  // The dock's native window resize (isExpanded -> resizeMainWindow IPC) is
  // async and not instant — a fast mouse can reach the sparkle/arrow's
  // screen position before the window has actually widened to STACK, and
  // since Electron clips content to the window's real bounds, that content
  // gets hard-clipped at the (still narrow) edge — looks like it "vanishes",
  // but it's really just rendered outside the window's current canvas. Delay
  // the finer hover-reveal content (tooltip, transform-menu arrow) briefly
  // after expanding so the resize has time to land first.
  const [dockReady, setDockReady] = useState(false);
  // Which side the dock's popups (tooltips, transform menu, streaming
  // preview) open on. Mirrors whichever direction resizeMainWindow actually
  // used (it prefers "up" but falls back to "down" near the top of the
  // screen) so the dock's own on-screen anchor point never jumps.
  const [dockDirection, setDockDirection] = useState("up");
  const [isTransformMenuOpen, setIsTransformMenuOpen] = useState(false);
  // { mode: "processing", name } | { mode: "done" } | null — transform runs
  const [transformStatus, setTransformStatus] = useState(null);
  const menuRef = useRef(null);
  const buttonRef = useRef(null);
  const sparkleRef = useRef(null);
  const { toast, dismiss, toastCount } = useToast();
  const { t } = useTranslation();
  const { hotkey } = useHotkey();
  const { isDragging, handleMouseDown, handleMouseUp } = useWindowDrag();

  const [dragStartPos, setDragStartPos] = useState(null);
  const [hasDragged, setHasDragged] = useState(false);

  // Overlay transform menu state (localStorage-backed, shared with
  // useAudioRecording's Auto Apply step and the settings window).
  const [autoApply, setAutoApply] = useState(
    () => localStorage.getItem("autoApplyAfterDictation") === "true"
  );
  const [autoApplyTransformId, setAutoApplyTransformId] = useState(
    () => localStorage.getItem("autoApplyTransformId") || "builtin-polish"
  );
  const [scratchpadInFlowBar, setScratchpadInFlowBar] = useState(
    () => localStorage.getItem("scratchpadAddToFlowBar") === "true"
  );
  const [transforms, setTransforms] = useState(() => getEffectiveTransformsSync());

  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const voiceVisualizerStyle = useSettingsStore((s) => s.voiceVisualizerStyle);
  const flowBarPillStyle = useSettingsStore((s) => s.flowBarPillStyle);
  const idleOrbAnimation = useSettingsStore((s) => s.idleOrbAnimation);
  const polishKey = useSettingsStore((s) => s.polishKey);
  const prevAutoHideRef = useRef(floatingIconAutoHide);
  const showStreamingPreview = useSettingsStore((s) => s.showStreamingPreview);
  const autoPasteEnabled = useSettingsStore((s) => s.autoPasteEnabled);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "scratchpadAddToFlowBar") {
        setScratchpadInFlowBar(event.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  useEffect(() => {
    const disposeProcessing = window.electronAPI?.onTransformProcessing?.((payload) => {
      setTransformStatus(payload?.name ? { mode: "processing", name: payload.name } : null);
    });
    const disposeDone = window.electronAPI?.onTransformDone?.(() => {
      setTransformStatus({ mode: "done" });
    });
    return () => {
      disposeProcessing?.();
      disposeDone?.();
    };
  }, []);

  useEffect(() => {
    if (!transformStatus) return;
    const delay = transformStatus.mode === "done" ? 6000 : 120000;
    const timer = setTimeout(() => setTransformStatus(null), delay);
    return () => clearTimeout(timer);
  }, [transformStatus]);

  useEffect(() => {
    const unsubscribeFallback = window.electronAPI?.onHotkeyFallbackUsed?.((data) => {
      toast({
        title: t("app.toasts.hotkeyChanged.title"),
        description: t("app.toasts.hotkeyChanged.description", {
          original: data.original,
          fallback: data.fallback,
        }),
        duration: 8000,
      });
    });

    const unsubscribeFailed = window.electronAPI?.onHotkeyRegistrationFailed?.((_data) => {
      toast({
        title: t("app.toasts.hotkeyUnavailable.title"),
        description: t("app.toasts.hotkeyUnavailable.description"),
        duration: 10000,
      });
    });

    const unsubscribeCorrections = window.electronAPI?.onCorrectionsLearned?.((words) => {
      if (words && words.length > 0) {
        const wordList = words.map((w) => `“${w}”`).join(", ");
        let toastId;
        toastId = toast({
          title: t("app.toasts.addedToDict", { words: wordList }),
          variant: "success",
          duration: 6000,
          action: (
            <button
              onClick={async () => {
                try {
                  const result = await window.electronAPI?.undoLearnedCorrections?.(words);
                  if (result?.success) {
                    dismiss(toastId);
                  }
                } catch {
                }
              }}
              className="text-[10px] font-medium px-2.5 py-1 rounded-sm whitespace-nowrap
                text-emerald-100/90 hover:text-white
                bg-emerald-500/15 hover:bg-emerald-500/25
                border border-emerald-400/20 hover:border-emerald-400/35
                transition-all duration-150"
            >
              {t("app.toasts.undo")}
            </button>
          ),
        });
      }
    });

    return () => {
      unsubscribeFallback?.();
      unsubscribeFailed?.();
      unsubscribeCorrections?.();
    };
  }, [toast, dismiss, t]);

  useEffect(() => {
    if (isTransformMenuOpen || toastCount > 0 || transformStatus) {
      setWindowInteractivity(true);
    } else if (!isHovered) {
      setWindowInteractivity(false);
    }
  }, [isTransformMenuOpen, isHovered, toastCount, transformStatus, setWindowInteractivity]);

  const handleDictationToggle = React.useCallback(() => {
    setIsTransformMenuOpen(false);
    setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  const {
    isRecording,
    isProcessing,
    isCommandMode,
    toggleListening,
    cancelRecording,
    cancelProcessing,
    isStreaming,
    transcript,
    partialTranscript,
  } = useAudioRecording(toast, {
    onToggle: handleDictationToggle,
  });

  const micLevels = useMicLevel(isRecording);

  const statusPill = React.useMemo(
    () => transformStatus || (isProcessing ? { mode: "processing" } : null),
    [transformStatus, isProcessing]
  );

  useEffect(() => {
    if (isHovered || isTransformMenuOpen || isRecording || toastCount > 0) {
      setIsExpanded(true);
      return;
    }
    const timer = setTimeout(() => setIsExpanded(false), 300);
    return () => clearTimeout(timer);
  }, [isHovered, isTransformMenuOpen, isRecording, toastCount]);

  useEffect(() => {
    if (!isExpanded) {
      setDockReady(false);
      return;
    }
    const timer = setTimeout(() => setDockReady(true), 120);
    return () => clearTimeout(timer);
  }, [isExpanded]);

  useEffect(() => {
    const applyDirection = (result) => {
      if (result?.direction) setDockDirection(result.direction);
    };
    const resizeWindow = async () => {
      let result;
      if (isTransformMenuOpen && toastCount > 0) {
        result = await window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isTransformMenuOpen) {
        result = await window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        result = await window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else if (statusPill) {
        result = await window.electronAPI?.resizeMainWindow?.("WIDE");
      } else if (isRecording) {
        result = await window.electronAPI?.resizeMainWindow?.("RECORDING");
      } else if (isExpanded) {
        result = await window.electronAPI?.resizeMainWindow?.("STACK");
      } else {
        result = await window.electronAPI?.resizeMainWindow?.("BASE");
      }
      applyDirection(result);
    };
    resizeWindow();
  }, [isTransformMenuOpen, toastCount, isRecording, statusPill, isExpanded]);

  // Idle-peek: slide the idle orb almost entirely off the right edge of
  // the screen after a stretch of no interaction, leaving a thin sliver
  // visible (matches the old vertical handle's low-footprint idle look).
  // Any real activity -- hovering, expanding, recording, a status pill,
  // a toast -- both cancels a pending peek and restores an active one.
  useEffect(() => {
    const idleNow =
      !isExpanded && !isRecording && !isHovered && !isTransformMenuOpen && !statusPill && toastCount === 0;

    if (!idleNow) {
      if (isPeeking) {
        window.electronAPI?.setMainWindowPeek?.(false);
        setIsPeeking(false);
      }
      return;
    }

    const timer = setTimeout(() => {
      window.electronAPI?.setMainWindowPeek?.(true);
      setIsPeeking(true);
    }, IDLE_PEEK_DELAY_MS);

    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isExpanded, isRecording, isHovered, isTransformMenuOpen, statusPill, toastCount]);

  usePolish(toast, t);
  useTransform(toast, t);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onFloatingIconAutoHideChanged?.((enabled) => {
      localStorage.setItem("floatingIconAutoHide", String(enabled));
      useSettingsStore.setState({ floatingIconAutoHide: enabled });
    });
    return () => unsubscribe?.();
  }, []);

  const isRecordingRef = useRef(isRecording);

  useLayoutEffect(() => {
    isRecordingRef.current = isRecording;
  }, [isRecording]);

  useEffect(() => {
    const unsubscribe = window.electronAPI?.onCancelHotkeyPressed?.(() => {
      if (isRecordingRef.current) cancelRecording();
    });
    return () => unsubscribe?.();
  }, [cancelRecording]);

  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      hideTimeout = setTimeout(() => {
        window.electronAPI?.hideWindow?.();
      }, 500);
    } else if (!floatingIconAutoHide && prevAutoHideRef.current) {
      window.electronAPI?.showDictationPanel?.();
    }

    prevAutoHideRef.current = floatingIconAutoHide;
    return () => clearTimeout(hideTimeout);
  }, [isRecording, isProcessing, floatingIconAutoHide, toastCount]);

  const handleClose = () => {
    window.electronAPI.hideWindow();
  };

  useEffect(() => {
    if (!isTransformMenuOpen || isHovered) return;
    const timer = setTimeout(() => setIsTransformMenuOpen(false), 600);
    return () => clearTimeout(timer);
  }, [isTransformMenuOpen, isHovered]);

  useEffect(() => {
    if (!isTransformMenuOpen) {
      return;
    }

    const handleClickOutside = (event) => {
      if (
        menuRef.current &&
        !menuRef.current.contains(event.target) &&
        sparkleRef.current &&
        !sparkleRef.current.contains(event.target)
      ) {
        setIsTransformMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isTransformMenuOpen]);

  useEffect(() => {
    const handleKeyPress = (e) => {
      if (e.key === "Escape") {
        if (isTransformMenuOpen) {
          setIsTransformMenuOpen(false);
        } else {
          handleClose();
        }
      }
    };

    document.addEventListener("keydown", handleKeyPress);
    return () => document.removeEventListener("keydown", handleKeyPress);
  }, [isTransformMenuOpen]);

  const toggleTransformMenu = () => {
    setIsTransformMenuOpen((prev) => {
      if (!prev) setTransforms(getEffectiveTransformsSync());
      return !prev;
    });
  };

  const setAutoApplyEnabled = (checked) => {
    localStorage.setItem("autoApplyAfterDictation", String(checked));
    setAutoApply(checked);
  };

  const selectAutoApplyTransform = (id) => {
    localStorage.setItem("autoApplyTransformId", id);
    setAutoApplyTransformId(id);
  };

  const handleSeeChanges = async () => {
    // Wait for the changes card to read the pill's current bounds before
    // clearing transformStatus — that clear triggers a separate
    // resizeMainWindow IPC (see the effect above) that shrinks the pill,
    // which raced against the position calc and made this land in a
    // different spot than Win+Alt+O (which never touches transformStatus).
    await window.electronAPI?.showLastTransformChanges?.();
    setTransformStatus(null);
    // Without this, the mouse is still hovering the pill when transformStatus
    // clears, so the hover-expand effect picks the STACK size instead of
    // BASE — the pill grows instead of shrinking. Force collapse; it'll
    // re-expand normally on the next fresh hover.
    setIsExpanded(false);
  };

  const selectedTransform =
    transforms.find((tr) => tr.id === autoApplyTransformId) || transforms[0];
  const selectedShortcut =
    selectedTransform?.id === "builtin-polish"
      ? polishKey || selectedTransform?.shortcut || ""
      : selectedTransform?.shortcut || "";

  const micState = isRecording ? (isCommandMode ? "command" : "recording") : "idle";
  const micStateClass =
    micState === "recording"
      ? "flow-bar-pill--listening"
      : micState === "command"
        ? "flow-bar-pill--command"
        : "";

  return (
    <div className="dictation-window">
      <div
        className={`fixed right-0 z-50 flex items-center justify-end ${dockDirection === "down" ? "top-0" : "bottom-0"}`}
        onMouseEnter={() => {
          setIsHovered(true);
          setWindowInteractivity(true);
        }}
        onMouseLeave={() => {
          setIsHovered(false);
          if (!isTransformMenuOpen) {
            setWindowInteractivity(false);
          }
        }}
      >
        {statusPill ? (
          <div className={`flow-pill-h flow-pill-h--${flowBarPillStyle} mr-1.5`}>
            {statusPill.mode === "processing" ? (
              <>
                <Loader2 size={15} className="animate-spin opacity-80" />
                {statusPill.name && (
                  <span className="text-[12px] opacity-80">{statusPill.name}…</span>
                )}
                {isProcessing && !transformStatus && (
                  <button
                    aria-label={t("app.buttons.cancelProcessing")}
                    onClick={cancelProcessing}
                    className="ml-1 flex h-5 w-5 items-center justify-center rounded-full opacity-50 hover:opacity-100 hover:bg-black/10 dark:hover:bg-white/10"
                  >
                    <X size={11} />
                  </button>
                )}
              </>
            ) : (
              <>
                <span className="text-[13px] font-medium">
                  {t("app.pill.done", { defaultValue: "Done." })}
                </span>
                <button
                  onClick={handleSeeChanges}
                  className="text-[13px] font-medium text-fuchsia-600 hover:text-fuchsia-500 dark:text-fuchsia-300 dark:hover:text-fuchsia-200"
                >
                  {t("app.pill.seeChanges", { defaultValue: "See changes" })}
                </button>
              </>
            )}
          </div>
        ) : !isExpanded ? (
          <div
            className={`flow-dock-handle flow-dock-handle--${flowBarPillStyle} flow-dock-handle--anim-${idleOrbAnimation}`}
            role="button"
            aria-label={t("app.dock.expand", { defaultValue: "Expand Flow Bar" })}
            onClick={() => setIsExpanded(true)}
          />
        ) : (
          <div 
            className={`relative mr-1 flex flex-col items-end transition-all duration-300 ease-out origin-right ${
              (isHovered || isTransformMenuOpen || isRecording || toastCount > 0) 
                ? "opacity-100 scale-100 translate-x-0" 
                : "opacity-0 scale-95 translate-x-2 pointer-events-none"
            }`}
          >
            {showStreamingPreview && isStreaming && (
              <div className={`absolute right-0 w-72 rounded-2xl bg-white border border-black/10 p-3 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 pointer-events-none animate-in fade-in duration-300 z-50 ${
                dockDirection === "down" ? "top-full mt-4 slide-in-from-top-4" : "bottom-full mb-4 slide-in-from-bottom-4"
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <Loader2 size={12} className="animate-spin text-neutral-500" />
                  <span className="text-[11px] font-bold uppercase tracking-wider text-neutral-500">
                    Live Streaming
                  </span>
                </div>
                <div className="text-sm leading-relaxed text-neutral-800 dark:text-neutral-200">
                  {transcript || partialTranscript || "Listening..."}
                </div>
              </div>
            )}
            {isRecording ? (
              <button
                onClick={toggleListening}
                aria-label={t("app.mic.recording")}
                className={`flow-dock-mic flow-dock-mic--recording flow-dock-mic--recording--${flowBarPillStyle} ${micStateClass} relative flex items-center justify-center`}
              >
                {voiceVisualizerStyle === "bars" ? (
                  <LiveWaveform levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "siri" ? (
                  <SiriOrbVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "ripple" ? (
                  <RippleWaveVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "neon" ? (
                  <NeonPulseVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "particles" ? (
                  <ParticleSwarmVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "waveline" ? (
                  <WavelineVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : voiceVisualizerStyle === "spectrum" ? (
                  <SpectrumVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                ) : (
                  <LiquidPlasmaVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                )}

                <svg className="w-5 h-5 text-white/90 z-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>

                <span className="flow-bar-ring flow-bar-ring--listening" aria-hidden="true" />
              </button>
            ) : (
            <div className={`flow-dock-panel flow-dock-panel--${flowBarPillStyle}`}>

              <Tooltip
                label={t("app.dock.dictate", { defaultValue: "Dictate" })}
                hotkey={formatHotkeyLabel(hotkey)}
                direction={dockDirection}
              >
                <button
                  ref={buttonRef}
                  onMouseDown={(e) => {
                    setIsTransformMenuOpen(false);
                    setDragStartPos({ x: e.clientX, y: e.clientY });
                    setHasDragged(false);
                    handleMouseDown(e);
                  }}
                  onMouseMove={(e) => {
                    if (dragStartPos && !hasDragged) {
                      const distance = Math.sqrt(
                        Math.pow(e.clientX - dragStartPos.x, 2) +
                          Math.pow(e.clientY - dragStartPos.y, 2)
                      );
                      if (distance > 5) {
                        setHasDragged(true);
                      }
                    }
                  }}
                  onMouseUp={(e) => {
                    handleMouseUp(e);
                    setDragStartPos(null);
                  }}
                  onClick={(e) => {
                    if (!hasDragged) {
                      setIsTransformMenuOpen(false);
                      toggleListening();
                    }
                    e.preventDefault();
                  }}
                  className={`flow-dock-mic flow-dock-mic--${flowBarPillStyle}`}
                  style={{ cursor: isDragging ? "grabbing" : "pointer" }}
                >
                  <Mic size={16} className="opacity-90" />
                </button>
              </Tooltip>

              {scratchpadInFlowBar && (
                <Tooltip label={t("app.dock.scratchpad", { defaultValue: "Scratchpad" })} direction={dockDirection}>
                  <button
                    onClick={() => {
                      void window.electronAPI?.openScratchpadOverlay?.();
                    }}
                    className="flow-dock-icon"
                  >
                    <SquarePen size={15} />
                  </button>
                </Tooltip>
              )}

              <Tooltip
                  label={selectedTransform?.name || t("app.dock.transforms", { defaultValue: "Transforms" })}
                  hotkey={selectedShortcut ? formatHotkeyLabel(selectedShortcut) : undefined}
                  offset={40}
                  enabled={dockReady}
                  direction={dockDirection}
                >
                  <div ref={sparkleRef} className="group relative flex items-center">
                    <div
                      className={`absolute inset-x-0 flex justify-center transition-all duration-200 ${
                        dockDirection === "down" ? "top-full pt-1" : "bottom-full pb-1"
                      } ${
                        isTransformMenuOpen
                          ? "opacity-100 pointer-events-auto scale-100 translate-y-0"
                          : dockReady
                            ? `opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto scale-95 group-hover:scale-100 ${
                                dockDirection === "down" ? "-translate-y-1 group-hover:translate-y-0" : "translate-y-1 group-hover:translate-y-0"
                              }`
                            : "opacity-0 pointer-events-none"
                      }`}
                    >
                      {/* Integrated tab: shares the transform menu's own
                          material (not a standalone floating chip) so it
                          reads as part of the menu, not a separate control. */}
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (isTransformMenuOpen) {
                            setIsTransformMenuOpen(false);
                            setWindowInteractivity(false);
                          } else {
                            setWindowInteractivity(true);
                            toggleTransformMenu();
                          }
                        }}
                        aria-label={t("app.dock.transformMenu", {
                          defaultValue: "Transform menu",
                        })}
                        className={`flow-transform-menu flow-transform-menu--${flowBarPillStyle} flow-dock-icon flow-dock-icon--small flex items-center justify-center`}
                      >
                        {isTransformMenuOpen
                          ? (dockDirection === "down" ? <ChevronUp size={13} /> : <ChevronDown size={13} />)
                          : (dockDirection === "down" ? <ChevronDown size={13} /> : <ChevronUp size={13} />)}
                      </button>
                    </div>
                    {/* Sparkle — runs the selected transform on the current selection */}
                    <button
                      onClick={() => {
                        setIsTransformMenuOpen(false);
                        if (selectedTransform) {
                          void window.electronAPI?.runTransform?.({ id: selectedTransform.id });
                        }
                      }}
                      className="flow-dock-icon"
                    >
                      <Sparkles size={15} />
                    </button>
                  </div>
                </Tooltip>
            </div>
            )}

            {isTransformMenuOpen && (
              <div
                ref={menuRef}
                className={`flow-transform-menu flow-transform-menu--${flowBarPillStyle} absolute right-0 w-64 rounded-2xl bg-white border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 ${
                  dockDirection === "down" ? "top-full mt-2 animate-menu-in-down" : "bottom-full mb-2 animate-menu-in"
                }`}
                onMouseEnter={() => {
                  setWindowInteractivity(true);
                }}
                onMouseLeave={() => {
                  if (!isHovered) {
                    setWindowInteractivity(false);
                  }
                }}
              >
                {/* Header with Close Button */}
                <div className="flex items-center justify-between px-3 pt-3 pb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-800 dark:text-neutral-200 pl-1">
                    Transform Options
                  </span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setIsTransformMenuOpen(false);
                      setWindowInteractivity(false);
                    }}
                    className="p-1.5 rounded-full text-neutral-500 hover:text-neutral-900 hover:bg-black/5 dark:text-neutral-400 dark:hover:text-neutral-100 dark:hover:bg-white/10 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
                
                <div className="flex items-center justify-between gap-3 px-3 py-2 mx-2 mb-1 rounded-xl bg-black/5 dark:bg-white/5">
                  <span className="text-[13px] font-medium">
                    {t("app.transformMenu.autoApply", {
                      defaultValue: "Auto Apply After Dictation",
                    })}
                  </span>
                  <Toggle checked={autoApply} onChange={setAutoApplyEnabled} />
                </div>
                <div className="mx-4 my-1 h-px bg-neutral-200/50 dark:bg-neutral-700/50" />
                <div className="px-1">
                  {transforms.map((tr) => (
                    <button
                      key={tr.id}
                      onClick={() => selectAutoApplyTransform(tr.id)}
                      className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors ${
                        autoApplyTransformId === tr.id
                          ? `flow-transform-menu-item--active-${flowBarPillStyle}`
                          : ""
                      }`}
                    >
                      <span className="truncate">{tr.name}</span>
                      {autoApplyTransformId === tr.id && (
                        <Check size={14} className="shrink-0 text-neutral-700 dark:text-neutral-200" />
                      )}
                    </button>
                  ))}
                </div>
                <div className="mx-4 my-1 h-px bg-neutral-200/50 dark:bg-neutral-700/50" />
                <div className="px-1">
                  <button
                    onClick={() => {
                      setIsTransformMenuOpen(false);
                      void window.electronAPI?.openTransformsView?.();
                    }}
                    className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors"
                  >
                    <Settings size={14} className="shrink-0 text-neutral-600 dark:text-neutral-300" />
                    {t("app.transformMenu.configure", { defaultValue: "Configure transforms" })}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
