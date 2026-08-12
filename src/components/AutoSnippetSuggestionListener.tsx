import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "./ui/useToast";
import { Button } from "./ui/button";
import { useSettings } from "../hooks/useSettings";
import { findAutoSnippetSuggestion } from "../utils/autoSnippetSuggest";

const DISMISSED_KEY = "autoSnippetSuggestDismissed";
const SAMPLE_SIZE = 150;
const MAX_DISMISSED = 20;

function readDismissed(): string[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(DISMISSED_KEY) ?? "[]");
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function addDismissed(normalized: string) {
  const next = [...readDismissed(), normalized].slice(-MAX_DISMISSED);
  localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
}

/**
 * Headless. Mount once in ControlPanel (settings window), same as
 * BackgroundActionToastListener. Runs once per settings-window session
 * rather than after every dictation — the overlay window can save many
 * transcriptions per session, so checking on every save would be wasteful;
 * a natural lifecycle point (opening settings) is a cheap, good-enough cadence.
 */
export default function AutoSnippetSuggestionListener({
  onAcceptSuggestion,
}: {
  onAcceptSuggestion: (replacement: string) => void;
}) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const { snippets } = useSettings();
  const hasChecked = useRef(false);

  useEffect(() => {
    if (hasChecked.current) return;
    hasChecked.current = true;

    (async () => {
      const transcriptions = await window.electronAPI.getTranscriptions(SAMPLE_SIZE);
      const suggestion = findAutoSnippetSuggestion(
        transcriptions.map((item) => item.text),
        snippets,
        readDismissed()
      );
      if (!suggestion) return;

      // Mark as seen immediately — whether accepted or dismissed, we don't
      // want to re-prompt for the same phrase next session.
      addDismissed(suggestion.normalized);

      toast({
        title: t("dictionary.snippets.autoSuggest.title"),
        description: t("dictionary.snippets.autoSuggest.description", {
          phrase:
            suggestion.sample.length > 80
              ? `${suggestion.sample.slice(0, 80)}…`
              : suggestion.sample,
        }),
        duration: 10000,
        action: (
          <Button
            size="sm"
            className="h-6 px-2 text-[11px]"
            onClick={() => onAcceptSuggestion(suggestion.sample)}
          >
            {t("dictionary.snippets.autoSuggest.accept")}
          </Button>
        ),
      });
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}
