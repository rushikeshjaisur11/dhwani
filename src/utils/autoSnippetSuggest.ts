import { normalize } from "./dictionaryEchoFilter.js";
import type { Snippet } from "./snippets";

const MIN_REPEATS = 3;
// Skip trivial short utterances ("yes", "ok", "thanks") — not worth a snippet.
const MIN_WORDS = 3;

export interface AutoSnippetSuggestion {
  /** Normalized phrase, used as the dismissal/dedup key. */
  normalized: string;
  /** Original-cased text of the most recent occurrence, for prefilling the snippet replacement. */
  sample: string;
  count: number;
}

/**
 * Finds the most-repeated dictated phrase across recent transcriptions that
 * isn't already covered by an existing snippet. Exact match after
 * normalization (lowercase, strip punctuation, collapse whitespace) — same
 * normalize() used for dictionary-echo matching, not a similarity/clustering
 * pipeline.
 */
export function findAutoSnippetSuggestion(
  transcriptionTexts: string[],
  snippets: Snippet[],
  dismissed: string[] = []
): AutoSnippetSuggestion | null {
  const excluded = new Set(dismissed);
  for (const s of snippets) {
    excluded.add(normalize(s.trigger));
    excluded.add(normalize(s.replacement));
  }

  const counts = new Map<string, { count: number; sample: string }>();
  for (const text of transcriptionTexts) {
    if (!text) continue;
    const normalized = normalize(text);
    if (!normalized || normalized.split(" ").length < MIN_WORDS) continue;
    if (excluded.has(normalized)) continue;

    const entry = counts.get(normalized);
    if (entry) {
      entry.count++;
    } else {
      counts.set(normalized, { count: 1, sample: text.trim() });
    }
  }

  let best: AutoSnippetSuggestion | null = null;
  for (const [normalized, { count, sample }] of counts) {
    if (count >= MIN_REPEATS && (!best || count > best.count)) {
      best = { normalized, sample, count };
    }
  }
  return best;
}
