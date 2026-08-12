import { describe, it, expect } from "vitest";
import { findAutoSnippetSuggestion } from "./autoSnippetSuggest";
import type { Snippet } from "./snippets";

describe("findAutoSnippetSuggestion", () => {
  it("returns null when a phrase repeats fewer than 3 times", () => {
    const texts = ["let's sync up on this later", "let's sync up on this later"];
    expect(findAutoSnippetSuggestion(texts, [])).toBeNull();
  });

  it("finds a phrase repeated 3+ times after normalization", () => {
    const texts = [
      "Let's sync up on this later.",
      "let's sync up on this later",
      "LET'S SYNC UP ON THIS LATER",
      "something unrelated entirely",
    ];
    const result = findAutoSnippetSuggestion(texts, []);
    expect(result).not.toBeNull();
    expect(result?.count).toBe(3);
    expect(result?.normalized).toBe("lets sync up on this later");
  });

  it("ignores whitespace-only differences between repeats", () => {
    const texts = [
      "please circle back next week",
      "please   circle back   next week",
      "  please circle back next week  ",
    ];
    const result = findAutoSnippetSuggestion(texts, []);
    expect(result?.count).toBe(3);
  });

  it("skips phrases already covered by an existing snippet trigger or replacement", () => {
    const texts = [
      "my linkedin is linkedin.com/in/me",
      "my linkedin is linkedin.com/in/me",
      "my linkedin is linkedin.com/in/me",
    ];
    const snippets: Snippet[] = [
      { trigger: "my linkedin", replacement: "my linkedin is linkedin.com/in/me" },
    ];
    expect(findAutoSnippetSuggestion(texts, snippets)).toBeNull();
  });

  it("skips phrases already dismissed by the user", () => {
    const texts = ["thanks for jumping on the call", "thanks for jumping on the call", "thanks for jumping on the call"];
    const dismissed = ["thanks for jumping on the call"];
    expect(findAutoSnippetSuggestion(texts, [], dismissed)).toBeNull();
  });

  it("skips short utterances even if repeated often", () => {
    const texts = ["ok", "ok", "ok", "ok"];
    expect(findAutoSnippetSuggestion(texts, [])).toBeNull();
  });

  it("picks the most-repeated candidate when multiple qualify", () => {
    const texts = [
      "phrase one repeated",
      "phrase one repeated",
      "phrase one repeated",
      "phrase two repeated often",
      "phrase two repeated often",
      "phrase two repeated often",
      "phrase two repeated often",
    ];
    const result = findAutoSnippetSuggestion(texts, []);
    expect(result?.normalized).toBe("phrase two repeated often");
    expect(result?.count).toBe(4);
  });
});
