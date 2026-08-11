import { describe, it, expect } from "vitest";
import { formatSpeakerTimeline, prependSpeakerTimeline } from "./speakerTimeline";

describe("speakerTimeline", () => {
  it("formats an empty segment list as an empty string", () => {
    expect(formatSpeakerTimeline([])).toBe("");
  });

  it("formats a single segment with mm:ss timestamps", () => {
    const out = formatSpeakerTimeline([{ start: 0, end: 45, speaker: "speaker_0" }]);
    expect(out).toBe("Speaker 1: 0:00–0:45");
  });

  it("renumbers speakers in order of first appearance, not cluster id order", () => {
    const out = formatSpeakerTimeline([
      { start: 0, end: 10, speaker: "speaker_3" },
      { start: 10, end: 20, speaker: "speaker_1" },
      { start: 20, end: 30, speaker: "speaker_3" },
    ]);
    expect(out).toBe(
      "Speaker 1: 0:00–0:10\nSpeaker 2: 0:10–0:20\nSpeaker 1: 0:20–0:30"
    );
  });

  it("formats timestamps past a minute correctly", () => {
    const out = formatSpeakerTimeline([{ start: 65, end: 130, speaker: "speaker_0" }]);
    expect(out).toBe("Speaker 1: 1:05–2:10");
  });

  it("prependSpeakerTimeline returns the transcript unchanged when there are no segments", () => {
    expect(prependSpeakerTimeline("hello world", [])).toBe("hello world");
  });

  it("prependSpeakerTimeline prefixes the timeline before the transcript", () => {
    const out = prependSpeakerTimeline("hello world", [
      { start: 0, end: 5, speaker: "speaker_0" },
    ]);
    expect(out).toBe("Speakers\nSpeaker 1: 0:00–0:05\n\nhello world");
  });
});
