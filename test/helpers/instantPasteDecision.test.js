const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/helpers/instantPasteDecision.js");

test("replaces when every guardrail passes", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    true
  );
});

test("skips replace when auto-paste is off", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: false,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when cleanup made no change", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: false,
      dictationIdMatches: true,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when a newer dictation has started (stale result)", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: false,
      foregroundAppMatches: true,
    }),
    false
  );
});

test("skips replace when the foreground app changed since the raw paste", async () => {
  const { shouldAttemptReplace } = await load();
  assert.equal(
    shouldAttemptReplace({
      autoPasteEnabled: true,
      textChanged: true,
      dictationIdMatches: true,
      foregroundAppMatches: false,
    }),
    false
  );
});
