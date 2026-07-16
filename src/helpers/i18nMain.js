const i18next = require("i18next");

const SUPPORTED_UI_LANGUAGES = ["en", "es", "fr", "de", "pt", "it", "ru", "ja", "zh-CN", "zh-TW"];

// Locale JSON is required on demand: only `en` (the fallback) and the active
// UI language load at startup instead of all 10 locales.
function localeResources(lang) {
  return {
    translation: require(`../locales/${lang}/translation.json`),
    prompts: require(`../locales/${lang}/prompts.json`),
  };
}

function normalizeUiLanguage(language) {
  const candidate = (language || "").trim();

  // Check full language-region code first (e.g. "zh-CN", "zh-TW")
  const normalized = candidate.replace("_", "-");
  const fullMatch = SUPPORTED_UI_LANGUAGES.find(
    (lang) => lang.toLowerCase() === normalized.toLowerCase()
  );
  if (fullMatch) return fullMatch;

  // Fall back to base language code (e.g. "en" from "en-US")
  const base = candidate.split("-")[0].split("_")[0].toLowerCase();
  return SUPPORTED_UI_LANGUAGES.includes(base) ? base : "en";
}

const i18nMain = i18next.createInstance();

const initialLanguage = normalizeUiLanguage(process.env.UI_LANGUAGE);
const loadedLocales = new Set(["en"]);

const resources = { en: localeResources("en") };
if (initialLanguage !== "en") {
  resources[initialLanguage] = localeResources(initialLanguage);
  loadedLocales.add(initialLanguage);
}

void i18nMain.init({
  initAsync: false,
  resources,
  lng: initialLanguage,
  fallbackLng: "en",
  ns: ["translation", "prompts"],
  defaultNS: "translation",
  interpolation: {
    escapeValue: false,
  },
  returnEmptyString: false,
  returnNull: false,
});

function changeLanguage(language) {
  const normalized = normalizeUiLanguage(language);

  if (!loadedLocales.has(normalized)) {
    const res = localeResources(normalized);
    i18nMain.addResourceBundle(normalized, "translation", res.translation);
    i18nMain.addResourceBundle(normalized, "prompts", res.prompts);
    loadedLocales.add(normalized);
  }

  if (i18nMain.language !== normalized) {
    void i18nMain.changeLanguage(normalized);
  }

  return normalized;
}

module.exports = {
  i18nMain,
  changeLanguage,
  normalizeUiLanguage,
  SUPPORTED_UI_LANGUAGES,
};
