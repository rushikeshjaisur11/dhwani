import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Pencil, RotateCcw } from "lucide-react";
import { Kbd } from "./ui/Kbd";
import HotkeyInput from "./ui/HotkeyInput";
import { Toggle } from "./ui/toggle";
import { Textarea } from "./ui/textarea";
import { useToast } from "./ui/useToast";
import { useHotkeyRegistration } from "../hooks/useHotkeyRegistration";
import { useSettingsStore } from "../stores/settingsStore";
import { formatHotkeyLabel } from "../utils/hotkeys";
import {
  BUILTIN_POLISH_ID,
  loadBuiltinOverrides,
  saveBuiltinOverride,
  type Transform,
} from "../config/transforms/loadEffectiveTransforms";

const PROMPT_SAVE_DEBOUNCE_MS = 600;

interface TransformDetailViewProps {
  transform: Transform; // the builtin's default (pre-override) definition
  onBack: () => void;
}

function ShortcutChips({ hotkey }: { hotkey: string }) {
  if (!hotkey) return null;
  return (
    <>
      {formatHotkeyLabel(hotkey)
        .split("+")
        .map((key) => (
          <Kbd key={key} className="text-[10px] px-1.5 py-0.5">
            {key}
          </Kbd>
        ))}
    </>
  );
}

// Full-page config view for the builtin transforms (Polish / Prompt
// Engineer), opened from the Transforms card grid.
export default function TransformDetailView({ transform, onBack }: TransformDetailViewProps) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const isPolish = transform.id === BUILTIN_POLISH_ID;

  const polishKey = useSettingsStore((s) => s.polishKey);
  const setPolishKey = useSettingsStore((s) => s.setPolishKey);
  const instructionConcise = useSettingsStore((s) => s.polishInstructionConcise);
  const instructionClarity = useSettingsStore((s) => s.polishInstructionClarity);
  const instructionTone = useSettingsStore((s) => s.polishInstructionTone);
  const instructionStructure = useSettingsStore((s) => s.polishInstructionStructure);
  const setInstructionConcise = useSettingsStore((s) => s.setPolishInstructionConcise);
  const setInstructionClarity = useSettingsStore((s) => s.setPolishInstructionClarity);
  const setInstructionTone = useSettingsStore((s) => s.setPolishInstructionTone);
  const setInstructionStructure = useSettingsStore((s) => s.setPolishInstructionStructure);

  const [override, setOverride] = useState(() => loadBuiltinOverrides()[transform.id] ?? {});
  const [prompt, setPrompt] = useState(() => override.prompt ?? transform.prompt);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const effectiveShortcut = isPolish
    ? polishKey || transform.shortcut || ""
    : override.shortcut ?? transform.shortcut ?? "";

  const persistOverride = useCallback(
    (next: { shortcut?: string; prompt?: string }) => {
      const merged = { ...loadBuiltinOverrides()[transform.id], ...next };
      // Drop keys that match the default so the entry stays minimal.
      if (merged.prompt === transform.prompt) delete merged.prompt;
      if (merged.shortcut === transform.shortcut) delete merged.shortcut;
      saveBuiltinOverride(transform.id, Object.keys(merged).length ? merged : null);
      setOverride(merged);
    },
    [transform]
  );

  // Prompt Engineer prompt edits — debounced autosave into the override.
  const schedulePromptSave = useCallback(
    (value: string) => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
      promptTimerRef.current = setTimeout(() => {
        persistOverride({ prompt: value });
      }, PROMPT_SAVE_DEBOUNCE_MS);
    },
    [persistOverride]
  );

  useEffect(() => {
    return () => {
      if (promptTimerRef.current) clearTimeout(promptTimerRef.current);
    };
  }, []);

  const polishRegisterFn = useCallback(async (hotkey: string) => {
    const result = await window.electronAPI?.registerPolishHotkey?.(hotkey);
    return result ?? { success: false, message: "Electron API unavailable" };
  }, []);

  const transformRegisterFn = useCallback(
    async (hotkey: string) => {
      const result = await window.electronAPI?.registerTransformHotkey?.(transform.id, hotkey);
      return result ?? { success: false, message: "Electron API unavailable" };
    },
    [transform.id]
  );

  const { registerHotkey, isRegistering } = useHotkeyRegistration({
    onSuccess: (hotkey) => {
      if (isPolish) setPolishKey(hotkey);
      else persistOverride({ shortcut: hotkey });
    },
    showSuccessToast: false,
    showErrorToast: true,
    showAlert: (opts) => toast(opts),
    registerFn: isPolish ? polishRegisterFn : transformRegisterFn,
  });

  const handleClearShortcut = useCallback(() => {
    if (isPolish) {
      void window.electronAPI?.registerPolishHotkey?.("");
      setPolishKey("");
    } else {
      void window.electronAPI?.registerTransformHotkey?.(transform.id, "");
      persistOverride({ shortcut: "" });
    }
  }, [isPolish, persistOverride, setPolishKey, transform.id]);

  const handleReset = useCallback(() => {
    saveBuiltinOverride(transform.id, null);
    setOverride({});
    setPrompt(transform.prompt);
    if (isPolish) {
      setInstructionConcise(true);
      setInstructionClarity(true);
      setInstructionTone(true);
      setInstructionStructure(false);
      if (transform.shortcut) {
        void polishRegisterFn(transform.shortcut).then((result) => {
          if (result?.success) setPolishKey(transform.shortcut!);
        });
      }
    } else if (transform.shortcut) {
      void transformRegisterFn(transform.shortcut);
    }
  }, [
    isPolish,
    polishRegisterFn,
    setInstructionClarity,
    setInstructionConcise,
    setInstructionStructure,
    setInstructionTone,
    setPolishKey,
    transform,
    transformRegisterFn,
  ]);

  const polishRules = [
    {
      label: t("transformDetail.rules.concise", { defaultValue: "Make more concise" }),
      checked: instructionConcise,
      onChange: setInstructionConcise,
    },
    {
      label: t("transformDetail.rules.clarity", { defaultValue: "Reword for clarity" }),
      checked: instructionClarity,
      onChange: setInstructionClarity,
    },
    {
      label: t("transformDetail.rules.reorder", { defaultValue: "Reorder for readability" }),
      checked: instructionTone,
      onChange: setInstructionTone,
    },
    {
      label: t("transformDetail.rules.structure", {
        defaultValue: "Add structure for readability",
      }),
      checked: instructionStructure,
      onChange: setInstructionStructure,
    },
  ];

  return (
    <div className="flex min-h-full flex-col">
      {/* Top bar */}
      <div className="flex items-center justify-between px-5 py-3">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft size={15} />
          {t("transformDetail.back", { defaultValue: "Back" })}
        </button>
        <div className="flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {t("transformDetail.autosaveOn", { defaultValue: "Autosave On" })}
          </span>
          <button
            onClick={handleReset}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RotateCcw size={12} />
            {t("transformDetail.reset", { defaultValue: "Reset" })}
          </button>
        </div>
      </div>

      <div className="flex flex-1 gap-0">
        {/* Left column */}
        <div className="w-[280px] shrink-0 border-r border-border/60 px-5 pb-6">
          <h1
            className="text-4xl text-foreground"
            style={{ fontFamily: "var(--font-family-flow-serif)" }}
          >
            {transform.name}
          </h1>

          {effectiveShortcut && (
            <div className="mt-4 inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1.5">
              <ShortcutChips hotkey={effectiveShortcut} />
              <span className="ml-1 text-xs text-muted-foreground">
                {t("transformDetail.toUse", { defaultValue: "to use" })}
              </span>
            </div>
          )}

          <p className="mt-4 text-sm leading-relaxed text-foreground/80">
            {isPolish
              ? t("transformDetail.polishDescription", {
                  defaultValue: "Polish rewrites your text to sound clearer, in your voice.",
                })
              : t("transformDetail.promptEngineerDescription", {
                  defaultValue:
                    "Prompt Engineer takes messy, spoken, unstructured thoughts and converts them into a clean, optimized AI prompt.",
                })}
          </p>

          <div className="my-5 h-px bg-border/60" />

          <h2 className="text-sm font-semibold text-foreground">
            {t("transformDetail.exampleTitle", { defaultValue: "Example of transformed text" })}
          </h2>

          {isPolish ? (
            <p className="mt-3 text-[13px] leading-relaxed text-foreground/70">
              {t("transformDetail.polishExample", {
                defaultValue:
                  "hey so about the deck i added some slides but im not sure if they go with your part. it seems kinda long maybe we should remove the market trends thing? i can look at it again tonight if u want. also the pricing slide might be wrong cuz the data changed. we should check before sending to the board",
              })}
            </p>
          ) : (
            <div className="mt-3 space-y-2 text-[13px] leading-relaxed">
              <p className="text-foreground/45 line-through">
                {t("transformDetail.promptEngineerExampleBefore", {
                  defaultValue:
                    "I need help writing product descriptions for a skincare brand. The AI should be warm, aspirational, and concise",
                })}
              </p>
              <p>
                <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-semibold text-foreground">
                  **Title**
                </span>
                <br />
                <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-foreground/90">
                  {t("transformDetail.promptEngineerExampleTitle", {
                    defaultValue: "Skincare Product Descriptions",
                  })}
                </span>
              </p>
              <p>
                <span className="rounded bg-emerald-500/15 px-1 py-0.5 font-semibold text-foreground">
                  **Role &amp; stance**
                </span>
                <br />
                <span className="rounded bg-emerald-500/15 px-1 py-0.5 text-foreground/90">
                  {t("transformDetail.promptEngineerExampleRole", {
                    defaultValue:
                      "You are a copywriter for a skincare brand, adopting a warm, aspirational, and concise tone.",
                  })}
                </span>
              </p>
            </div>
          )}
        </div>

        {/* Right column */}
        <div className="flex-1 space-y-4 px-5 pb-6">
          <div className="rounded-xl bg-muted/50 p-4">
            <h3 className="text-sm font-semibold text-foreground">
              {t("transformDetail.chooseShortcut", { defaultValue: "Choose a keyboard shortcut" })}
            </h3>
            <div className="mt-3 flex items-center gap-2">
              <div className="flex-1">
                <HotkeyInput
                  value={effectiveShortcut}
                  onChange={(hotkey) => void registerHotkey(hotkey)}
                  onClear={handleClearShortcut}
                  disabled={isRegistering}
                  slotName={isPolish ? "polish" : `transform:${transform.id}`}
                />
              </div>
              <Pencil size={14} className="shrink-0 text-muted-foreground" />
            </div>
          </div>

          {isPolish ? (
            <div>
              <h3 className="mb-3 text-sm font-semibold text-foreground">
                {t("transformDetail.selectRules", { defaultValue: "Select rules for Polish" })}
              </h3>
              <div className="overflow-hidden rounded-xl bg-muted/50">
                {polishRules.map((rule, i) => (
                  <div
                    key={rule.label}
                    className={[
                      "flex items-center justify-between px-4 py-3.5",
                      i > 0 ? "border-t border-border/40" : "",
                    ].join(" ")}
                  >
                    <span className="text-sm text-foreground">{rule.label}</span>
                    <Toggle checked={rule.checked} onChange={rule.onChange} />
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-xl bg-muted/50 p-4">
              <h3 className="text-sm font-semibold text-foreground">
                {t("transformDetail.customizePrompt", {
                  defaultValue:
                    "Customize prompt. (This is what the final output of the prompt will look like)",
                })}
              </h3>
              <Textarea
                value={prompt}
                onChange={(e) => {
                  setPrompt(e.target.value);
                  schedulePromptSave(e.target.value);
                }}
                rows={12}
                className="mt-3 min-h-[260px] bg-card text-sm leading-relaxed"
              />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
