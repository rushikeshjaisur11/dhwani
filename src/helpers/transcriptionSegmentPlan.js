const LOCAL_CHUNK_SEGMENT_SECONDS = 60;

function shouldSegmentAudio(durationSeconds, segmentDurationSeconds = LOCAL_CHUNK_SEGMENT_SECONDS) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) return false;
  return durationSeconds > segmentDurationSeconds * 2;
}

module.exports = {
  LOCAL_CHUNK_SEGMENT_SECONDS,
  shouldSegmentAudio,
};
