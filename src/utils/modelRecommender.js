// ponytail: threshold table is the calibration knob — real machines vary,
// tune the numbers here, not the shape of this function, if recommendations
// turn out wrong in practice.
function recommendWhisperModel(profile) {
  const { hasNvidiaGpu, vramMb, totalMemGb, cpuCores } = profile;

  if (hasNvidiaGpu && vramMb >= 6000) {
    return { modelId: "turbo", reason: "modelRecommendation.reasons.nvidiaGpu" };
  }
  if (totalMemGb >= 16 && cpuCores >= 8) {
    return { modelId: "small", reason: "modelRecommendation.reasons.highRamManyCores" };
  }
  if (totalMemGb >= 8) {
    return { modelId: "base", reason: "modelRecommendation.reasons.moderateRam" };
  }
  return { modelId: "tiny", reason: "modelRecommendation.reasons.lowRam" };
}

module.exports = { recommendWhisperModel };
