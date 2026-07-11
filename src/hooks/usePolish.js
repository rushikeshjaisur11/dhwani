import { useCallback, useEffect } from "react";
import { getSettings } from "../stores/settingsStore";
import { resolvePrompt } from "../config/prompts";
import ReasoningService from "../services/ReasoningService";
import logger from "../utils/logger";

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

      const polished = await ReasoningService.processText(
        capture.text,
        settings.cleanupModel,
        null,
        {
          provider: settings.cleanupProvider,
          disableThinking: settings.cleanupDisableThinking,
          systemPrompt,
        }
      );

      const finalText = polished?.trim();
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
