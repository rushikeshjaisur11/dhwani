const test = require("node:test");
const assert = require("node:assert/strict");
const Module = require("node:module");

const originalLoad = Module._load;
Module._load = function loadWithElectronMock(request, parent, isMain) {
  if (request === "electron") {
    return { net: { request: () => ({ setHeader() {}, on() {}, end() {}, abort() {} }) } };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { isHttpUrl, inferExtension } = require("../../src/helpers/audioUrlImport");
Module._load = originalLoad;

test("isHttpUrl accepts http and https", () => {
  assert.equal(isHttpUrl("https://example.com/audio.mp3"), true);
  assert.equal(isHttpUrl("http://example.com/audio.wav"), true);
});

test("isHttpUrl rejects non-http(s) schemes", () => {
  assert.equal(isHttpUrl("ftp://example.com/audio.mp3"), false);
  assert.equal(isHttpUrl("file:///C:/audio.mp3"), false);
  assert.equal(isHttpUrl("javascript:alert(1)"), false);
});

test("isHttpUrl rejects malformed URLs", () => {
  assert.equal(isHttpUrl("not a url"), false);
  assert.equal(isHttpUrl(""), false);
});

test("inferExtension maps known audio content-types", () => {
  assert.equal(inferExtension("audio/mpeg", "https://example.com/x"), "mp3");
  assert.equal(inferExtension("audio/wav", "https://example.com/x"), "wav");
  assert.equal(inferExtension("audio/mp4", "https://example.com/x"), "m4a");
  assert.equal(inferExtension("audio/mpeg; charset=binary", "https://example.com/x"), "mp3");
});

test("inferExtension falls back to the URL's own extension when content-type is unknown", () => {
  assert.equal(inferExtension("application/octet-stream", "https://example.com/track.flac"), "flac");
});

test("inferExtension returns null when nothing matches", () => {
  assert.equal(inferExtension("application/octet-stream", "https://example.com/track"), null);
  assert.equal(inferExtension(null, "https://example.com/track.xyz"), null);
});
