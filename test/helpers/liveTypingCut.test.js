const { test } = require("node:test");
const assert = require("node:assert");
const { findSilenceCut } = require("../../src/helpers/liveTypingCut");

const SR = 16000;

function pcm(ms, amplitude) {
  const out = new Int16Array(Math.floor((SR * ms) / 1000));
  for (let i = 0; i < out.length; i++) {
    // deterministic pseudo-noise at the requested amplitude
    out[i] = Math.floor(Math.sin(i * 0.31) * amplitude);
  }
  return out;
}

function concat(...parts) {
  const total = parts.reduce((n, p) => n + p.length, 0);
  const out = new Int16Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
}

const LOUD = 8000; // clearly speech
const QUIET = 50; // clearly silence

test("no cut in continuous speech", () => {
  assert.strictEqual(findSilenceCut(pcm(5000, LOUD)), null);
});

test("no cut when buffer is too short", () => {
  assert.strictEqual(findSilenceCut(pcm(200, QUIET)), null);
});

test("cuts inside the pause between two phrases", () => {
  const speech1 = pcm(2000, LOUD);
  const pause = pcm(500, QUIET);
  const speech2 = pcm(1000, LOUD);
  const cut = findSilenceCut(concat(speech1, pause, speech2));
  assert.ok(cut !== null);
  assert.ok(cut > speech1.length, "cut must be after the first phrase");
  assert.ok(cut < speech1.length + pause.length, "cut must be inside the pause");
});

test("uses the LAST pause when there are several", () => {
  const s = concat(pcm(1000, LOUD), pcm(400, QUIET), pcm(1000, LOUD), pcm(400, QUIET), pcm(500, LOUD));
  const cut = findSilenceCut(s);
  assert.ok(cut > 2400 * (SR / 1000), "cut should be inside the second pause");
});

test("no cut when the only pause would produce a too-short chunk", () => {
  // 200 ms of speech then a pause: below minChunkMs (500), nothing useful to emit
  const s = concat(pcm(200, LOUD), pcm(400, QUIET), pcm(2000, LOUD));
  assert.strictEqual(findSilenceCut(s), null);
});

test("trailing pause cuts near the end", () => {
  const speech = pcm(2000, LOUD);
  const s = concat(speech, pcm(600, QUIET));
  const cut = findSilenceCut(s);
  assert.ok(cut !== null && cut > speech.length && cut < s.length);
});
