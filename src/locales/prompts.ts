import enPrompts from "./en/prompts.json";

export interface PromptBundle {
  cleanupPrompt: string;
  fullPrompt: string;
  dictionarySuffix: string;
}

// Only `en` is exported eagerly — it is the fallback used for prompt
// defaultValues. Other locales load lazily via src/i18n.ts loadLocale().
export const en: PromptBundle = enPrompts;
