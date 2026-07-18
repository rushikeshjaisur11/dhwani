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

test("pickBestQuant: budget comfortably above q5 threshold picks q5_k_m", async () => {
  const { pickBestQuant } = await load();
  assert.equal(pickBestQuant("qwen3-8b", 7.0, "qwen3-8b-q4_k_m"), "qwen3-8b-q5_k_m");
});

test("pickBestQuant: budget between q4 and q5 thresholds falls back to q4_k_m", async () => {
  const { pickBestQuant } = await load();
  assert.equal(pickBestQuant("qwen3-8b", 6.0, "qwen3-8b-q4_k_m"), "qwen3-8b-q4_k_m");
});

test("pickBestQuant: budget below every variant returns the fallback", async () => {
  const { pickBestQuant } = await load();
  assert.equal(pickBestQuant("qwen3-8b", 3.0, "qwen3-8b-q4_k_m"), "qwen3-8b-q4_k_m");
});

test("pickBestQuant: unknown family key returns the fallback untouched", async () => {
  const { pickBestQuant } = await load();
  assert.equal(pickBestQuant("not-a-real-family", 100, "some-fallback-id"), "some-fallback-id");
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

test("reasoning: NVIDIA GPU with ample VRAM upgrades to qwen3-8b q5_k_m", async () => {
  const { recommendReasoningModel } = await load();
  // raw vramMb 11000 - turbo's 2500MB STT reserve = 8500MB adjusted,
  // clears the >=8000 GPU branch and comfortably clears q5_k_m's ~6.78GB threshold.
  const rec = recommendReasoningModel({ hasNvidiaGpu: true, vramMb: 11000, totalMemGb: 16, cpuCores: 8 });
  assert.equal(rec.modelId, "qwen3-8b-q5_k_m");
  assert.equal(rec.isCloud, false);
});

test("reasoning: 40GB RAM CPU-only upgrades to qwen3-8b q5_k_m", async () => {
  const { recommendReasoningModel } = await load();
  // raw totalMemGb 40 - "small" whisper tier's 1.0GB STT reserve = 39GB adjusted,
  // clears the >=32 CPU branch and comfortably clears q5_k_m's ~6.78GB threshold.
  const rec = recommendReasoningModel({ hasNvidiaGpu: false, vramMb: 0, totalMemGb: 40, cpuCores: 16 });
  assert.equal(rec.modelId, "qwen3-8b-q5_k_m");
  assert.equal(rec.isCloud, false);
});
