const { test } = require("node:test");
const assert = require("node:assert");
const { findAudioFile, buildManifestRow } = require("../../scripts/export-dataset");

test("findAudioFile matches by -<id>.webm suffix", () => {
  const files = ["Dhwani-2026-07-03-10-15-22-41.webm", "Dhwani-2026-07-02-09-01-11-7.webm"];
  assert.strictEqual(findAudioFile(files, 41), "Dhwani-2026-07-03-10-15-22-41.webm");
  assert.strictEqual(findAudioFile(files, 7), "Dhwani-2026-07-02-09-01-11-7.webm");
});

test("findAudioFile does not match partial ids", () => {
  const files = ["Dhwani-2026-07-03-10-15-22-41.webm"];
  assert.strictEqual(findAudioFile(files, 1), null);
  assert.strictEqual(findAudioFile(files, 4), null);
});

test("findAudioFile matches legacy prefix and bare id files", () => {
  assert.strictEqual(findAudioFile(["OpenWhispr-2026-01-01-00-00-00-9.webm"], 9), "OpenWhispr-2026-01-01-00-00-00-9.webm");
  assert.strictEqual(findAudioFile(["9.webm"], 9), "9.webm");
});

test("buildManifestRow maps DB row to manifest fields", () => {
  const row = {
    id: 41,
    text: "So the deployment is done.",
    raw_text: "um so the deployment is like done",
    timestamp: "2026-07-03 10:15:22",
    audio_duration_ms: 3200,
    model: "turbo",
    provider: "local",
  };
  assert.deepStrictEqual(buildManifestRow(row, "audio/41.webm"), {
    audio_filepath: "audio/41.webm",
    text: "So the deployment is done.",
    raw_text: "um so the deployment is like done",
    duration_ms: 3200,
    model: "turbo",
    provider: "local",
    timestamp: "2026-07-03 10:15:22",
    id: 41,
  });
});

test("buildManifestRow falls back text to raw_text when cleanup was skipped", () => {
  const row = { id: 5, text: "raw words", raw_text: null, timestamp: "t", audio_duration_ms: null };
  const result = buildManifestRow(row, "audio/5.webm");
  assert.strictEqual(result.text, "raw words");
  assert.strictEqual(result.raw_text, "raw words");
});
