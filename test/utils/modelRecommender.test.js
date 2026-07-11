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
