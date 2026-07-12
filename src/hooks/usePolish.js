import { useCallback, useEffect } from "react";
import { getSettings } from "../stores/settingsStore";
import { resolvePrompt } from "../config/prompts";
import ReasoningService from "../services/ReasoningService";
import logger from "../utils/logger";

const REWRITE_STOP_SEQUENCE = "<<<END>>>";

// Extracts the text between <<<REWRITE>>>/<<<END>>> markers (see
// DEFAULT_POLISH_PROMPT). Falls back to the raw response if a model ignores
// the format entirely, so weaker models still degrade gracefully.
function extractRewrite(raw) {
  const match = /<<<REWRITE>>>([\s\S]*?)(?:<<<END>>>|$)/.exec(raw || "");
  return (match ? match[1] : raw || "").trim();
}

// Polish: rewrites the text currently selected in whatever app has focus.
// Reuses the dictation-cleanup model/provider (no dedicated Polish model
// selection yet) since it's the same "light rewrite" quality tier.
export function usePolish(toast, t) {
  const runPolish = useCallback(async () => {
    const settings = getSettings();
    if (!settings.polishEnabled) return;

    try {
      const capture = await window.electronAPI?.captureSelectedText?.();
      if (!capture?.success || !capture.text?.trim()) {
        toast?.({
          title: t("polish.noSelection", { defaultValue: "Select some text first" }),
        });
        return;
      }

      const instructions = [
        settings.polishInstructionConcise && "Make it more concise",
        settings.polishInstructionClarity && "Improve clarity and flow",
        settings.polishInstructionTone && "Preserve the original tone",
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
        capture.text,
        settings.cleanupModel,
        null,
        {
          disableThinking: settings.cleanupDisableThinking,
          systemPrompt,
          stop: [REWRITE_STOP_SEQUENCE],
        }
      );

      const finalText = extractRewrite(polished);
      if (!finalText) return;

      await window.electronAPI?.pasteText?.(finalText);
    } catch (error) {
      logger.error("Polish failed", { error: error?.message }, "polish");
      toast?.({
        title: t("polish.failed", { defaultValue: "Polish failed" }),
        variant: "destructive",
      });
    }
  }, [toast, t]);

  useEffect(() => {
    const dispose = window.electronAPI?.onTriggerPolish?.(() => {
      void runPolish();
    });
    return () => dispose?.();
  }, [runPolish]);
}
