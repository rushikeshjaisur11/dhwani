import { en as enPrompts, type PromptBundle } from "../../locales/prompts";

const DEFAULT_CHAT_AGENT_PROMPT =
  "You are a helpful voice assistant. Respond concisely and conversationally. " +
  "Keep answers brief unless the user asks for detail. " +
  "You may be given a transcription of spoken input, so handle informal phrasing gracefully.";

const DEFAULT_POLISH_PROMPT =
  "You are rewriting a piece of text the user just selected in another application. " +
  "Apply the requested edits below, but preserve the original meaning, facts, and " +
  "any code, names, or formatting that shouldn't change. Return only the rewritten " +
  "text with no preamble, quotes, or explanation.\n\nRequested edits:\n{{polishInstructions}}";

export const PROMPT_KINDS = {
  cleanup: {
    i18nKey: "cleanupPrompt" as const,
    fallback: enPrompts.cleanupPrompt,
  },
  dictationAgent: {
    i18nKey: "fullPrompt" as const,
    fallback: enPrompts.fullPrompt,
  },
  chatAgent: {
    i18nKey: null,
    fallback: DEFAULT_CHAT_AGENT_PROMPT,
  },
  polish: {
    i18nKey: null,
    fallback: DEFAULT_POLISH_PROMPT,
  },
} as const satisfies Record<string, { i18nKey: keyof PromptBundle | null; fallback: string }>;

export type PromptKind = keyof typeof PROMPT_KINDS;
export const PROMPT_KIND_LIST = Object.keys(PROMPT_KINDS) as readonly PromptKind[];
