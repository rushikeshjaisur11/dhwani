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

// ponytail: whisper/Parakeet stays resident on-device the whole time the
// reasoning model would also be loaded, so its footprint has to come off the
// budget before picking a reasoning tier. Reserve sizes are rough (weights +
// runtime buffers, ~1.5-2x the on-disk model size documented in CLAUDE.md) —
// tune here if recommendations turn out wrong in practice, same knob as
// recommendWhisperModel's threshold table.
const STT_RAM_RESERVE_GB = { tiny: 0.3, base: 0.4, small: 1.0, medium: 2.5, large: 4.5, turbo: 2.5 };
const STT_VRAM_RESERVE_MB = { turbo: 2500 };

// ponytail: sizeGb from modelRegistryData.json's sizeBytes for each quant
// variant; +0.5GB flat runtime/KV-cache overhead buffer, rough like
// STT_RAM_RESERVE_GB above — tune here if recommendations turn out wrong.
const RUNTIME_OVERHEAD_GB = 0.5;
const QUANT_VARIANTS = {
  "qwen3-8b": [
    { modelId: "qwen3-8b-q5_k_m", sizeGb: 6281625600 / 1e9 },
    { modelId: "qwen3-8b-q4_k_m", sizeGb: 5402263552 / 1e9 },
  ],
};

// Picks the best-quality quant variant of familyKey that fits budgetGb
// (variants are listed best-quality-first). Falls back to fallbackModelId
// if the family is unknown or nothing fits.
function pickBestQuant(familyKey, budgetGb, fallbackModelId) {
  const variants = QUANT_VARIANTS[familyKey];
  if (!variants) return fallbackModelId;
  const fits = variants.find((v) => budgetGb >= v.sizeGb + RUNTIME_OVERHEAD_GB);
  return fits ? fits.modelId : fallbackModelId;
}

// ponytail: threshold table is the calibration knob, same as recommendWhisperModel.
function recommendReasoningModel(profile) {
  const sttModelId = recommendWhisperModel(profile).modelId;
  const { hasNvidiaGpu, vramMb: rawVramMb, totalMemGb: rawTotalMemGb } = profile;
  const totalMemGb = Math.max(0, rawTotalMemGb - (STT_RAM_RESERVE_GB[sttModelId] ?? 0));
  const vramMb = Math.max(0, rawVramMb - (STT_VRAM_RESERVE_MB[sttModelId] ?? 0));

  if (hasNvidiaGpu && vramMb >= 20000) {
    return { modelId: "gpt-oss-20b-mxfp4", isCloud: false, reason: "modelRecommendation.reasons.nvidiaGpuLarge" };
  }
  if (hasNvidiaGpu && vramMb >= 12000) {
    return {
      modelId: "mistral-nemo-12b-instruct-q4_k_m",
      isCloud: false,
      reason: "modelRecommendation.reasons.nvidiaGpuLarge",
    };
  }
  if (hasNvidiaGpu && vramMb >= 8000) {
    return {
      modelId: pickBestQuant("qwen3-8b", vramMb / 1000, "qwen3-8b-q4_k_m"),
      isCloud: false,
      reason: "modelRecommendation.reasons.nvidiaGpu",
    };
  }
  if (hasNvidiaGpu && vramMb >= 6000) {
    return { modelId: "qwen3.5-4b-q4_k_m", isCloud: false, reason: "modelRecommendation.reasons.nvidiaGpu" };
  }
  if (totalMemGb >= 32) {
    return {
      modelId: pickBestQuant("qwen3-8b", totalMemGb, "qwen3-8b-q4_k_m"),
      isCloud: false,
      reason: "modelRecommendation.reasons.highRamManyCores",
    };
  }
  if (totalMemGb >= 16) {
    return {
      modelId: "llama-3.2-3b-instruct-q4_k_m",
      isCloud: false,
      reason: "modelRecommendation.reasons.highRamManyCores",
    };
  }
  if (totalMemGb >= 8) {
    return { modelId: "qwen3.5-2b-q4_k_m", isCloud: false, reason: "modelRecommendation.reasons.moderateRam" };
  }
  return { modelId: null, isCloud: true, reason: "modelRecommendation.reasons.weakHardwareCloud" };
}

module.exports = { recommendWhisperModel, recommendReasoningModel, pickBestQuant };
