const os = require("os");
const { detectNvidiaGpu } = require("./gpuDetection");

// ponytail: RAM was the missing probe — CPU cores and NVIDIA VRAM were already
// read elsewhere (InferenceConfig.ts, whisperCudaManager.js) for thread tuning
// and CUDA gating, just never combined into one profile for model recommendation.
async function getSystemProfile() {
  const gpu = await detectNvidiaGpu();
  return {
    totalMemGb: os.totalmem() / 1024 ** 3,
    cpuCores: os.cpus().length,
    platform: process.platform,
    hasNvidiaGpu: !!gpu.hasNvidiaGpu,
    vramMb: gpu.vramMb ?? 0,
  };
}

module.exports = { getSystemProfile };
