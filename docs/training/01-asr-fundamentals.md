# 01 — ASR Fundamentals: How Whisper-Class Models Actually Work

The Dhwani model family is built by fine-tuning Whisper-class models. This doc
explains the machine you're modifying — every stage from microphone samples to
text tokens — with real numbers, so the later training and evaluation docs read
as engineering, not incantation.

Verified against `openai/whisper-large-v3-turbo` `config.json` (HuggingFace,
2026-07): `num_mel_bins: 128`, `encoder_layers: 32`, `decoder_layers: 4`,
`d_model: 1280`, `vocab_size: 51866`.

---

## 1. The task shape: sequence-to-sequence

ASR maps a variable-length audio signal to a variable-length token sequence.
Whisper treats it exactly like machine translation: an **encoder** turns audio
into a sequence of vectors, a **decoder** autoregressively emits text tokens
while attending to those vectors. There is no phoneme dictionary, no forced
alignment, no separate language model — one transformer, trained end-to-end.

```
mic samples ──► log-mel spectrogram ──► encoder ──► audio embeddings
                                                        │ (cross-attention)
   "<|startoftranscript|><|en|><|transcribe|>..." ──► decoder ──► next token
```

## 2. Audio front end: from samples to spectrogram

Whisper's input contract is rigid — this is what our app's audio pipeline must
deliver (whisper.cpp does the conversion internally from the WAV/WebM we feed it):

| Property | Value |
|---|---|
| Sample rate | 16,000 Hz mono |
| Window | 25 ms (400 samples), Hann |
| Hop | 10 ms (160 samples) |
| Mel filterbank | **128 bins** (large-v3/turbo; 80 in v1/v2/medium/small) |
| Context | fixed 30 s chunks, zero-padded |

**Worked example — your 4.9 s dictation** (`dataset/audio/14.webm`, the
"bunny" sample, 4,935 ms):

- 4.935 s × 16,000 Hz = **78,960 samples**
- frames = 78,960 / 160 hop ≈ **494 frames** → padded to 3,000 frames (30 s)
- spectrogram tensor: **128 mels × 3,000 frames**
- the encoder's conv stem downsamples time ×2 → **1,500 positions**, each a
  1,280-dim vector (d_model)

So the encoder output for ANY 30 s of audio is a `1500 × 1280` matrix. That's
the entire acoustic interface: ~7.5 MB of float32 that the decoder reads
through cross-attention.

```python
# See the real shapes yourself (pip install transformers librosa torch)
from transformers import WhisperProcessor
import librosa

processor = WhisperProcessor.from_pretrained("openai/whisper-large-v3-turbo")
audio, sr = librosa.load("dataset/audio/14.webm", sr=16000)
feats = processor(audio, sampling_rate=16000, return_tensors="pt").input_features
print(feats.shape)   # torch.Size([1, 128, 3000])
```

## 3. Encoder: what the 32 layers learn

Conv stem (two 1-D convolutions, GELU, stride 2 on the second) then 32
pre-norm transformer layers with sinusoidal positions. Roughly, early layers
learn spectral patterns (formants, onsets), middle layers phonetic units, late
layers word-level and speaker/channel-robust features. The encoder is
**bidirectional** — it sees the whole 30 s at once, which is why Whisper is
robust to coarticulation ("did you" → "didja") that trips streaming models.

Parameter budget (turbo): encoder ≈ **663 M** of the 809 M total. This matters
for fine-tuning: most of the acoustic knowledge lives here, and speaker
adaptation (your voice, your mic) mostly perturbs encoder representations.

## 4. Decoder: tokens, not letters

The decoder is a standard causal transformer LM (4 layers in turbo — pruned
from 32 in large-v3) with cross-attention into the encoder output. It emits
**BPE tokens** from a 51,866-entry multilingual vocabulary.

The output sequence starts with control tokens — this is Whisper's "API":

```
<|startoftranscript|> <|en|> <|transcribe|> <|notimestamps|> Hey , Ġthis ...
                       │        │             │
                       │        │             └ or timestamp tokens <|0.00|>
                       │        └ task: transcribe | translate
                       └ language token (99 languages — the multilingual switch)
```

**Worked example — tokenization:**

```python
tok = processor.tokenizer
print(tok.encode(" Dhwani", add_special_tokens=False))
# [413, 71, 3757, 72]  → ' D', 'h', 'wan', 'i'  (4 tokens - rare word, no merge)
print(tok.encode(" bunny", add_special_tokens=False))
# [46033]              → ' bunny'                (1 token - common English word)
```

(Token ids vary by tokenizer version — run it; the *shape* of the result is the
point: rare words fragment, common words are single tokens.)

## 5. Why it heard "bunny": decoding is acoustics × language prior

At each step the decoder computes `P(next token | audio, tokens so far)`. That
probability blends what was *heard* with what is *linguistically likely* —
the decoder is also an implicit language model, trained on the text side of
5M+ hours of weakly-labeled audio (large-v3/turbo generation).

Your flywheel sample #1:

- said: **"Dhwani dataset"** → transcribed: **"bunny dataset"**
- acoustically, /d̪ʱʋəni/ and /bʌni/ share the nasal-vowel ending; the initial
  breathy-voiced /d̪ʱ/ doesn't exist in English and lands "between" English
  phones in encoder space
- the decoder's prior then votes: `P("bunny" | "...train my")` ≫
  `P(" D","h","wan","i" | "...train my")` — a 4-token improbable word loses to
  a 1-token common word

**Every fix for this is a way of shifting that vote:**

1. **Prompt biasing (now, no training):** the app's Custom Dictionary feeds
   words into Whisper's prompt, raising their prior. Cheap, works today,
   capped in power.
2. **Fine-tuning (Phase 4):** show the model (audio="Dhwani", text="Dhwani")
   pairs → it adjusts both the acoustic mapping and the decoder prior.
   Durable, and generalizes to your accent overall — that's the whole thesis
   of the personal flywheel.

## 6. Training: weak supervision at scale

Whisper's core trick is data, not architecture: ~680k hours (v2) → 5M+ hours
(v3 family) of web audio with transcripts of *mixed quality*, filtered
heuristically, formatted as the multitask token stream above, optimized with
plain cross-entropy on the next token. No CTC, no alignment. Robustness to
accents/noise is inherited from data diversity — and its blind spots (your
voice, your jargon, code-switching Hindi-English) are exactly where a targeted
fine-tune on hours of data can beat a model trained on millions.

## 7. The family we build on

| Model | Params | Enc/Dec layers | Mels | Notes |
|---|---|---|---|---|
| whisper-small | 244 M | 12 / 12 | 80 | Dhwani small-tier base candidate |
| whisper-medium | 769 M | 24 / 24 | 80 | |
| whisper-large-v3 | 1.55 B | 32 / 32 | 128 | max accuracy; Dhwani large tier |
| **whisper-large-v3-turbo** | **809 M** | **32 / 4** | **128** | large-v3 with pruned decoder, then re-fine-tuned; 1–2% WER of large-v3 at several× speed. Dhwani default tier |
| Parakeet-TDT-0.6B-v3 | 0.6 B | (FastConformer-TDT, not Whisper) | — | alt small tier: 25 langs, much faster, different training stack (NeMo) |

Turbo's design is the key insight for us: **the decoder was 32 layers of
mostly-language-modeling that could be cut to 4** with tiny accuracy loss.
Compute lives in the encoder; language knowledge is cheap.

## 8. How Dhwani runs it: whisper.cpp + GGML

The app doesn't run PyTorch. Models are converted to **GGML** single-file
format and executed by whisper.cpp (`resources/bin/whisper-server-*.exe`),
usually quantized:

- f16 turbo ≈ 1.6 GB (`~/.cache/dhwani/whisper-models/`)
- q5_1 quantization ≈ 0.6× size, near-identical WER
- our Phase 4 output must therefore end with: merge LoRA → HF checkpoint →
  `convert-h5-to-ggml.py` → GGML file the app's model picker can load

## 9. What "fine-tuning" will actually change (preview of doc 03)

Full fine-tuning updates all 809M weights — expensive and risky
(catastrophic forgetting of the other 98 languages). **LoRA** instead freezes
the model and learns low-rank deltas on attention projections:

- rank r=32 adapters on q/v projections of turbo ≈ **~20–40 M trainable
  params (~3–5%)** — fits consumer GPUs with the base in int8
- the update is `W' = W + BA` where `B∈ℝ^{d×r}, A∈ℝ^{r×d}` — merged back into
  `W` after training, so **inference cost is unchanged** and GGML conversion
  works as if it were a full fine-tune

Details, VRAM math, and the runbook: `03-training-guide.md`.

## 10. Metrics (preview of doc 04)

WER = (substitutions + insertions + deletions) / reference words. The "bunny"
sample: reference 11 words, 1 substitution → WER = 9.1%. Aggregated over a
held-out set of YOUR dictations, this is the number a Dhwani tier must beat
its stock base on to ship. Full treatment (normalization pitfalls, CER for
Indic scripts, RTFx speed): `04-evaluation-guide.md`.

---

**Sources:** [Whisper paper (Radford et al., 2022)](https://arxiv.org/abs/2212.04356),
[openai/whisper-large-v3-turbo config](https://huggingface.co/openai/whisper-large-v3-turbo),
[turbo benchmark notes](https://whispernotes.app/blog/introducing-whisper-large-v3-turbo),
[Parakeet-TDT-0.6B-v3 paper](https://arxiv.org/abs/2509.14128),
[whisper.cpp](https://github.com/ggerganov/whisper.cpp)
