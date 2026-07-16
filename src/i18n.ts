import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import enTranslation from "./locales/en/translation.json";
import enPrompts from "./locales/en/prompts.json";

export const SUPPORTED_UI_LANGUAGES = [
  "en",
  "es",
  "fr",
  "de",
  "pt",
  "it",
  "ru",
  "ja",
  "zh-CN",
  "zh-TW",
] as const;
export type UiLanguage = (typeof SUPPORTED_UI_LANGUAGES)[number];

export function normalizeUiLanguage(language: string | null | undefined): UiLanguage {
  const candidate = (language || "").trim();

  // Check full language-region code first (e.g. "zh-CN", "zh-TW")
  const normalized = candidate.replace("_", "-");
  const fullMatch = SUPPORTED_UI_LANGUAGES.find(
    (lang) => lang.toLowerCase() === normalized.toLowerCase()
  );
  if (fullMatch) return fullMatch;

  // Fall back to base language code (e.g. "en" from "en-US")
  const base = candidate.split("-")[0].split("_")[0].toLowerCase() as UiLanguage;
  if (SUPPORTED_UI_LANGUAGES.includes(base)) {
    return base;
  }

  return "en";
}

// Only `en` ships in the eager bundle (it is also the fallback locale). Every
// other locale loads as its own lazy chunk on first use. Non-en users see up
// to one frame of English on cold start before their locale finishes loading.
type LocaleBundle = { translation: object; prompts: object };

const LOCALE_LOADERS: Record<Exclude<UiLanguage, "en">, () => Promise<LocaleBundle>> = {
  es: async () => ({
    translation: (await import("./locales/es/translation.json")).default,
    prompts: (await import("./locales/es/prompts.json")).default,
  }),
  fr: async () => ({
    translation: (await import("./locales/fr/translation.json")).default,
    prompts: (await import("./locales/fr/prompts.json")).default,
  }),
  de: async () => ({
    translation: (await import("./locales/de/translation.json")).default,
    prompts: (await import("./locales/de/prompts.json")).default,
  }),
  pt: async () => ({
    translation: (await import("./locales/pt/translation.json")).default,
    prompts: (await import("./locales/pt/prompts.json")).default,
  }),
  it: async () => ({
    translation: (await import("./locales/it/translation.json")).default,
    prompts: (await import("./locales/it/prompts.json")).default,
  }),
  ru: async () => ({
    translation: (await import("./locales/ru/translation.json")).default,
    prompts: (await import("./locales/ru/prompts.json")).default,
  }),
  ja: async () => ({
    translation: (await import("./locales/ja/translation.json")).default,
    prompts: (await import("./locales/ja/prompts.json")).default,
  }),
  "zh-CN": async () => ({
    translation: (await import("./locales/zh-CN/translation.json")).default,
    prompts: (await import("./locales/zh-CN/prompts.json")).default,
  }),
  "zh-TW": async () => ({
    translation: (await import("./locales/zh-TW/translation.json")).default,
    prompts: (await import("./locales/zh-TW/prompts.json")).default,
  }),
};

const loadedLocales = new Set<UiLanguage>(["en"]);

export async function loadLocale(language: UiLanguage): Promise<void> {
  if (loadedLocales.has(language)) return;
  const bundle = await LOCALE_LOADERS[language as Exclude<UiLanguage, "en">]();
  i18n.addResourceBundle(language, "translation", bundle.translation, false, false);
  i18n.addResourceBundle(language, "prompts", bundle.prompts, false, false);
  loadedLocales.add(language);
}

export async function changeUiLanguage(language: string): Promise<void> {
  const normalized = normalizeUiLanguage(language);
  await loadLocale(normalized);
  await i18n.changeLanguage(normalized);
}

const browserLanguage =
  typeof navigator !== "undefined" ? navigator.language || navigator.languages?.[0] : undefined;

const storageLanguage =
  typeof window !== "undefined" ? window.localStorage.getItem("uiLanguage") : undefined;

const initialLanguage = normalizeUiLanguage(storageLanguage || browserLanguage || "en");

void i18n.use(initReactI18next).init({
  resources: {
    en: {
      translation: enTranslation,
      prompts: enPrompts,
    },
  },
  lng: "en",
  fallbackLng: "en",
  ns: ["translation", "prompts"],
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
  returnEmptyString: true,
  returnNull: false,
});

if (initialLanguage !== "en") {
  void changeUiLanguage(initialLanguage);
}

export default i18n;
