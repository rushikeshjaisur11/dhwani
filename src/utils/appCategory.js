// ponytail: keyword match on app/window title, not a maintained app database.
// Upgrade to a real per-app mapping (user-editable list) if the four buckets
// misclassify apps in practice.
const EMAIL_HINTS = ["outlook", "mail", "thunderbird", "gmail"];
const WORK_HINTS = [
  "code",
  "slack",
  "teams",
  "notion",
  "jira",
  "confluence",
  "excel",
  "word",
  "powerpoint",
  "terminal",
  "docs.google",
];
const PERSONAL_HINTS = [
  "whatsapp",
  "messages",
  "imessage",
  "telegram",
  "instagram",
  "facebook",
  "twitter",
  "x.com",
];

function matchesAny(haystack, hints) {
  return hints.some((hint) => haystack.includes(hint));
}

export function categorizeApp(activeApp) {
  const haystack = (activeApp || "").toLowerCase();
  if (!haystack.trim()) return "other";
  if (matchesAny(haystack, EMAIL_HINTS)) return "email";
  if (matchesAny(haystack, WORK_HINTS)) return "work";
  if (matchesAny(haystack, PERSONAL_HINTS)) return "personal";
  return "other";
}

const TONE_INSTRUCTIONS = {
  casual: "Adjust tone to be casual and conversational.",
  formal: "Adjust tone to be formal and professional.",
};

export function resolveStyleInstruction(activeApp, settings) {
  const category = categorizeApp(activeApp);
  const tone = {
    work: settings.styleToneWork,
    email: settings.styleToneEmail,
    personal: settings.styleTonePersonal,
    other: settings.styleToneOther,
  }[category];
  return TONE_INSTRUCTIONS[tone];
}
