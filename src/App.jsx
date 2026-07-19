import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import {
  Check,
  ChevronLeft,
  ChevronRight,
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

export const LiveWaveform = ({ levels, isCommandMode }) => {
  const shadowColor = isCommandMode
    ? "rgba(251, 191, 36, 0.65)"
    : "rgba(139, 110, 240, 0.65)";

  return (
    <div className="absolute inset-0 z-0 flex flex-col items-center justify-center gap-[3px] py-0.5">
      {levels.map((level, i) => (
        <div
          key={i}
          className="h-[2.5px] rounded-full transition-[width] duration-75 bg-gradient-to-r from-white/30 via-white to-white/30"
          style={{
            width: `${5 + level * 16}px`,
            boxShadow: `0 0 6px 1px ${shadowColor}`,
            transitionTimingFunction: "cubic-bezier(0.34, 1.56, 0.64, 1)",
          }}
        />
      ))}
    </div>
  );
};

export const SiriOrbVisualizer = ({ levels, isCommandMode }) => {
  const getBand = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += levels[i] || 0;
    return sum / (end - start);
  };

  const scale = 1 + getBand(0, 4) * 0.4;
  const morphX = 1 + getBand(4, 8) * 0.2;
  const morphY = 1 + getBand(8, 12) * 0.2;

  const coreColor = isCommandMode ? "rgba(251, 191, 36, 1)" : "rgba(167, 139, 250, 1)";
  const auraColor = isCommandMode ? "rgba(245, 158, 11, 0.6)" : "rgba(139, 110, 240, 0.6)";

  return (
    <div className="absolute inset-0 flex items-center justify-center overflow-hidden rounded-full pointer-events-none">
      <div 
        className="absolute transition-transform duration-100 ease-out"
        style={{
          width: '32px',
          height: '32px',
          borderRadius: '50%',
          background: `radial-gradient(circle at center, ${coreColor} 0%, ${auraColor} 60%, transparent 100%)`,
          boxShadow: `0 0 20px 5px ${auraColor}, 0 0 40px 10px ${coreColor}40`,
          transform: `scale(${scale}) scaleX(${morphX}) scaleY(${morphY})`,
          filter: 'blur(2px)'
        }}
      />
    </div>
  );
};

export const NeonPulseVisualizer = ({ levels, isCommandMode }) => {
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
  const pulseColor = isCommandMode ? "rgba(251, 191, 36, 1)" : "rgba(139, 110, 240, 1)";
  const shadowColor = isCommandMode ? "rgba(251, 191, 36, 0.7)" : "rgba(139, 110, 240, 0.7)";
  
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none rounded-[24px]">
      <div 
        className="absolute inset-0 rounded-[24px] border-[2.5px] transition-all duration-75"
        style={{
          borderColor: pulseColor,
          boxShadow: `0 0 ${10 + avgLevel * 30}px ${shadowColor}, inset 0 0 ${5 + avgLevel * 15}px ${shadowColor}`,
          opacity: 0.3 + avgLevel * 0.7,
          transform: `scale(${1 + avgLevel * 0.05})`
        }}
      />
    </div>
  );
};

export const ParticleSwarmVisualizer = ({ levels, isCommandMode }) => {
  const particleColor = isCommandMode ? "rgba(251, 191, 36, 0.9)" : "rgba(139, 110, 240, 0.9)";
  
  return (
    <div className="absolute inset-0 overflow-hidden rounded-[24px] pointer-events-none">
      {levels.slice(0, 12).map((level, i) => {
        const xOffset = ((i % 4) - 1.5) * 10;
        const yOffset = ((Math.floor(i / 4)) - 1) * 20 * (1 + level);
        const scale = 0.5 + level * 1.5;
        
        return (
          <div
            key={i}
            className="absolute left-1/2 top-1/2 w-1.5 h-1.5 rounded-full transition-transform duration-100 ease-out"
            style={{
              backgroundColor: particleColor,
              boxShadow: `0 0 6px ${particleColor}`,
              transform: `translate(calc(-50% + ${xOffset}px), calc(-50% + ${yOffset}px)) scale(${scale})`,
              opacity: 0.2 + level * 0.8
            }}
          />
        );
      })}
    </div>
  );
};

export const RippleWaveVisualizer = ({ levels, isCommandMode }) => {
  const avgLevel = levels.reduce((a, b) => a + b, 0) / levels.length;
  const rippleColor = isCommandMode ? "rgba(251, 191, 36, 0.4)" : "rgba(139, 110, 240, 0.4)";
  
  return (
    <div className="absolute inset-0 flex items-center justify-center pointer-events-none overflow-hidden rounded-full">
      <div 
        className="absolute rounded-full border border-white/20 transition-transform duration-200 ease-out"
        style={{
          width: '100%',
          height: '100%',
          transform: `scale(${1 + avgLevel * 0.5})`,
          opacity: 1 - avgLevel,
          backgroundColor: rippleColor
        }}
      />
      <div 
        className="absolute rounded-full border border-white/40 transition-transform duration-100 ease-out"
        style={{
          width: '60%',
          height: '60%',
          transform: `scale(${1 + avgLevel * 0.8})`,
          opacity: 1 - avgLevel * 0.5,
          backgroundColor: rippleColor
        }}
      />
    </div>
  );
};

export const LiquidPlasmaVisualizer = ({ levels, isCommandMode }) => {
  const getBand = (start, end) => {
    let sum = 0;
    for (let i = start; i < end; i++) sum += levels[i] || 0.15;
    return Math.max(0, (sum / (end - start)) - 0.15); 
  };

  const b1 = getBand(0, 3) * 1.5;
  const b2 = getBand(3, 7) * 1.5;
  const b3 = getBand(7, 11) * 1.5;
  const b4 = getBand(11, 14) * 1.5;

  const colors = isCommandMode
    ? ["bg-amber-300", "bg-orange-500", "bg-rose-500", "bg-yellow-400"]
    : ["bg-cyan-300", "bg-indigo-500", "bg-fuchsia-500", "bg-violet-400"];

  const blobClass = "absolute rounded-full mix-blend-screen transition-all duration-75 ease-out opacity-90";

  return (
    <div className="absolute inset-0 overflow-hidden rounded-full pointer-events-none flex items-center justify-center">
      <div
        className={`${blobClass} ${colors[0]}`}
        style={{
          top: '-10%', left: '10%', width: '36px', height: '36px', filter: 'blur(10px)',
          transform: `scale(${1 + b1 * 1.5}) translateY(${b1 * 10}px)`,
        }}
      />
      <div
        className={`${blobClass} ${colors[1]}`}
        style={{
          top: '20%', left: '-10%', width: '44px', height: '44px', filter: 'blur(12px)',
          transform: `scale(${1 + b2 * 1.5}) translateY(${b2 * -5}px)`,
        }}
      />
      <div
        className={`${blobClass} ${colors[2]}`}
        style={{
          top: '45%', left: '15%', width: '44px', height: '44px', filter: 'blur(12px)',
          transform: `scale(${1 + b3 * 1.5}) translateY(${b3 * 5}px)`,
        }}
      />
      <div
        className={`${blobClass} ${colors[3]}`}
        style={{
          top: '70%', left: '-5%', width: '36px', height: '36px', filter: 'blur(10px)',
          transform: `scale(${1 + b4 * 1.5}) translateY(${b4 * -10}px)`,
        }}
      />
      <div className="absolute inset-0 rounded-full border border-white/20 shadow-[inset_0_4px_16px_rgba(255,255,255,0.25)]" />
    </div>
  );
};

// White pill tooltip opening to the left of a dock icon (Wispr style):
// "Dictate **Ctrl + Win**", "Scratchpad", "Polish **Win Alt 1**".
const Tooltip = ({ children, label, hotkey, offset = 10, enabled = true }) => {
  const [isVisible, setIsVisible] = useState(false);

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
          className="flow-tooltip-pill absolute right-full top-1/2 -translate-y-1/2 z-10 max-w-[190px] truncate"
          style={{ marginRight: offset }}
        >
          {label}
          {hotkey ? <span className="font-semibold"> {hotkey}</span> : null}
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [isHovered, setIsHovered] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  // The dock's native window resize (isExpanded -> resizeMainWindow IPC) is
  // async and not instant — a fast mouse can reach the sparkle/arrow's
  // screen position before the window has actually widened to STACK, and
  // since Electron clips content to the window's real bounds, that content
  // gets hard-clipped at the (still narrow) edge — looks like it "vanishes",
  // but it's really just rendered outside the window's current canvas. Delay
  // the finer hover-reveal content (tooltip, transform-menu arrow) briefly
  // after expanding so the resize has time to land first.
  const [dockReady, setDockReady] = useState(false);
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
    const resizeWindow = () => {
      if (isTransformMenuOpen && toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("EXPANDED");
      } else if (isTransformMenuOpen) {
        window.electronAPI?.resizeMainWindow?.("WITH_MENU");
      } else if (toastCount > 0) {
        window.electronAPI?.resizeMainWindow?.("WITH_TOAST");
      } else if (statusPill) {
        window.electronAPI?.resizeMainWindow?.("WIDE");
      } else if (isRecording) {
        window.electronAPI?.resizeMainWindow?.("RECORDING");
      } else if (isExpanded) {
        window.electronAPI?.resizeMainWindow?.("STACK");
      } else {
        window.electronAPI?.resizeMainWindow?.("BASE");
      }
    };
    resizeWindow();
  }, [isTransformMenuOpen, toastCount, isRecording, statusPill, isExpanded]);

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
        className="fixed right-0 top-1/2 -translate-y-1/2 z-50 flex items-center justify-end"
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
          <div className="flow-pill-h mr-1.5">
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
            className="flow-dock-handle"
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
              <div className="absolute right-full mr-4 top-1/2 -translate-y-1/2 w-72 rounded-2xl bg-white border border-black/10 p-3 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 pointer-events-none animate-in fade-in slide-in-from-right-4 duration-300 z-50">
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
                className={`flow-dock-mic flow-dock-mic--recording ${micStateClass} relative flex items-center justify-center`}
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
                ) : (
                  <LiquidPlasmaVisualizer levels={micLevels} isCommandMode={isCommandMode} />
                )}

                <svg className="w-5 h-5 text-white/90 z-10 drop-shadow-[0_2px_8px_rgba(0,0,0,0.6)]" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5-3c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
                </svg>

                <span className="flow-bar-ring flow-bar-ring--listening" aria-hidden="true" />
              </button>
            ) : (
            <div className="flow-dock-panel">

              <Tooltip
                label={t("app.dock.dictate", { defaultValue: "Dictate" })}
                hotkey={formatHotkeyLabel(hotkey)}
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
                  className="flow-dock-mic"
                  style={{ cursor: isDragging ? "grabbing" : "pointer" }}
                >
                  <Mic size={16} className="opacity-90" />
                </button>
              </Tooltip>

              {scratchpadInFlowBar && (
                <Tooltip label={t("app.dock.scratchpad", { defaultValue: "Scratchpad" })}>
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
                >
                  <div ref={sparkleRef} className="group relative flex items-center">
                    <div
                      className={`absolute inset-y-0 right-full flex items-center pr-1 transition-all duration-200 ${
                        isTransformMenuOpen
                          ? "opacity-100 pointer-events-auto scale-100 translate-x-0"
                          : dockReady 
                            ? "opacity-0 pointer-events-none group-hover:opacity-100 group-hover:pointer-events-auto scale-95 group-hover:scale-100 translate-x-1 group-hover:translate-x-0" 
                            : "opacity-0 pointer-events-none"
                      }`}
                    >
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
                        className="flow-dock-icon flow-dock-icon--small flow-dock-icon--float bg-surface-2 dark:bg-surface-2 shadow-sm border border-black/5 dark:border-white/10"
                      >
                        {isTransformMenuOpen ? <ChevronRight size={13} /> : <ChevronLeft size={13} />}
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
                className="absolute right-full bottom-0 mr-2 w-64 rounded-2xl bg-white border border-black/10 py-2 text-neutral-900 shadow-2xl shadow-black/10 dark:bg-neutral-900 dark:border-white/10 dark:text-neutral-100 animate-menu-in"
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
                      className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-[13px] hover:bg-black/5 focus:bg-black/5 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10 transition-colors"
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
