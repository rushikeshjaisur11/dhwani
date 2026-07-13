import React, { useState, useEffect, useLayoutEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import "./index.css";
import {
  Check,
  ChevronLeft,
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

// Live waveform bars driven by real mic amplitude (recording state).
// Vertical orientation: horizontal bars stacked top-to-bottom, widths follow
// the mic level — matches the vertical pill.
const LiveWaveform = ({ levels }) => {
  return (
    <div className="flex flex-col items-center justify-center gap-[3px] w-full py-1">
      {levels.map((level, i) => (
        <div
          key={i}
          className="h-[3px] rounded-full bg-white/90 transition-[width] duration-75 ease-out"
          style={{ width: `${6 + level * 18}px` }}
        />
      ))}
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

  // Floating icon auto-hide setting (read from store, synced via IPC)
  const floatingIconAutoHide = useSettingsStore((s) => s.floatingIconAutoHide);
  const polishKey = useSettingsStore((s) => s.polishKey);
  const prevAutoHideRef = useRef(floatingIconAutoHide);

  const setWindowInteractivity = React.useCallback((shouldCapture) => {
    window.electronAPI?.setMainWindowInteractivity?.(shouldCapture);
  }, []);

  useEffect(() => {
    setWindowInteractivity(false);
    return () => setWindowInteractivity(false);
  }, [setWindowInteractivity]);

  // "Add to Flow Bar" is toggled in the settings window — sync via the
  // cross-window storage event (same pattern as useTransform's hotkey sync).
  useEffect(() => {
    const handleStorage = (event) => {
      if (event.key === "scratchpadAddToFlowBar") {
        setScratchpadInFlowBar(event.newValue === "true");
      }
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  // Transform run status → pill states (spinner / "Done. See changes").
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
    // Done fades after a few seconds; processing has a stale-guard so a hung
    // LLM call can't wedge the pill forever.
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
                  // silently fail — word stays in dictionary
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
  } = useAudioRecording(toast, {
    onToggle: handleDictationToggle,
  });

  const micLevels = useMicLevel(isRecording);

  // Horizontal status pill (spinner / Done): transform runs and the
  // dictation cleanup phase share the same visual.
  const statusPill = React.useMemo(
    () => transformStatus || (isProcessing ? { mode: "processing" } : null),
    [transformStatus, isProcessing]
  );

  // Expand the dock while anything needs it; collapse shortly after the
  // pointer leaves (delay avoids resize/hover flicker loops).
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

  // Sync auto-hide from main process — setState directly to avoid IPC echo
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

  // Auto-hide the floating icon when idle (setting enabled or dictation cycle completed)
  useEffect(() => {
    let hideTimeout;

    if (floatingIconAutoHide && !isRecording && !isProcessing && toastCount === 0) {
      // Delay briefly so processing can start after recording stops without a flash
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

  // Clicks outside the Electron window never reach this renderer, so the
  // click-outside handler below can't see them — close the menu shortly
  // after the pointer leaves the dock instead.
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

  const handleSeeChanges = () => {
    void window.electronAPI?.showLastTransformChanges?.();
    setTransformStatus(null);
  };

  // Sparkle tooltip: the selected transform's name + hotkey ("Polish Win Alt 1").
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
      {/* Right-edge dock: collapsed handle -> icon panel -> menu / status pill */}
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
          <div className="relative mr-1 flex flex-col items-end">
            {isRecording ? (
              /* Recording: the waveform IS the pill — no other options. Click stops. */
              <button
                onClick={toggleListening}
                aria-label={t("app.mic.recording")}
                className={`flow-dock-mic flow-dock-mic--recording ${micStateClass}`}
              >
                <LiveWaveform levels={micLevels} />
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
                        // 5px threshold for drag
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
                    {/* Left arrow — floats outside the panel, appears only on
                        hover of this row, opens the transform menu. Gated
                        behind dockReady (not just group-hover) so it can't
                        render/become interactive until ~120ms after the panel
                        expanded — long enough for the async native window
                        resize to actually land. Rendering it before that
                        landed meant it was drawn past the still-narrow
                        window's real edge and hard-clipped there, which read
                        as "disappearing" when reached for. */}
                    <div
                      className={`absolute top-1/2 -translate-y-1/2 pr-2 opacity-0 pointer-events-none transition-opacity duration-150 ${
                        dockReady ? "group-hover:opacity-100 group-hover:pointer-events-auto" : ""
                      }`}
                      style={{ right: "calc(100% - 4px)" }}
                    >
                      <button
                        onClick={() => {
                          setWindowInteractivity(true);
                          toggleTransformMenu();
                        }}
                        aria-label={t("app.dock.transformMenu", {
                          defaultValue: "Transform menu",
                        })}
                        className="flow-dock-icon flow-dock-icon--small flow-dock-icon--float"
                      >
                        <ChevronLeft size={13} />
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
                className="absolute right-full bottom-0 mr-2 w-60 rounded-2xl bg-white py-1.5 text-neutral-900 shadow-xl dark:bg-neutral-900 dark:text-neutral-100"
                onMouseEnter={() => {
                  setWindowInteractivity(true);
                }}
                onMouseLeave={() => {
                  if (!isHovered) {
                    setWindowInteractivity(false);
                  }
                }}
              >
                <div className="flex items-center justify-between gap-3 px-4 py-2.5">
                  <span className="text-[13px] font-medium">
                    {t("app.transformMenu.autoApply", {
                      defaultValue: "Auto Apply After Dictation",
                    })}
                  </span>
                  <Toggle checked={autoApply} onChange={setAutoApplyEnabled} />
                </div>
                <div className="h-px bg-neutral-200 dark:bg-neutral-700" />
                {transforms.map((tr) => (
                  <button
                    key={tr.id}
                    onClick={() => selectAutoApplyTransform(tr.id)}
                    className="flex w-full items-center justify-between px-4 py-2.5 text-left text-[13px] hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10"
                  >
                    <span className="truncate">{tr.name}</span>
                    {autoApplyTransformId === tr.id && (
                      <Check size={14} className="shrink-0 text-neutral-700 dark:text-neutral-200" />
                    )}
                  </button>
                ))}
                <div className="h-px bg-neutral-200 dark:bg-neutral-700" />
                <button
                  onClick={() => {
                    setIsTransformMenuOpen(false);
                    void window.electronAPI?.openTransformsView?.();
                  }}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-[13px] hover:bg-neutral-100 focus:bg-neutral-100 focus:outline-none dark:hover:bg-white/10 dark:focus:bg-white/10"
                >
                  <Settings size={14} className="shrink-0 text-neutral-600 dark:text-neutral-300" />
                  {t("app.transformMenu.configure", { defaultValue: "Configure transforms" })}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
