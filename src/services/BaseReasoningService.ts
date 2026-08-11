import { getCleanupSystemPrompt } from "../config/prompts";
import { getSettings } from "../stores/settingsStore";
import { getDictionaryHintWords } from "../utils/snippets";

export interface ReasoningConfig {
  maxTokens?: number;
  temperature?: number;
  contextSize?: number;
  systemPrompt?: string;
  lanUrl?: string;
  baseUrl?: string;
  customApiKey?: string;
  provider?: string;
  disableThinking?: boolean;
  /** Stop sequence(s) the model should halt generation at (local provider only). */
  stop?: string[];
}

export abstract class BaseReasoningService {
  protected isProcessing = false;

  protected getCustomDictionary(): string[] {
    return getDictionaryHintWords(getSettings());
  }

  protected getPreferredLanguage(): string {
    // outputLanguage (Settings -> Speech to Text -> Language) asks the
    // cleanup model to rewrite the transcript into a different language than
    // what was spoken; when set it overrides the "write output in the
    // detected language" instruction that preferredLanguage/"auto" would
    // otherwise produce. Reuses the same instruction mechanism as
    // preferredLanguage (getLanguageInstruction), so no new prompt plumbing.
    const { preferredLanguage, outputLanguage } = getSettings();
    return outputLanguage || preferredLanguage || "auto";
  }

  protected getUiLanguage(): string {
    return getSettings().uiLanguage || "en";
  }

  protected getSystemPrompt(agentName: string | null): string {
    return getCleanupSystemPrompt(
      agentName,
      this.getCustomDictionary(),
      this.getPreferredLanguage(),
      this.getUiLanguage()
    );
  }

  protected calculateMaxTokens(
    textLength: number,
    minTokens = 100,
    maxTokens = 2048,
    multiplier = 2
  ): number {
    return Math.max(minTokens, Math.min(textLength * multiplier, maxTokens));
  }

  abstract isAvailable(): Promise<boolean>;

  abstract processText(
    text: string,
    modelId: string,
    agentName?: string | null,
    config?: ReasoningConfig
  ): Promise<string>;
}
