const LOCAL_CHUNK_SEGMENT_SECONDS = 60;

// ponytail: flat runtime/KV-cache overhead buffer, same rough-estimate
// pattern as modelRecommender.js's RUNTIME_OVERHEAD_GB — tune here if
// real-world headroom checks prove too tight or too loose.
const RUNTIME_OVERHEAD_GB = 0.5;

function shouldSegmentAudio(durationSeconds, segmentDurationSeconds = LOCAL_CHUNK_SEGMENT_SECONDS) {
  if (typeof durationSeconds !== "number" || !Number.isFinite(durationSeconds)) return false;
  return durationSeconds > segmentDurationSeconds * 2;
}

function assignSegmentWorker(index) {
  return index % 2;
}

function hasVramHeadroom(freeVramMb, modelFileSizeBytes) {
  if (typeof freeVramMb !== "number" || !Number.isFinite(freeVramMb)) return false;
  const modelGb = modelFileSizeBytes / 1e9;
  const neededMb = (modelGb + RUNTIME_OVERHEAD_GB) * 1000;
  return freeVramMb >= neededMb;
}

module.exports = {
  LOCAL_CHUNK_SEGMENT_SECONDS,
  RUNTIME_OVERHEAD_GB,
  shouldSegmentAudio,
  assignSegmentWorker,
  hasVramHeadroom,
};
