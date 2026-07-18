const test = require("node:test");
const assert = require("node:assert/strict");

const { parseDurationSeconds } = require("../../src/helpers/ffmpegUtils");

test("parseDurationSeconds extracts HH:MM:SS.ms from ffmpeg stderr", () => {
  const stderr =
    "Input #0, wav, from 'file.wav':\n" +
    "  Duration: 00:02:05.43, start: 0.000000, bitrate: 256 kb/s\n";
  assert.equal(parseDurationSeconds(stderr), 125.43);
});

test("parseDurationSeconds handles hour-long durations", () => {
  const stderr = "  Duration: 01:00:00.00, start: 0.000000, bitrate: 128 kb/s\n";
  assert.equal(parseDurationSeconds(stderr), 3600);
});

test("parseDurationSeconds returns null when no Duration line is present", () => {
  assert.equal(parseDurationSeconds("no duration info here"), null);
});
