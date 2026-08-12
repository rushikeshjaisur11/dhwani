const test = require("node:test");
const assert = require("node:assert/strict");
const { aggregateInsightsActivity, TYPING_WPM } = require("../../src/helpers/database.js");

test("aggregateInsightsActivity buckets words/count/duration per day", () => {
  const result = aggregateInsightsActivity([
    { text: "hello world", timestamp: "2026-08-10 09:00:00", audio_duration_ms: 30000 },
    { text: "one two three four", timestamp: "2026-08-10 12:00:00", audio_duration_ms: 60000 },
    { text: "just one day later", timestamp: "2026-08-11 09:00:00", audio_duration_ms: 30000 },
  ]);

  assert.equal(result.totalWords, 2 + 4 + 4);
  assert.equal(result.totalDictations, 3);
  assert.equal(result.dailyActivity.length, 2);

  const [day1, day2] = result.dailyActivity;
  assert.equal(day1.date, "2026-08-10");
  assert.equal(day1.words, 6);
  assert.equal(day1.count, 2);
  assert.equal(day1.avgWords, 3);
  assert.equal(day2.date, "2026-08-11");
  assert.equal(day2.words, 4);
  assert.equal(day2.count, 1);
});

test("aggregateInsightsActivity computes time saved vs typing at TYPING_WPM, clamped at 0", () => {
  // 400 words dictated in 2 minutes of audio -> 10 min to type at 40 WPM, minus 2 min spent = 8 min saved
  const words = Array.from({ length: 400 }, (_, i) => `w${i}`).join(" ");
  const result = aggregateInsightsActivity([
    { text: words, timestamp: "2026-08-10 09:00:00", audio_duration_ms: 2 * 60000 },
  ]);
  assert.equal(TYPING_WPM, 40);
  assert.equal(result.timeSavedMinutes, 8);
  assert.equal(result.dailyActivity[0].timeSavedMinutes, 8);
});

test("aggregateInsightsActivity clamps negative time-saved (long recording, few words) to 0", () => {
  const result = aggregateInsightsActivity([
    { text: "one word", timestamp: "2026-08-10 09:00:00", audio_duration_ms: 60 * 60000 },
  ]);
  assert.equal(result.timeSavedMinutes, 0);
});

test("aggregateInsightsActivity handles empty input", () => {
  const result = aggregateInsightsActivity([]);
  assert.equal(result.totalWords, 0);
  assert.equal(result.totalDictations, 0);
  assert.equal(result.averageWPM, 0);
  assert.equal(result.timeSavedMinutes, 0);
  assert.deepEqual(result.dailyActivity, []);
});
