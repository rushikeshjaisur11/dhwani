const test = require("node:test");
const assert = require("node:assert/strict");

const { parseFreeVramMb } = require("../../src/utils/gpuDetection");

test("parseFreeVramMb parses a single numeric CSV value", () => {
  assert.equal(parseFreeVramMb("8192\n"), 8192);
});

test("parseFreeVramMb trims whitespace around the value", () => {
  assert.equal(parseFreeVramMb("  4096  \n"), 4096);
});

test("parseFreeVramMb returns null for empty output", () => {
  assert.equal(parseFreeVramMb(""), null);
});

test("parseFreeVramMb returns null for non-numeric output", () => {
  assert.equal(parseFreeVramMb("not-a-number\n"), null);
});
