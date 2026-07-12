import { useCallback, useEffect } from "react";
import { getSettings } from "../stores/settingsStore";
import ReasoningService from "../services/ReasoningService";
import logger from "../utils/logger";
import {
  getEffectiveTransformsSync,
  BUILTIN_POLISH_ID,
} from "../config/transforms/loadEffectiveTransforms";

const OPT_IN_KEY = "transformsOptIn";
const SYNCED_STORAGE_KEYS = new Set(["customTransforms", "transformDefaultsCache"]);

// Pushes the current {id, hotkey} mapping to the main process, which has no
// persisted memory of per-transform hotkeys (they live in this renderer's
// localStorage, not main-process env vars like Polish's single hotkey).
// Polish is excluded: it isn't a real transform-pipeline entry, it's a UI
// mirror of the existing Settings Polish hotkey (see BUILTIN_POLISH_ID).
function syncTransformHotkeys() {
  const list = getEffectiveTransformsSync()
    .filter((tr) => tr.shortcut && tr.id !== BUILTIN_POLISH_ID)
    .map((tr) => ({ id: tr.id, hotkey: tr.shortcut }));
  window.electronAPI?.syncTransformHotkeys?.(list);
}

// Transforms: applies a saved rewrite prompt to the text currently selected
// in whatever app has focus, triggered by that transform's own hotkey.
// Mirrors usePolish.js (same capture -> rewrite -> paste shape), reusing the
// dictation-cleanup model like Polish does.
export function useTransform(toast, t) {
  const runTransform = useCallback(
    async (transformId) => {
      if (localStorage.getItem(OPT_IN_KEY) !== "true") return;

      const transform = getEffectiveTransformsSync().find((tr) => tr.id === transformId);
      if (!transform) return;

      const settings = getSettings();

      try {
        const capture = await window.electronAPI?.captureSelectedText?.();
        if (!capture?.success || !capture.text?.trim()) {
          toast?.({
            title: t("transforms.noSelection", { defaultValue: "Select some text first" }),
          });
          return;
        }

        // Shown in the dictation preview overlay while the LLM call runs,
        // mirroring the "Polishing..." state dictation cleanup already has.
        await window.electronAPI?.showTransformProcessing?.(transform.name);

        // No explicit `provider` here on purpose: the real dictation-cleanup
        // path (audioManager.js's resolveReasoningRoute) omits it too, so
        // ReasoningService derives the provider from the model id itself
        // (getModelProvider). settings.cleanupProvider can be stale/wrong
        // for local models (e.g. holds a model-family name instead of
        // "local"), which would otherwise short-circuit that derivation.
        const rewritten = await ReasoningService.processText(
          capture.text,
          settings.cleanupModel,
          null,
          {
            disableThinking: settings.cleanupDisableThinking,
            systemPrompt: transform.prompt,
          }
        );

        const finalText = rewritten?.trim();
        if (!finalText) {
          window.electronAPI?.hideDictationPreview?.();
          return;
        }

        // Recorded so Win+Alt+O can redisplay this before/after later.
        await window.electronAPI?.recordTransformResult?.({
          name: transform.name,
          before: capture.text,
          after: finalText,
        });
        await window.electronAPI?.pasteText?.(finalText);
        window.electronAPI?.hideDictationPreview?.();
      } catch (error) {
        logger.error("Transform failed", { error: error?.message }, "transform");
        window.electronAPI?.hideDictationPreview?.();
        toast?.({
          title: t("transforms.failed", { defaultValue: "Transform failed" }),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  useEffect(() => {
    const dispose = window.electronAPI?.onTriggerTransform?.((transformId) => {
      void runTransform(transformId);
    });
    return () => dispose?.();
  }, [runTransform]);

  // Keep main's hotkey registrations in sync with the transform list, which
  // is edited in a different renderer window (Transforms settings page).
  useEffect(() => {
    syncTransformHotkeys();
    const handleStorage = (event) => {
      if (event.key && SYNCED_STORAGE_KEYS.has(event.key)) syncTransformHotkeys();
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);
}
