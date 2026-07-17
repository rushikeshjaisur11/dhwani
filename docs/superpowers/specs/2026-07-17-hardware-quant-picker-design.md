# Hardware-Aware Quantization Picker

## Context

`recommendReasoningModel()` in `src/utils/modelRecommender.js` picks a local
reasoning model by hardware tier (VRAM / total RAM / core count), but each
tier hardcodes exactly one specific quantization of one model family — e.g.
the top local tier always returns `qwen3.5-9b-q4_k_m`, even when the
registry already has a higher-quality quant sibling for a comparable family
with real headroom to spare on the user's hardware.

Today the only family in `src/models/modelRegistryData.json` with genuine
quant siblings is `qwen3-8b` (`qwen3-8b-q4_k_m`, 5.0GB, and
`qwen3-8b-q5_k_m`, 5.9GB — same `hfRepo`, both already downloadable). No
other recommended family (`qwen3.5-9b/4b/2b`, `mistral-nemo-12b`,
`llama-3.2-3b`, `gpt-oss-20b`) has more than one quant in the registry today;
adding those is separate future data work (real HuggingFace repo + filename
research per quant), out of scope here.

The manual-override half of this feature already exists: `ReasoningModelSelector.tsx`
(lines 669-676, 689) already shows a "Recommended: X" badge and highlights
the recommended card whenever `get-recommended-model`'s result differs from
the user's current selection, and the user can already pick any registry
entry — including any quant sibling — directly. No UI changes are needed;
fixing the recommender's logic makes that existing UI reflect quant-aware
recommendations automatically.

## Goal

Make `recommendReasoningModel()` quant-aware: for a hardware tier whose
model family has multiple quant siblings in the registry, pick the
best-quality quant that fits the user's actual remaining VRAM/RAM headroom,
instead of always returning one hardcoded quant. Swap the top local tier's
family from `qwen3.5-9b` to `qwen3-8b` so this has a real, user-visible
effect from day one (rather than being a mechanism with nothing to act on).

## Scope

- Only `src/utils/modelRecommender.js` (+ its test file) changes.
- Only the two branches currently reaching the top local reasoning tier
  change family: `hasNvidiaGpu && vramMb >= 8000` and `totalMemGb >= 32`.
  Every other branch (12b/9b-VRAM tier, 4b tier, 2b tier, 16GB/8GB RAM
  tiers, cloud fallback) is untouched.
- Whisper/Parakeet transcription models are explicitly out of scope — they
  are size tiers (whisper) or a fixed single build (Parakeet), not
  quantization variants, and have no sibling entries to pick between.
- No new settings, no new i18n strings, no new IPC channel, no UI changes.
  `get-recommended-model`'s return shape (`{modelId, isCloud, reason, profile}`)
  is unchanged.

## Design

### Quant lookup + picker

```js
// ponytail: sizeGb from registry sizeBytes; +0.5GB flat runtime/KV-cache
// overhead buffer, rough like STT_RAM_RESERVE_GB above — tune here.
const RUNTIME_OVERHEAD_GB = 0.5;
const QUANT_VARIANTS = {
  "qwen3-8b": [
    { modelId: "qwen3-8b-q5_k_m", sizeGb: 6281625600 / 1e9 },
    { modelId: "qwen3-8b-q4_k_m", sizeGb: 5402263552 / 1e9 },
  ],
};

function pickBestQuant(familyKey, budgetGb, fallbackModelId) {
  const variants = QUANT_VARIANTS[familyKey];
  if (!variants) return fallbackModelId;
  const fits = variants.find((v) => budgetGb >= v.sizeGb + RUNTIME_OVERHEAD_GB);
  return fits ? fits.modelId : fallbackModelId;
}
```

`QUANT_VARIANTS` entries are listed best-quality-first; `pickBestQuant`
returns the first (highest-quality) variant whose size plus the flat
overhead buffer fits the given budget, else falls back to the caller's
`fallbackModelId` (the current lowest/safe quant for that tier).

### Changed branches in `recommendReasoningModel`

- `hasNvidiaGpu && vramMb >= 8000` branch: was
  `{ modelId: "qwen3.5-9b-q4_k_m", ... }` → now
  `{ modelId: pickBestQuant("qwen3-8b", vramMb / 1000, "qwen3-8b-q4_k_m"), isCloud: false, reason: "modelRecommendation.reasons.nvidiaGpu" }`.
- `totalMemGb >= 32` branch: was
  `{ modelId: "qwen3.5-9b-q4_k_m", ... }` → now
  `{ modelId: pickBestQuant("qwen3-8b", totalMemGb, "qwen3-8b-q4_k_m"), isCloud: false, reason: "modelRecommendation.reasons.highRamManyCores" }`.

`reason` keys are unchanged from today for both branches.

## Error handling

`pickBestQuant` never throws. An unknown `familyKey` or a budget below every
variant's threshold both resolve to the caller-supplied `fallbackModelId` —
worst case, behavior is identical to today (always the lower quant for that
tier). No new error states, no new user-facing messages.

## Testing

Extends `test/utils/modelRecommender.test.js` in its existing style:

- `pickBestQuant`: budget comfortably above the q5 threshold → returns
  `qwen3-8b-q5_k_m`; budget between the q4 and q5 thresholds → returns the
  fallback (`qwen3-8b-q4_k_m`); unknown family key → returns the fallback
  untouched.
- `recommendReasoningModel`: update the existing "NVIDIA GPU with 8GB VRAM"
  case to assert the new qwen3-8b-family result at that exact boundary; add
  a new case for a GPU with materially more VRAM (10GB+) asserting an
  upgrade to `qwen3-8b-q5_k_m`; mirror both cases for the `totalMemGb >= 32`
  CPU-only branch.
- No manual verification needed beyond `npm test` — pure logic change, no
  UI/IPC surface touched.
