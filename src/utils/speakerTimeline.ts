export interface DiarizationSegment {
  start: number;
  end: number;
  speaker: string;
}

function formatTimestamp(seconds: number): string {
  const total = Math.max(0, Math.round(seconds));
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${String(secs).padStart(2, "0")}`;
}

// Renumbers raw "speaker_N" cluster IDs to a stable, human-friendly "Speaker
// 1", "Speaker 2"... in order of first appearance (cluster IDs from the
// diarization model aren't meaningful on their own and aren't guaranteed to
// start at 0 or be contiguous).
export function formatSpeakerTimeline(segments: DiarizationSegment[]): string {
  if (!segments || segments.length === 0) return "";

  const order = new Map<string, number>();
  for (const seg of segments) {
    if (!order.has(seg.speaker)) order.set(seg.speaker, order.size + 1);
  }

  return segments
    .map((seg) => `Speaker ${order.get(seg.speaker)}: ${formatTimestamp(seg.start)}–${formatTimestamp(seg.end)}`)
    .join("\n");
}

// Prepends a speaker timeline block to a transcript. Returns the transcript
// unchanged when there are no segments (diarization unavailable, or a
// single-speaker/silent file the model found nothing to cluster).
export function prependSpeakerTimeline(transcript: string, segments: DiarizationSegment[]): string {
  const timeline = formatSpeakerTimeline(segments);
  if (!timeline) return transcript;
  return `Speakers\n${timeline}\n\n${transcript}`;
}
