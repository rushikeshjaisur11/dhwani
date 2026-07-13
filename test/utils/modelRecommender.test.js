const test = require("node:test");
const assert = require("node:assert/strict");

const load = () => import("../../src/utils/modelRecommender.js");

test("NVIDIA GPU with >=6GB VRAM recommends turbo", async () => {
  const { recommendWhisperModel } = await load();
  assert.equal(
    recommendWhisperModel({ hasNvidiaGpu: true, vramMb: 8000, totalMemGb: 16, cpuCores: 8 })
      .modelId,
    "turbo"
  );
});

test("16GB RAM + 8 cores, no GPU recommends small", async () => {
  const { recommendWhisperModel } = await load();
  assert.equal(
    recommendWhisperModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 16, cpuCores: 8 })
      .modelId,
    "small"
  );
});

test("8GB RAM, low core count recommends base", async () => {
  const { recommendWhisperModel } = await load();
  assert.equal(
    recommendWhisperModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 8, cpuCores: 4 }).modelId,
    "base"
  );
});

test("low RAM recommends tiny", async () => {
  const { recommendWhisperModel } = await load();
  assert.equal(
    recommendWhisperModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 4, cpuCores: 2 }).modelId,
    "tiny"
  );
});

test("GPU present but low VRAM falls through to RAM tiers", async () => {
  const { recommendWhisperModel } = await load();
  assert.equal(
    recommendWhisperModel({ hasNvidiaGpu: true, vramMb: 2000, totalMemGb: 16, cpuCores: 8 })
      .modelId,
    "small"
  );
});

// recommendReasoningModel now reserves RAM/VRAM for the whisper/Parakeet STT
// model recommendWhisperModel would already pick for the same profile (it
// stays resident alongside the reasoning model on-device) — these three
// expectations shift down a tier versus the raw thresholds accordingly.

test("reasoning: 8GB RAM, no GPU falls back to cloud (STT reserve eats the RAM headroom)", async () => {
  const { recommendReasoningModel } = await load();
  const rec = recommendReasoningModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 8, cpuCores: 4 });
  assert.equal(rec.modelId, null);
  assert.equal(rec.isCloud, true);
});

test("reasoning: 16GB RAM, no GPU recommends qwen3.5-2b (STT reserve drops it out of the 16GB tier)", async () => {
  const { recommendReasoningModel } = await load();
  const rec = recommendReasoningModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 16, cpuCores: 8 });
  assert.equal(rec.modelId, "qwen3.5-2b-q4_k_m");
});

test("reasoning: NVIDIA GPU with 8GB VRAM recommends qwen3.5-2b (turbo's VRAM reserve drops it below every GPU tier)", async () => {
  const { recommendReasoningModel } = await load();
  const rec = recommendReasoningModel({ hasNvidiaGpu: true, vramMb: 8000, totalMemGb: 16, cpuCores: 8 });
  assert.equal(rec.modelId, "qwen3.5-2b-q4_k_m");
});

test("reasoning: weak hardware suggests cloud", async () => {
  const { recommendReasoningModel } = await load();
  const rec = recommendReasoningModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 4, cpuCores: 2 });
  assert.equal(rec.modelId, null);
  assert.equal(rec.isCloud, true);
});
