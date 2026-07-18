# Hardware-Aware Quantization Picker Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `recommendReasoningModel()` pick the best-quality quant of a model family (not just the family's single hardcoded quant) when the registry has multiple quant siblings and the user's hardware headroom supports it.

**Architecture:** A small `QUANT_VARIANTS` lookup table + `pickBestQuant(familyKey, budgetGb, fallbackModelId)` pure helper in `src/utils/modelRecommender.js`. The two branches of `recommendReasoningModel` that currently hardcode `qwen3.5-9b-q4_k_m` switch to the `qwen3-8b` family (which has real `q4_k_m`/`q5_k_m` siblings already in the registry) and call `pickBestQuant` instead of returning a fixed string.

**Tech Stack:** Plain JS, `node:test` + `node:assert/strict` (matches this file's existing test conventions). No new dependencies.

## Global Constraints

- Only `src/utils/modelRecommender.js` and `test/utils/modelRecommender.test.js` change. No UI, no IPC, no settings, no i18n changes — `ReasoningModelSelector.tsx`'s existing recommended-badge logic (lines 669-676, 689) and `get-recommended-model`'s return shape are both untouched and automatically pick up the new behavior.
- Every other branch in `recommendReasoningModel` (12b/9b-VRAM tier, 4b tier, 2b tier, 16GB RAM tier, cloud fallback) stays exactly as it is today.
- `npm test` and `npm run typecheck` must stay green.

## Important note surfaced while writing this plan (read before implementing)

The design spec assumed the existing `hasNvidiaGpu && vramMb >= 8000` and `totalMemGb >= 32` branch thresholds would sometimes leave only enough headroom for `q4_k_m` and sometimes enough for `q5_k_m`. Checking the actual numbers: `qwen3-8b-q5_k_m` needs `6281625600 / 1e9 + 0.5 ≈ 6.78 GB` after the 0.5GB overhead buffer, but the branch entry thresholds (8GB post-STT-reserve VRAM, 32GB post-STT-reserve RAM) already comfortably exceed 6.78GB. **In practice, every input that reaches either of these two branches today will resolve to `q5_k_m`, never the `q4_k_m` fallback** — the fallback is real, correct, defensive code (same class as other "just in case" fallbacks already in this file), just not reachable through these two branches at their current thresholds. This isn't a bug in the design; it just means:
- `recommendReasoningModel`-level tests for these two branches only exercise the "picks q5" outcome (that's the true, observable behavior).
- The q4-vs-q5 boundary logic itself is fully tested at the `pickBestQuant` unit level directly (Step 3 below), where a budget can be constructed anywhere in that boundary window.
- The existing test "NVIDIA GPU with 8GB VRAM recommends qwen3.5-2b" (`test/utils/modelRecommender.test.js:67-71`, raw `vramMb: 8000`) does **not** reach the changed GPU branch at all (after turbo's 2500MB STT reserve, adjusted VRAM is 5500MB, below every GPU threshold — it falls through to the RAM-tier branches, landing on `qwen3.5-2b-q4_k_m` exactly as before). **Do not modify that existing test** — it's unaffected by this change and still correct. New tests (Step 5) use larger raw VRAM/RAM values that actually clear the changed branches' thresholds.

## File Structure

- **Modify:** `src/utils/modelRecommender.js` — add `RUNTIME_OVERHEAD_GB`, `QUANT_VARIANTS`, `pickBestQuant`; change the two branches described above.
- **Modify:** `test/utils/modelRecommender.test.js` — add new test cases (existing cases untouched, see note above).

---

### Task 1: Quant-aware reasoning model recommendation

**Files:**
- Modify: `src/utils/modelRecommender.js:19-69`
- Test: `test/utils/modelRecommender.test.js`

**Interfaces:**
- Produces: `pickBestQuant(familyKey, budgetGb, fallbackModelId) => string` — exported alongside `recommendWhisperModel`/`recommendReasoningModel` so it has its own direct unit tests.
- Consumes: nothing new — `recommendReasoningModel`'s existing `profile` shape (`{hasNvidiaGpu, vramMb, totalMemGb, cpuCores}`) and return shape (`{modelId, isCloud, reason}`) are unchanged.

- [ ] **Step 1: Write the failing tests for `pickBestQuant`**

Add to `test/utils/modelRecommender.test.js` (after the existing `recommendWhisperModel` tests, before the `recommendReasoningModel` tests):

```js
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `node --test test/utils/modelRecommender.test.js`
Expected: FAIL — `pickBestQuant` is not exported / not a function.

- [ ] **Step 3: Implement `pickBestQuant` and `QUANT_VARIANTS`**

In `src/utils/modelRecommender.js`, insert right after the `STT_VRAM_RESERVE_MB` line (after line 26, before the `recommendReasoningModel` function on line 29):

```js
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
```

- [ ] **Step 4: Run tests to verify the `pickBestQuant` tests pass**

Run: `node --test test/utils/modelRecommender.test.js`
Expected: the 4 new `pickBestQuant` tests PASS. The `recommendReasoningModel` tests still pass unchanged (nothing wired up yet).

- [ ] **Step 5: Write the failing tests for the two changed `recommendReasoningModel` branches**

Add to `test/utils/modelRecommender.test.js`, after the existing `recommendReasoningModel` tests:

```js
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
```

- [ ] **Step 6: Run tests to verify they fail**

Run: `node --test test/utils/modelRecommender.test.js`
Expected: FAIL — both new assertions get `qwen3.5-9b-q4_k_m` instead of `qwen3-8b-q5_k_m` (the two branches haven't been switched over yet).

- [ ] **Step 7: Switch the two branches to the qwen3-8b family via `pickBestQuant`**

In `src/utils/modelRecommender.js`, replace this block (original lines 45-56):

```js
  if (hasNvidiaGpu && vramMb >= 8000) {
    return { modelId: "qwen3.5-9b-q4_k_m", isCloud: false, reason: "modelRecommendation.reasons.nvidiaGpu" };
  }
  if (hasNvidiaGpu && vramMb >= 6000) {
    return { modelId: "qwen3.5-4b-q4_k_m", isCloud: false, reason: "modelRecommendation.reasons.nvidiaGpu" };
  }
  if (totalMemGb >= 32) {
    return {
      modelId: "qwen3.5-9b-q4_k_m",
      isCloud: false,
      reason: "modelRecommendation.reasons.highRamManyCores",
    };
  }
```

with:

```js
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
```

(The `qwen3.5-4b-q4_k_m` branch in between is untouched — shown only for context so the replacement anchors correctly.)

- [ ] **Step 8: Run tests to verify they pass**

Run: `node --test test/utils/modelRecommender.test.js`
Expected: all tests PASS, including the 2 new branch tests and the original 8 pre-existing tests (unmodified, still correct per the note above).

- [ ] **Step 9: Export `pickBestQuant`**

In `src/utils/modelRecommender.js`, update the final export line:

```js
module.exports = { recommendWhisperModel, recommendReasoningModel, pickBestQuant };
```

- [ ] **Step 10: Run the full suite and typecheck**

Run: `npm test && npm run typecheck`
Expected: PASS — full `node --test` suite (154 tests: 150 existing + 4 new `pickBestQuant` cases... actually 150 + 4 + 2 = 156) and vitest suite green, typecheck clean (this file isn't imported by any `.ts`/`.tsx` file directly under type checking beyond its existing usage in `ipcHandlers.js`, which is untouched).

- [ ] **Step 11: Commit**

```bash
git add src/utils/modelRecommender.js test/utils/modelRecommender.test.js
git commit -m "feat: pick best-quality quant variant for hardware-eligible reasoning tiers"
```

---

## Self-Review Notes

- **Spec coverage:** Goal (quant-aware recommendation for tiers with real siblings) → Step 7. Scope (only qwen3-8b family, only the two named branches, no UI/IPC/settings changes) → Step 7's diff touches exactly those two branches; everything else in the file is untouched. Error handling (never throws, falls back cleanly) → `pickBestQuant`'s `if (!variants) return fallbackModelId` and the `.find(...) ? ... : fallbackModelId` ternary, both covered by Step 1's tests. Testing → Steps 1 and 5.
- **Placeholder scan:** none — every step has complete, exact code.
- **Type/name consistency:** `pickBestQuant(familyKey, budgetGb, fallbackModelId)` signature is identical everywhere it's called (Step 7) and tested (Steps 1, 5). `QUANT_VARIANTS` keyed by `"qwen3-8b"` matches the `familyKey` string passed at both call sites.
- **Deviation from the original design spec, caught while writing this plan:** the spec's Testing section assumed the existing "NVIDIA GPU with 8GB VRAM" test would need updating to assert the new q5 result — verified against the actual test file and actual STT-reserve arithmetic, that test's raw `vramMb: 8000` never reaches the changed branch (turbo's reserve drops it below every GPU threshold), so it's unaffected and left alone. New tests use larger raw values that do reach the changed branches. This is a plan-level correction of the spec's testing assumption, not a scope change — the code change itself matches the approved spec exactly.
