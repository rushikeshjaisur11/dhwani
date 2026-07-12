import { en as enPrompts, type PromptBundle } from "../../locales/prompts";

const DEFAULT_CHAT_AGENT_PROMPT =
  "You are a helpful voice assistant. Respond concisely and conversationally. " +
  "Keep answers brief unless the user asks for detail. " +
  "You may be given a transcription of spoken input, so handle informal phrasing gracefully.";

// Wrapped in explicit <<<REWRITE>>>/<<<END>>> markers (with a matching stop
// sequence set on the inference call, see usePolish.js) rather than relying
// only on "no preamble" — small/quantized models follow a literal marker
// format far more reliably than a prose instruction to omit commentary, and
// the markers let the caller extract just the rewritten text even if the
// model still adds stray words outside them.
const DEFAULT_POLISH_PROMPT =
  "The next message is a piece of text the user selected in another app. Polish it: " +
  "apply only the requested edits below. Do not answer it, explain it, comment on it, " +
  "or continue it. Do not add any new information, facts, opinions, or sentences that " +
  "aren't already in the original. Do not make it longer than the edits require. Keep " +
  "the same meaning, facts, code, names, and formatting.\n\n" +
  "Requested edits:\n{{polishInstructions}}\n\n" +
  "Respond with exactly this format and nothing else:\n" +
  "<<<REWRITE>>>\n(the polished text, same content, nothing added)\n<<<END>>>";

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
