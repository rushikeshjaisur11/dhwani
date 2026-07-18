const test = require("node:test");
const assert = require("node:assert/strict");

const { LOCAL_CHUNK_SEGMENT_SECONDS, shouldSegmentAudio } = require("../../src/helpers/transcriptionSegmentPlan");

test("constants are sane", () => {
  assert.equal(LOCAL_CHUNK_SEGMENT_SECONDS, 60);
});

test("shouldSegmentAudio is false for a short file", () => {
  assert.equal(shouldSegmentAudio(90), false); // 90s <= 2 * 60s
});

test("shouldSegmentAudio is true for a long file", () => {
  assert.equal(shouldSegmentAudio(600), true); // 600s > 2 * 60s
});

test("shouldSegmentAudio is false right at the 2x threshold", () => {
  assert.equal(shouldSegmentAudio(120), false); // exactly 2 * 60s, not >
});

test("shouldSegmentAudio is false when duration is unknown", () => {
  assert.equal(shouldSegmentAudio(null), false);
  assert.equal(shouldSegmentAudio(undefined), false);
  assert.equal(shouldSegmentAudio(NaN), false);
});
