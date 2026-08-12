import { describe, it, expect } from "vitest";
import { matchesDictionaryPrompt, stripDictionaryBoundaryEcho } from "./dictionaryEchoFilter";

const DICTIONARY = "Kubernetes, Terraform, Prometheus, Grafana";

describe("matchesDictionaryPrompt", () => {
  it("matches when the whole transcript is the dictionary prompt echoed back", () => {
    expect(matchesDictionaryPrompt("Kubernetes, Terraform, Prometheus, Grafana", DICTIONARY)).toBe(
      true
    );
  });

  it("does not match real speech that happens to use one dictionary word", () => {
    expect(matchesDictionaryPrompt("I deployed Kubernetes yesterday and it went great", DICTIONARY)).toBe(
      false
    );
  });

  it("returns false for empty text or prompt", () => {
    expect(matchesDictionaryPrompt("", DICTIONARY)).toBe(false);
    expect(matchesDictionaryPrompt("hello", "")).toBe(false);
  });
});

describe("stripDictionaryBoundaryEcho", () => {
  it("strips a leading run of 2+ dictionary words", () => {
    expect(stripDictionaryBoundaryEcho("Kubernetes Terraform hello there", DICTIONARY)).toBe(
      "hello there"
    );
  });

  it("strips a trailing run of 2+ dictionary words", () => {
    expect(stripDictionaryBoundaryEcho("hello there Prometheus Grafana", DICTIONARY)).toBe(
      "hello there"
    );
  });

  it("strips runs at both ends", () => {
    expect(
      stripDictionaryBoundaryEcho("Kubernetes Terraform hello there Prometheus Grafana", DICTIONARY)
    ).toBe("hello there");
  });

  it("leaves a single boundary word alone (could be genuine speech)", () => {
    expect(stripDictionaryBoundaryEcho("Kubernetes is great", DICTIONARY)).toBe("Kubernetes is great");
  });

  it("leaves text with no dictionary bleed unchanged", () => {
    expect(stripDictionaryBoundaryEcho("hello there", DICTIONARY)).toBe("hello there");
  });

  it("returns text unchanged when there is no dictionary prompt", () => {
    expect(stripDictionaryBoundaryEcho("hello there", "")).toBe("hello there");
  });
});
