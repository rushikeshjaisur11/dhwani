export const normalize = (s) =>
  s
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

export function matchesDictionaryPrompt(text, dictionaryPrompt) {
  if (!text || !dictionaryPrompt) return false;

  const normalizedText = normalize(text);
  const normalizedPrompt = normalize(dictionaryPrompt);

  if (normalizedText === normalizedPrompt) return true;

  const dictWords = new Set(normalizedPrompt.split(" "));
  const uniqueTextWords = new Set(normalizedText.split(" "));

  let matchCount = 0;
  for (const word of uniqueTextWords) {
    if (dictWords.has(word)) matchCount++;
  }

  const textComposition = matchCount / uniqueTextWords.size;
  const dictionaryUsage = matchCount / dictWords.size;

  return textComposition >= 0.9 && dictionaryUsage >= 0.7;
}

// Whisper's initial-prompt conditioning can bleed a run of dictionary words
// into the start or end of an otherwise-real transcript (not just echo the
// whole thing). Only strip a run of 2+ consecutive dictionary words at a
// boundary -- a single matching word is left alone, since the user may have
// genuinely spoken a term that's also in their dictionary.
const MIN_BOUNDARY_RUN = 2;

export function stripDictionaryBoundaryEcho(text, dictionaryPrompt) {
  if (!text || !dictionaryPrompt) return text;

  const dictWords = new Set(normalize(dictionaryPrompt).split(" ").filter(Boolean));
  if (dictWords.size === 0) return text;

  const tokens = text.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return text;

  const isDictWord = (token) => dictWords.has(normalize(token));

  let start = 0;
  while (start < tokens.length && isDictWord(tokens[start])) start++;

  let end = tokens.length;
  while (end > start && isDictWord(tokens[end - 1])) end--;

  const finalStart = start >= MIN_BOUNDARY_RUN ? start : 0;
  const finalEnd = tokens.length - end >= MIN_BOUNDARY_RUN ? end : tokens.length;

  if (finalStart === 0 && finalEnd === tokens.length) return text;

  return tokens.slice(finalStart, finalEnd).join(" ").trim();
}
