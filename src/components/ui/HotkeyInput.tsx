import React, { useState, useCallback, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Trash2 } from "lucide-react";
import { formatHotkeyLabel, isGlobeLikeHotkey } from "../../utils/hotkeys";
import { getPlatform } from "../../utils/platform";

const CODE_TO_KEY: Record<string, string> = {
  Backquote: "`",
  Digit1: "1",
  Digit2: "2",
  Digit3: "3",
  Digit4: "4",
  Digit5: "5",
  Digit6: "6",
  Digit7: "7",
  Digit8: "8",
  Digit9: "9",
  Digit0: "0",
  Minus: "-",
  Equal: "=",
  // QWERTY row
  KeyQ: "Q",
  KeyW: "W",
  KeyE: "E",
  KeyR: "R",
  KeyT: "T",
  KeyY: "Y",
  KeyU: "U",
  KeyI: "I",
  KeyO: "O",
  KeyP: "P",
  BracketLeft: "[",
  BracketRight: "]",
  Backslash: "\\",
  // ASDF row
  KeyA: "A",
  KeyS: "S",
  KeyD: "D",
  KeyF: "F",
  KeyG: "G",
  KeyH: "H",
  KeyJ: "J",
  KeyK: "K",
  KeyL: "L",
  Semicolon: ";",
  Quote: "'",
  // ZXCV row
  KeyZ: "Z",
  KeyX: "X",
  KeyC: "C",
  KeyV: "V",
  KeyB: "B",
  KeyN: "N",
  KeyM: "M",
  Comma: ",",
  Period: ".",
  Slash: "/",
  // Special keys
  Space: "Space",
  Escape: "Esc",
  Tab: "Tab",
  Enter: "Enter",
  Backspace: "Backspace",
  // Function keys
  F1: "F1",
  F2: "F2",
  F3: "F3",
  F4: "F4",
  F5: "F5",
  F6: "F6",
  F7: "F7",
  F8: "F8",
  F9: "F9",
  F10: "F10",
  F11: "F11",
  F12: "F12",
  // Extended function keys (F13-F24)
  F13: "F13",
  F14: "F14",
  F15: "F15",
  F16: "F16",
  F17: "F17",
  F18: "F18",
  F19: "F19",
  F20: "F20",
  F21: "F21",
  F22: "F22",
  F23: "F23",
  F24: "F24",
  // Arrow keys
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  // Navigation keys
  Insert: "Insert",
  Delete: "Delete",
  Home: "Home",
  End: "End",
  PageUp: "PageUp",
  PageDown: "PageDown",
  // Additional keys (useful on Windows/Linux)
  Pause: "Pause",
  ScrollLock: "Scrolllock",
  PrintScreen: "PrintScreen",
  NumLock: "Numlock",
  // Numpad keys
  Numpad0: "num0",
  Numpad1: "num1",
  Numpad2: "num2",
  Numpad3: "num3",
  Numpad4: "num4",
  Numpad5: "num5",
  Numpad6: "num6",
  Numpad7: "num7",
  Numpad8: "num8",
  Numpad9: "num9",
  NumpadAdd: "numadd",
  NumpadSubtract: "numsub",
  NumpadMultiply: "nummult",
  NumpadDivide: "numdiv",
  NumpadDecimal: "numdec",
  NumpadEnter: "Enter",
  // Media keys (may work on some systems)
  MediaPlayPause: "MediaPlayPause",
  MediaStop: "MediaStop",
  MediaTrackNext: "MediaNextTrack",
  MediaTrackPrevious: "MediaPreviousTrack",
};

// Windows virtual-key codes for the final (non-modifier) key, used only by
// the native-capture path below. Covers the realistic "final key" set for a
// global hotkey — digits, letters, function keys — not the full DOM
// CODE_TO_KEY table (punctuation/numpad/media aren't needed here since
// those combos don't involve the Windows key and already work via DOM).
const VK_TO_KEY: Record<number, string> = {};
for (let i = 0; i <= 9; i++) VK_TO_KEY[0x30 + i] = String(i); // '0'-'9'
for (let i = 0; i < 26; i++) VK_TO_KEY[0x41 + i] = String.fromCharCode(65 + i); // 'A'-'Z'
for (let i = 1; i <= 12; i++) VK_TO_KEY[0x6f + i] = `F${i}`; // F1-F12 (VK_F1=0x70)
for (let i = 13; i <= 24; i++) VK_TO_KEY[0x7b + i - 12] = `F${i}`; // F13-F24 (VK_F13=0x7C)

const VK_MODIFIER_CODE: Record<number, string> = {
  0xa2: "ControlLeft",
  0xa3: "ControlRight",
  0xa4: "AltLeft",
  0xa5: "AltRight",
  0xa0: "ShiftLeft",
  0xa1: "ShiftRight",
  0x5b: "MetaLeft", // VK_LWIN
  0x5c: "MetaRight", // VK_RWIN
};

function vkModifierKind(code: string): "ctrl" | "alt" | "shift" | "meta" | null {
  if (code.startsWith("Control")) return "ctrl";
  if (code.startsWith("Alt")) return "alt";
  if (code.startsWith("Shift")) return "shift";
  if (code.startsWith("Meta")) return "meta";
  return null;
}

const MODIFIER_CODES = new Set([
  "ShiftLeft",
  "ShiftRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
  "MetaLeft",
  "MetaRight",
  "CapsLock",
]);

export interface HotkeyInputProps {
  value: string;
  onChange: (hotkey: string) => void;
  /** When provided, a remove button is revealed on hover while a hotkey is set. */
  onClear?: () => void;
  onBlur?: () => void;
  disabled?: boolean;
  autoFocus?: boolean;
  validate?: (hotkey: string) => string | null | undefined;
  /**
   * Hotkey-manager slot name (e.g. "dictation", "transform:<id>"). When set,
   * a captured combo is checked live against all registered slots via the
   * read-only check-hotkey-conflict IPC before being committed: conflicts show
   * red inline and block onChange; a clear combo flashes green and commits.
   * Save-time validation in the main process remains the hard gate.
   */
  slotName?: string;
}

// Friendly labels for known slots (existing i18n keys). Unknown slots
// (transform:<id>) fall back to the main process's localized message.
const SLOT_LABEL_KEYS: Record<string, string> = {
  dictation: "settingsPage.general.hotkey.title",
  meeting: "settingsPage.general.meetingHotkey.title",
  agent: "agentMode.settings.hotkey",
  voiceAgent: "settingsPage.general.voiceAgentHotkey.title",
  polish: "settingsPage.general.polishHotkey.title",
  pasteLastTranscript: "settingsPage.general.pasteLastTranscriptHotkey.title",
  scratchpad: "scratchpad.title",
};

function mapKeyboardEventToHotkey(e: KeyboardEvent): string | null {
  if (MODIFIER_CODES.has(e.code)) {
    return null;
  }

  const baseKey = CODE_TO_KEY[e.code];
  if (!baseKey) {
    return null;
  }

  const platform = getPlatform();
  const modifiers: string[] = [];

  if (platform === "darwin") {
    if (e.ctrlKey) modifiers.push("Control");
    if (e.metaKey) modifiers.push("Command");
  } else {
    if (e.ctrlKey) modifiers.push("Control");
    if (e.metaKey) modifiers.push("Super");
  }

  if (e.altKey) modifiers.push("Alt");
  if (e.shiftKey) modifiers.push("Shift");

  return modifiers.length > 0 ? [...modifiers, baseKey].join("+") : baseKey;
}

export interface HotkeyInputVariant {
  variant?: "default" | "hero";
}

export function HotkeyInput({
  value,
  onChange,
  onClear,
  onBlur,
  disabled = false,
  autoFocus = false,
  variant = "default",
  validate,
  slotName,
}: HotkeyInputProps & HotkeyInputVariant) {
  const { t } = useTranslation();
  const [isCapturing, setIsCapturing] = useState(false);
  const [activeModifiers, setActiveModifiers] = useState<Set<string>>(new Set());
  const [validationWarning, setValidationWarning] = useState<string | null>(null);
  const [conflictError, setConflictError] = useState<string | null>(null);
  const [justAccepted, setJustAccepted] = useState(false);
  const acceptedTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isFnHeld, setIsFnHeld] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const lastCapturedHotkeyRef = useRef<string | null>(null);
  const keyDownTimeRef = useRef<number>(0);
  const warningTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fnHeldRef = useRef(false);
  const fnCapturedKeyRef = useRef(false);
  const heldModifiersRef = useRef<{
    ctrl: boolean;
    meta: boolean;
    alt: boolean;
    shift: boolean;
  }>({ ctrl: false, meta: false, alt: false, shift: false });
  const modifierCodesRef = useRef<{
    ctrl?: string;
    meta?: string;
    alt?: string;
    shift?: string;
  }>({});
  const platform = getPlatform();
  const isMac = platform === "darwin";
  const isWindows = platform === "win32";

  const MODIFIER_HOLD_THRESHOLD_MS = 200;

  const buildModifierOnlyHotkey = useCallback(
    (
      modifiers: { ctrl: boolean; meta: boolean; alt: boolean; shift: boolean },
      codes: { ctrl?: string; meta?: string; alt?: string; shift?: string }
    ): string | null => {
      // Check for right-side single modifier first
      const rightSidePressed: string[] = [];
      if (codes.ctrl === "ControlRight") rightSidePressed.push("RightControl");
      if (codes.meta === "MetaRight") rightSidePressed.push(isMac ? "RightCommand" : "RightSuper");
      if (codes.alt === "AltRight") rightSidePressed.push(isMac ? "RightOption" : "RightAlt");
      if (codes.shift === "ShiftRight") rightSidePressed.push("RightShift");

      // If exactly one right-side modifier, allow it as single-key hotkey
      if (rightSidePressed.length === 1) {
        const activeCount = [modifiers.ctrl, modifiers.meta, modifiers.alt, modifiers.shift].filter(
          Boolean
        ).length;
        if (activeCount === 1) {
          return rightSidePressed[0];
        }
      }

      // Otherwise require 2+ modifiers (existing logic)
      const parts: string[] = [];
      if (modifiers.ctrl) parts.push("Control");
      if (modifiers.meta) parts.push(isMac ? "Command" : "Super");
      if (modifiers.alt) parts.push("Alt");
      if (modifiers.shift) parts.push("Shift");

      if (parts.length >= 2) {
        return parts.join("+");
      }
      return null;
    },
    [isMac]
  );

  const clearFnHeld = useCallback(() => {
    setIsFnHeld(false);
    fnHeldRef.current = false;
    fnCapturedKeyRef.current = false;
  }, []);

  const finalizeCapture = useCallback(
    (hotkey: string) => {
      if (warningTimeoutRef.current) {
        clearTimeout(warningTimeoutRef.current);
        warningTimeoutRef.current = null;
      }

      const rejectCapture = () => {
        heldModifiersRef.current = { ctrl: false, meta: false, alt: false, shift: false };
        modifierCodesRef.current = {};
        setActiveModifiers(new Set());
        keyDownTimeRef.current = 0;
        clearFnHeld();
      };

      if (validate) {
        const errorMsg = validate(hotkey);
        if (errorMsg) {
          setValidationWarning(errorMsg);
          warningTimeoutRef.current = setTimeout(() => setValidationWarning(null), 4000);
          rejectCapture();
          return;
        }
      }

      const commit = () => {
        setValidationWarning(null);
        setConflictError(null);
        lastCapturedHotkeyRef.current = hotkey;
        onChange(hotkey);
        setIsCapturing(false);
        setActiveModifiers(new Set());
        clearFnHeld();
        containerRef.current?.blur();
      };

      // ponytail: no debounce — a combo capture is one discrete event, the
      // IPC check is a sync Map scan in main. Save-time validation stays as
      // the hard gate; this is eager UI feedback only.
      if (slotName && window.electronAPI?.checkHotkeyConflict) {
        void window.electronAPI.checkHotkeyConflict(slotName, hotkey).then((res) => {
          if (res?.conflict) {
            const labelKey = res.conflictSlot ? SLOT_LABEL_KEYS[res.conflictSlot] : undefined;
            setConflictError(
              labelKey
                ? t("hotkey.errors.slotConflict", { slot: t(labelKey) })
                : res.message || t("hotkey.errors.slotConflict", { slot: res.conflictSlot })
            );
            rejectCapture();
            return;
          }
          setJustAccepted(true);
          if (acceptedTimeoutRef.current) clearTimeout(acceptedTimeoutRef.current);
          acceptedTimeoutRef.current = setTimeout(() => setJustAccepted(false), 1200);
          commit();
        });
        return;
      }

      commit();
    },
    [validate, onChange, clearFnHeld, slotName, t]
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();
      e.stopPropagation();

      setConflictError(null);

      // Track held modifiers for modifier-only capture
      heldModifiersRef.current = {
        ctrl: e.ctrlKey,
        meta: e.metaKey,
        alt: e.altKey,
        shift: e.shiftKey,
      };

      // Track which specific keys are pressed (for left/right detection)
      const code = e.nativeEvent.code;
      if (code === "ControlLeft" || code === "ControlRight") {
        modifierCodesRef.current.ctrl = code;
      } else if (code === "MetaLeft" || code === "MetaRight") {
        modifierCodesRef.current.meta = code;
      } else if (code === "AltLeft" || code === "AltRight") {
        modifierCodesRef.current.alt = code;
      } else if (code === "ShiftLeft" || code === "ShiftRight") {
        modifierCodesRef.current.shift = code;
      }

      // Track when first pressed (for hold detection)
      if (keyDownTimeRef.current === 0) {
        keyDownTimeRef.current = Date.now();
      }

      const mods = new Set<string>();
      if (isMac) {
        if (e.metaKey) mods.add("Cmd");
        if (e.ctrlKey) mods.add("Ctrl");
      } else {
        if (e.ctrlKey) mods.add("Ctrl");
        if (e.metaKey) mods.add(isWindows ? "Win" : "Super");
      }
      if (e.altKey) mods.add(isMac ? "Option" : "Alt");
      if (e.shiftKey) mods.add("Shift");
      if (fnHeldRef.current) mods.add("Fn");
      setActiveModifiers(mods);

      // Try to get non-modifier hotkey first
      const hotkey = mapKeyboardEventToHotkey(e.nativeEvent);
      if (hotkey) {
        keyDownTimeRef.current = 0;
        if (fnHeldRef.current) {
          fnCapturedKeyRef.current = true;
          finalizeCapture(`Fn+${hotkey}`);
        } else {
          finalizeCapture(hotkey);
        }
      }
      // If no base key, modifiers are held - don't finalize yet
    },
    [disabled, isMac, isWindows, finalizeCapture]
  );

  const handleKeyUp = useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      e.preventDefault();

      const wasHoldingModifiers =
        heldModifiersRef.current.ctrl ||
        heldModifiersRef.current.meta ||
        heldModifiersRef.current.alt ||
        heldModifiersRef.current.shift;

      let attempted = false;

      if (wasHoldingModifiers && MODIFIER_CODES.has(e.nativeEvent.code)) {
        const holdDuration = Date.now() - keyDownTimeRef.current;

        if (holdDuration >= MODIFIER_HOLD_THRESHOLD_MS) {
          const modifierHotkey = buildModifierOnlyHotkey(
            heldModifiersRef.current,
            modifierCodesRef.current
          );
          if (modifierHotkey) {
            attempted = true;
            if (fnHeldRef.current) {
              fnCapturedKeyRef.current = true;
              finalizeCapture(`Fn+${modifierHotkey}`);
            } else {
              finalizeCapture(modifierHotkey);
            }
          }
        }
      }

      if (!attempted) {
        heldModifiersRef.current = { ctrl: false, meta: false, alt: false, shift: false };
        modifierCodesRef.current = {};
        setActiveModifiers(fnHeldRef.current ? new Set(["Fn"]) : new Set());
        keyDownTimeRef.current = 0;
      }
    },
    [disabled, buildModifierOnlyHotkey, finalizeCapture]
  );

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (disabled || !isCapturing) return;

      const mouseHotkey = e.button === 3 ? "MouseButton4" : e.button === 4 ? "MouseButton5" : null;
      if (!mouseHotkey) return;

      e.preventDefault();
      e.stopPropagation();
      finalizeCapture(mouseHotkey);
    },
    [disabled, isCapturing, finalizeCapture]
  );

  const handleFocus = useCallback(() => {
    if (!disabled) {
      setIsCapturing(true);
      setValidationWarning(null);
      setConflictError(null);
      clearFnHeld();
      window.electronAPI?.setHotkeyListeningMode?.(true);
    }
  }, [disabled, clearFnHeld]);

  const handleBlur = useCallback(() => {
    setIsCapturing(false);
    setActiveModifiers(new Set());
    setValidationWarning(null);
    setConflictError(null);
    clearFnHeld();
    window.electronAPI?.setHotkeyListeningMode?.(false, lastCapturedHotkeyRef.current);
    lastCapturedHotkeyRef.current = null;
    onBlur?.();
  }, [onBlur, clearFnHeld]);

  useEffect(() => {
    if (autoFocus && containerRef.current) {
      containerRef.current.focus();
    }
  }, [autoFocus]);

  useEffect(() => {
    return () => {
      window.electronAPI?.setHotkeyListeningMode?.(false, null);
      if (warningTimeoutRef.current) clearTimeout(warningTimeoutRef.current);
      if (acceptedTimeoutRef.current) clearTimeout(acceptedTimeoutRef.current);
    };
  }, []);

  useEffect(() => {
    if (!isCapturing || !isMac) return;

    const disposeDown = window.electronAPI?.onGlobeKeyPressed?.(() => {
      setValidationWarning(null);
      setIsFnHeld(true);
      fnHeldRef.current = true;
      fnCapturedKeyRef.current = false;
      setActiveModifiers((prev) => new Set([...prev, "Fn"]));
    });

    const disposeUp = window.electronAPI?.onGlobeKeyReleased?.(() => {
      if (fnHeldRef.current && !fnCapturedKeyRef.current) {
        finalizeCapture("GLOBE");
      }
      setIsFnHeld(false);
      fnHeldRef.current = false;
      fnCapturedKeyRef.current = false;
    });

    return () => {
      disposeDown?.();
      disposeUp?.();
    };
  }, [isCapturing, isMac, finalizeCapture]);

  // Windows: a bare Win keydown/keyup is consumed by the Start Menu shell
  // hook before it reaches most apps' normal input path, so a physical
  // Win+Alt+<digit> press can't be relied on to reach the DOM handlers
  // above. Run the native low-level-hook capture in parallel — it reports
  // every raw key event, including the Windows key, and feeds the same
  // held-modifiers state / finalizeCapture path as the DOM handlers.
  useEffect(() => {
    if (!isCapturing || !isWindows) return;

    window.electronAPI?.startHotkeyCapture?.();

    const dispose = window.electronAPI?.onHotkeyCaptureEvent?.(({ type, vkCode }) => {
      const modCode = VK_MODIFIER_CODE[vkCode];
      if (modCode) {
        const kind = vkModifierKind(modCode);
        if (!kind) return;

        if (type === "down") {
          // Mirrors DOM handleKeyDown: a snapshot of held modifiers, only
          // ever written on keydown (keyup below reads it, doesn't mutate
          // it, matching the DOM path's "finalize on first release" model).
          heldModifiersRef.current[kind] = true;
          modifierCodesRef.current[kind] = modCode;
          if (keyDownTimeRef.current === 0) keyDownTimeRef.current = Date.now();

          const mods = new Set<string>();
          if (heldModifiersRef.current.ctrl) mods.add("Ctrl");
          if (heldModifiersRef.current.meta) mods.add("Win");
          if (heldModifiersRef.current.alt) mods.add("Alt");
          if (heldModifiersRef.current.shift) mods.add("Shift");
          setActiveModifiers(mods);
          return;
        }

        // keyup: mirrors DOM handleKeyUp exactly.
        const wasHoldingModifiers =
          heldModifiersRef.current.ctrl ||
          heldModifiersRef.current.meta ||
          heldModifiersRef.current.alt ||
          heldModifiersRef.current.shift;

        let attempted = false;
        if (wasHoldingModifiers) {
          const holdDuration = Date.now() - keyDownTimeRef.current;
          if (holdDuration >= MODIFIER_HOLD_THRESHOLD_MS) {
            const modifierHotkey = buildModifierOnlyHotkey(
              heldModifiersRef.current,
              modifierCodesRef.current
            );
            if (modifierHotkey) {
              attempted = true;
              finalizeCapture(modifierHotkey);
            }
          }
        }

        if (!attempted) {
          heldModifiersRef.current = { ctrl: false, meta: false, alt: false, shift: false };
          modifierCodesRef.current = {};
          setActiveModifiers(new Set());
          keyDownTimeRef.current = 0;
        }
        return;
      }

      if (type !== "down") return;
      const baseKey = VK_TO_KEY[vkCode];
      if (!baseKey) return;

      const parts: string[] = [];
      if (heldModifiersRef.current.ctrl) parts.push("Control");
      if (heldModifiersRef.current.meta) parts.push("Super");
      if (heldModifiersRef.current.alt) parts.push("Alt");
      if (heldModifiersRef.current.shift) parts.push("Shift");
      keyDownTimeRef.current = 0;
      finalizeCapture(parts.length > 0 ? [...parts, baseKey].join("+") : baseKey);
    });

    return () => {
      dispose?.();
      window.electronAPI?.stopHotkeyCapture?.();
    };
  }, [isCapturing, isWindows, finalizeCapture, buildModifierOnlyHotkey]);

  const displayValue = formatHotkeyLabel(value);
  const isGlobe = isGlobeLikeHotkey(value);
  const hotkeyParts = value?.includes("+") ? displayValue.split("+") : [];

  // mousedown is prevented so clicking never focuses the container and starts capture
  const clearButton =
    onClear && value && !isCapturing && !disabled ? (
      <button
        type="button"
        tabIndex={-1}
        aria-label={t("hotkeyInput.remove")}
        onMouseDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onClick={(e) => {
          e.stopPropagation();
          onClear();
        }}
        className="opacity-0 group-hover:opacity-100 transition-opacity duration-150 text-muted-foreground/50 hover:text-destructive cursor-pointer"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    ) : null;

  // Hero variant: large centered key display for onboarding
  if (variant === "hero") {
    return (
      <div
        ref={containerRef}
        tabIndex={disabled ? -1 : 0}
        role="button"
        aria-label={t("hotkeyInput.ariaLabel")}
        data-capturing={isCapturing || undefined}
        onKeyDown={handleKeyDown}
        onKeyUp={handleKeyUp}
        onMouseDown={handleMouseDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={`
          relative group flex flex-col items-center justify-center py-4 px-5 min-h-28
          rounded-md border cursor-pointer select-none outline-none
          transition-colors duration-150
          ${
            disabled
              ? "bg-muted/30 border-border cursor-not-allowed opacity-50"
              : conflictError && isCapturing
                ? "bg-destructive/5 border-destructive/50 shadow-[0_0_0_2px_rgba(220,38,38,0.1)]"
                : isCapturing
                  ? "bg-primary/5 border-primary/30 shadow-[0_0_0_2px_rgba(37,99,212,0.1)]"
                  : justAccepted
                    ? "bg-green-500/5 border-green-500/50"
                    : "bg-surface-1 border-border hover:border-border-hover hover:bg-surface-2"
          }
        `}
      >
        {/* Recording state */}
        {isCapturing ? (
          <div className="flex flex-col items-center gap-3">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-primary rounded-full animate-pulse" />
              <span className="text-xs font-medium text-primary">{t("hotkeyInput.listening")}</span>
            </div>
            {activeModifiers.size > 0 ? (
              <div className="flex flex-col items-center gap-1.5">
                <div className="flex items-center gap-1.5">
                  {Array.from(activeModifiers).map((mod) => (
                    <kbd
                      key={mod}
                      className="px-2.5 py-1 bg-primary/10 border border-primary/20 rounded-sm text-xs font-semibold text-primary"
                    >
                      {mod}
                    </kbd>
                  ))}
                  <span className="text-primary/50 text-sm font-medium">+</span>
                </div>
                {isFnHeld && (
                  <span className="text-xs text-muted-foreground">
                    {t("hotkeyInput.fnHeldHint")}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-xs text-muted-foreground">
                {isMac ? t("hotkeyInput.pressAnyKeyMac") : t("hotkeyInput.pressAnyKey")}
              </span>
            )}
            {(validationWarning || conflictError) && (
              <div
                className={`flex items-center gap-1.5 mt-2 px-3 py-1.5 rounded-md border ${
                  conflictError
                    ? "bg-destructive/8 border-destructive/25"
                    : "bg-warning/8 border-warning/20 dark:bg-warning/12 dark:border-warning/25"
                }`}
              >
                <AlertTriangle
                  className={`w-3 h-3 shrink-0 ${conflictError ? "text-destructive" : "text-warning"}`}
                />
                <span
                  className={`text-xs ${
                    conflictError ? "text-destructive" : "text-warning dark:text-amber-400"
                  }`}
                >
                  {conflictError || validationWarning}
                </span>
              </div>
            )}
          </div>
        ) : value ? (
          /* Has value: show the hotkey prominently */
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-1.5">
              {hotkeyParts.length > 0 ? (
                hotkeyParts.map((part, i) => (
                  <React.Fragment key={part}>
                    {i > 0 && (
                      <span className="text-muted-foreground/40 text-lg font-light">+</span>
                    )}
                    <kbd className="px-3 py-1.5 bg-surface-raised border border-border rounded-sm text-sm font-semibold text-foreground shadow-sm">
                      {part}
                    </kbd>
                  </React.Fragment>
                ))
              ) : isGlobe ? (
                <kbd className="px-3 py-1.5 bg-surface-raised border border-border rounded-sm text-lg shadow-sm">
                  🌐
                </kbd>
              ) : (
                <kbd className="px-3 py-1.5 bg-surface-raised border border-border rounded-sm text-sm font-semibold text-foreground shadow-sm">
                  {displayValue}
                </kbd>
              )}
            </div>
            <span className="text-xs text-muted-foreground/60 group-hover:text-muted-foreground transition-colors">
              {t("hotkeyInput.clickToChange")}
            </span>
          </div>
        ) : (
          /* Empty state */
          <div className="flex flex-col items-center gap-1.5 text-muted-foreground">
            <span className="text-sm font-medium">{t("hotkeyInput.clickToSet")}</span>
          </div>
        )}
        {clearButton && <span className="absolute top-2.5 right-2.5">{clearButton}</span>}
      </div>
    );
  }

  // Default variant: compact inline display
  return (
    <div
      ref={containerRef}
      tabIndex={disabled ? -1 : 0}
      role="button"
      aria-label={t("hotkeyInput.ariaLabel")}
      data-capturing={isCapturing || undefined}
      onKeyDown={handleKeyDown}
      onKeyUp={handleKeyUp}
      onMouseDown={handleMouseDown}
      onFocus={handleFocus}
      onBlur={handleBlur}
      className={`
        relative group overflow-hidden rounded-md border
        transition-colors duration-150 cursor-pointer select-none focus:outline-none
        ${
          disabled
            ? "bg-muted/30 border-border cursor-not-allowed opacity-50"
            : conflictError && isCapturing
              ? "bg-destructive/5 border-destructive/50 shadow-[0_0_0_2px_rgba(220,38,38,0.1)]"
              : isCapturing
                ? "bg-primary/5 border-primary/30 shadow-[0_0_0_2px_rgba(37,99,212,0.1)]"
                : justAccepted
                  ? "bg-green-500/5 border-green-500/50"
                  : "bg-surface-1 border-border hover:border-border-hover hover:bg-surface-2"
        }
      `}
    >
      {isCapturing && (
        <div
          className={`absolute top-0 left-0 right-0 h-0.5 animate-pulse ${
            conflictError ? "bg-destructive" : "bg-primary"
          }`}
        />
      )}

      <div className="px-4 py-3">
        {isCapturing ? (
          <>
            <div className="flex items-center justify-center gap-3">
              <div className="flex items-center gap-1.5">
                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse" />
                <span className="text-xs font-medium text-muted-foreground">
                  {t("hotkeyInput.recording")}
                </span>
              </div>
              {activeModifiers.size > 0 ? (
                <div className="flex items-center gap-1">
                  {Array.from(activeModifiers).map((mod) => (
                    <kbd
                      key={mod}
                      className="px-2 py-0.5 bg-primary/10 border border-primary/20 rounded-sm text-xs font-semibold text-primary"
                    >
                      {mod}
                    </kbd>
                  ))}
                  <span className="text-primary/40 text-xs">
                    {isFnHeld ? t("hotkeyInput.fnCaptureHint") : t("hotkeyInput.keyHint")}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">
                  {isMac ? t("hotkeyInput.tryShortcutMac") : t("hotkeyInput.tryShortcut")}
                </span>
              )}
            </div>
            {(validationWarning || conflictError) && (
              <div
                className={`flex items-center gap-1.5 mt-1.5 px-3 py-1.5 rounded-md border ${
                  conflictError
                    ? "bg-destructive/8 border-destructive/25"
                    : "bg-warning/8 border-warning/20 dark:bg-warning/12 dark:border-warning/25"
                }`}
              >
                <AlertTriangle
                  className={`w-3 h-3 shrink-0 ${conflictError ? "text-destructive" : "text-warning"}`}
                />
                <span
                  className={`text-xs ${
                    conflictError ? "text-destructive" : "text-warning dark:text-amber-400"
                  }`}
                >
                  {conflictError || validationWarning}
                </span>
              </div>
            )}
          </>
        ) : value ? (
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">
              {t("hotkeyInput.hotkeyLabel")}
            </span>
            <div className="flex items-center gap-2">
              {hotkeyParts.length > 0 ? (
                <div className="flex items-center gap-1">
                  {hotkeyParts.map((part, i) => (
                    <React.Fragment key={part}>
                      {i > 0 && <span className="text-muted-foreground/30 text-xs">+</span>}
                      <kbd className="px-2 py-0.5 bg-surface-raised border border-border rounded-sm text-xs font-semibold text-foreground">
                        {part}
                      </kbd>
                    </React.Fragment>
                  ))}
                </div>
              ) : isGlobe ? (
                <div className="flex items-center gap-1.5">
                  <kbd className="px-2 py-0.5 bg-surface-raised border border-border rounded-sm text-base">
                    🌐
                  </kbd>
                  <span className="text-xs text-muted-foreground">{t("hotkeyInput.globe")}</span>
                </div>
              ) : (
                <kbd className="px-2.5 py-1 bg-surface-raised border border-border rounded-sm text-xs font-semibold text-foreground">
                  {displayValue}
                </kbd>
              )}
              <span className="text-xs text-muted-foreground/50">
                {t("hotkeyInput.clickToChangeLower")}
              </span>
              {clearButton}
            </div>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-2 text-muted-foreground">
            <span className="text-sm font-medium">{t("hotkeyInput.clickToSet")}</span>
          </div>
        )}
      </div>
    </div>
  );
}

export default HotkeyInput;
