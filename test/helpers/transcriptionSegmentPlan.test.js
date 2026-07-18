const test = require("node:test");
const assert = require("node:assert/strict");

const {
  LOCAL_CHUNK_SEGMENT_SECONDS,
  RUNTIME_OVERHEAD_GB,
  shouldSegmentAudio,
  assignSegmentWorker,
  hasVramHeadroom,
} = require("../../src/helpers/transcriptionSegmentPlan");

test("constants are sane", () => {
  assert.equal(LOCAL_CHUNK_SEGMENT_SECONDS, 60);
  assert.equal(RUNTIME_OVERHEAD_GB, 0.5);
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

test("assignSegmentWorker alternates 0/1 by index", () => {
  assert.equal(assignSegmentWorker(0), 0);
  assert.equal(assignSegmentWorker(1), 1);
  assert.equal(assignSegmentWorker(2), 0);
  assert.equal(assignSegmentWorker(3), 1);
});

test("hasVramHeadroom is true when free VRAM comfortably covers model + overhead", () => {
  // 3GB model -> needs (3 + 0.5) * 1000 = 3500MB
  assert.equal(hasVramHeadroom(4000, 3_000_000_000), true);
});

test("hasVramHeadroom is false when free VRAM is short", () => {
  assert.equal(hasVramHeadroom(3000, 3_000_000_000), false);
});

test("hasVramHeadroom is false when free VRAM is unknown", () => {
  assert.equal(hasVramHeadroom(null, 3_000_000_000), false);
  assert.equal(hasVramHeadroom(undefined, 3_000_000_000), false);
});
