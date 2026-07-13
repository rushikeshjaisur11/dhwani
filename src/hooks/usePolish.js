import { useCallback, useEffect } from "react";
import { getSettings } from "../stores/settingsStore";
import { resolvePrompt } from "../config/prompts";
import ReasoningService from "../services/ReasoningService";
import logger from "../utils/logger";
import { BUILTIN_POLISH_ID } from "../config/transforms/loadEffectiveTransforms";

const REWRITE_STOP_SEQUENCE = "<<<END>>>";

// Extracts the text between <<<REWRITE>>>/<<<END>>> markers (see
// DEFAULT_POLISH_PROMPT). Falls back to the raw response if a model ignores
// the format entirely, so weaker models still degrade gracefully.
function extractRewrite(raw) {
  const match = /<<<REWRITE>>>([\s\S]*?)(?:<<<END>>>|$)/.exec(raw || "");
  return (match ? match[1] : raw || "").trim();
}

// Core polish call, provider-agnostic (same prompt + extraction for local and
// cloud models). Exported so Auto Apply After Dictation (useAudioRecording)
// can polish a transcript without the capture/paste ceremony.
export async function applyPolishToText(text, settings = getSettings()) {
  const instructions = [
    settings.polishInstructionConcise && "Make it more concise",
    settings.polishInstructionClarity && "Improve clarity and flow",
    settings.polishInstructionTone &&
      "Reorder sentences and ideas for readability",
    settings.polishInstructionStructure &&
      "Add structure (lists/paragraphs) where it helps readability",
  ].filter(Boolean);

  const systemPrompt = resolvePrompt("polish", {
    agentName: null,
    polishInstructions: instructions,
  });

  // No explicit `provider` here on purpose: the real dictation-cleanup
  // path (audioManager.js's resolveReasoningRoute) omits it too, so
  // ReasoningService derives the provider from the model id itself
  // (getModelProvider). settings.cleanupProvider can be stale/wrong for
  // local models (e.g. holds a model-family name instead of "local"),
  // which would otherwise short-circuit that derivation.
  const polished = await ReasoningService.processText(
    text,
    settings.cleanupModel,
    null,
    {
      disableThinking: settings.cleanupDisableThinking,
      systemPrompt,
      stop: [REWRITE_STOP_SEQUENCE],
      maxTokens: 2048,
    }
  );

  return extractRewrite(polished);
}

// Polish: rewrites the text currently selected in whatever app has focus.
// Reuses the dictation-cleanup model/provider (no dedicated Polish model
// selection yet) since it's the same "light rewrite" quality tier.
export function usePolish(toast, t) {
  const runPolish = useCallback(
    async (textOverride) => {
      const settings = getSettings();
      if (!settings.polishEnabled) return;
      // Transforms opt-in gates Polish too (same switch as useTransform.js).
      if (localStorage.getItem("transformsOptIn") !== "true") return;

      try {
        let text = textOverride;
        if (!text) {
          const capture = await window.electronAPI?.captureSelectedText?.();
          if (!capture?.success || !capture.text?.trim()) {
            toast?.({
              title: t("polish.noSelection", { defaultValue: "Select some text first" }),
            });
            return;
          }
          text = capture.text;
        }

        // Shown in the dictation preview overlay while the LLM call runs.
        await window.electronAPI?.showTransformProcessing?.("Polish");

        const finalText = await applyPolishToText(text, settings);
        if (!finalText) {
          // Empty name clears the pill's processing status.
          window.electronAPI?.showTransformProcessing?.("");
          return;
        }

        // Recording triggers the changes card (and Win+Alt+O replay).
        await window.electronAPI?.recordTransformResult?.({
          id: BUILTIN_POLISH_ID,
          name: "Polish",
          before: text,
          after: finalText,
        });
        // Retry runs (textOverride) only refresh the changes card — pasting
        // would land in whatever window happens to be focused.
        if (!textOverride) await window.electronAPI?.pasteText?.(finalText);
      } catch (error) {
        logger.error("Polish failed", { error: error?.message }, "polish");
        window.electronAPI?.showTransformProcessing?.("");
        toast?.({
          title: t("polish.failed", { defaultValue: "Polish failed" }),
          variant: "destructive",
        });
      }
    },
    [toast, t]
  );

  useEffect(() => {
    const dispose = window.electronAPI?.onTriggerPolish?.((payload) => {
      void runPolish(payload?.text);
    });
    return () => dispose?.();
  }, [runPolish]);
}
