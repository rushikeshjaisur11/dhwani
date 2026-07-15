#!/usr/bin/env python3
"""
prepare_dataset.py

Converts exported correction pairs into a HuggingFace-compatible dataset
for Whisper LoRA fine-tuning. This script:
  1. Loads each audio file and resamples to 16kHz mono
  2. Computes Whisper log-mel spectrograms
  3. Tokenizes the corrected text using Whisper's tokenizer
  4. Splits into train/test sets
  5. Saves as a HuggingFace DatasetDict

Usage:
    python prepare_dataset.py \
        --input ./training_data \
        --output ./dataset \
        --whisper-model openai/whisper-base \
        --max-duration 30.0 \
        --test-split 0.1
"""

import argparse
import json
import os
import sys
from pathlib import Path

import numpy as np
import soundfile as sf
import torch
import torchaudio
from datasets import Audio, Dataset, DatasetDict, Features, Value
from tqdm import tqdm
from transformers import WhisperFeatureExtractor, WhisperTokenizer


def load_and_resample_audio(
    audio_path: str,
    target_sample_rate: int = 16000,
    max_duration_s: float = 30.0,
) -> tuple[np.ndarray, int] | None:
    """
    Load an audio file, convert to mono, resample to 16kHz,
    and truncate to max_duration_s.

    Returns (audio_array, sample_rate) or None if the file is invalid.
    """
    try:
        waveform, sample_rate = torchaudio.load(audio_path)

        # Convert to mono if stereo
        if waveform.shape[0] > 1:
            waveform = waveform.mean(dim=0, keepdim=True)

        # Resample to target sample rate
        if sample_rate != target_sample_rate:
            resampler = torchaudio.transforms.Resample(
                orig_freq=sample_rate, new_freq=target_sample_rate
            )
            waveform = resampler(waveform)

        # Truncate to max duration
        max_samples = int(max_duration_s * target_sample_rate)
        if waveform.shape[1] > max_samples:
            waveform = waveform[:, :max_samples]

        # Convert to numpy (1D array)
        audio_array = waveform.squeeze().numpy()

        return audio_array, target_sample_rate

    except Exception as e:
        print(f"  Warning: Could not load {audio_path}: {e}")
        return None


def chunk_long_audio(
    audio_array: np.ndarray,
    text: str,
    sample_rate: int = 16000,
    max_duration_s: float = 30.0,
    overlap_s: float = 1.0,
) -> list[tuple[np.ndarray, str]]:
    """
    Split long audio into chunks of max_duration_s with overlap.

    For simplicity, we split the text proportionally by duration.
    This is approximate but works well enough for training.
    """
    max_samples = int(max_duration_s * sample_rate)
    total_samples = len(audio_array)

    if total_samples <= max_samples:
        return [(audio_array, text)]

    overlap_samples = int(overlap_s * sample_rate)
    stride = max_samples - overlap_samples
    chunks = []

    words = text.split()
    total_words = len(words)

    start = 0
    while start < total_samples:
        end = min(start + max_samples, total_samples)
        chunk_audio = audio_array[start:end]

        # Proportionally assign words to this chunk
        word_start = int((start / total_samples) * total_words)
        word_end = int((end / total_samples) * total_words)
        chunk_text = " ".join(words[word_start:word_end])

        if chunk_text.strip():
            chunks.append((chunk_audio, chunk_text))

        start += stride

    return chunks


def prepare_dataset(
    input_dir: str,
    output_dir: str,
    whisper_model: str = "openai/whisper-base",
    max_duration_s: float = 30.0,
    test_split: float = 0.1,
    language: str = "en",
) -> None:
    """
    Prepare a HuggingFace dataset from exported correction pairs.
    """
    pairs_dir = os.path.join(input_dir, "pairs")
    manifest_path = os.path.join(input_dir, "manifest.json")

    if not os.path.exists(manifest_path):
        print(f"Error: manifest.json not found in {input_dir}")
        print("Run collect_training_data.py first.")
        sys.exit(1)

    with open(manifest_path) as f:
        manifest = json.load(f)

    print(f"  Loading {manifest['total_pairs']} correction pairs...")

    # Load Whisper tokenizer and feature extractor
    print(f"  Loading Whisper components from '{whisper_model}'...")
    feature_extractor = WhisperFeatureExtractor.from_pretrained(whisper_model)
    tokenizer = WhisperTokenizer.from_pretrained(
        whisper_model, language=language, task="transcribe"
    )

    # Process all pairs
    processed_samples = []
    skipped = 0

    pair_files = sorted(Path(pairs_dir).glob("*.json"))

    for pair_file in tqdm(pair_files, desc="  Processing pairs"):
        with open(pair_file) as f:
            pair = json.load(f)

        audio_path = os.path.join(input_dir, pair["audio_file"])

        # Load and resample audio
        result = load_and_resample_audio(audio_path, 16000, max_duration_s * 2)
        if result is None:
            skipped += 1
            continue

        audio_array, sample_rate = result

        # Use the corrected text as the training target
        corrected_text = pair["corrected_text"].strip()

        if not corrected_text:
            skipped += 1
            continue

        # Chunk long audio if necessary
        chunks = chunk_long_audio(
            audio_array, corrected_text, sample_rate, max_duration_s
        )

        for chunk_audio, chunk_text in chunks:
            # Compute log-mel spectrogram features
            input_features = feature_extractor(
                chunk_audio,
                sampling_rate=sample_rate,
                return_tensors="np",
            ).input_features[0]

            # Tokenize the target text
            labels = tokenizer(chunk_text).input_ids

            processed_samples.append(
                {
                    "input_features": input_features,
                    "labels": labels,
                    "text": chunk_text,
                    "raw_stt_text": pair.get("raw_stt_text", ""),
                    "audio_duration_s": len(chunk_audio) / sample_rate,
                }
            )

    print(f"\n  Processed: {len(processed_samples)} samples ({skipped} skipped)")

    if len(processed_samples) == 0:
        print("  Error: No valid samples processed!")
        sys.exit(1)

    # Split into train and test
    num_test = max(1, int(len(processed_samples) * test_split))
    num_train = len(processed_samples) - num_test

    # Shuffle before splitting
    np.random.seed(42)
    indices = np.random.permutation(len(processed_samples))

    train_indices = indices[:num_train]
    test_indices = indices[num_train:]

    train_samples = [processed_samples[i] for i in train_indices]
    test_samples = [processed_samples[i] for i in test_indices]

    print(f"  Train: {len(train_samples)} samples")
    print(f"  Test:  {len(test_samples)} samples")

    # Create HuggingFace datasets
    def samples_to_dict(samples):
        return {
            "input_features": [s["input_features"] for s in samples],
            "labels": [s["labels"] for s in samples],
            "text": [s["text"] for s in samples],
            "raw_stt_text": [s["raw_stt_text"] for s in samples],
            "audio_duration_s": [s["audio_duration_s"] for s in samples],
        }

    train_dataset = Dataset.from_dict(samples_to_dict(train_samples))
    test_dataset = Dataset.from_dict(samples_to_dict(test_samples))

    dataset_dict = DatasetDict({"train": train_dataset, "test": test_dataset})

    # Save
    os.makedirs(output_dir, exist_ok=True)
    dataset_dict.save_to_disk(output_dir)

    # Save metadata
    metadata = {
        "whisper_model": whisper_model,
        "language": language,
        "max_duration_s": max_duration_s,
        "test_split": test_split,
        "num_train": len(train_samples),
        "num_test": len(test_samples),
        "total_audio_minutes": round(
            sum(s["audio_duration_s"] for s in processed_samples) / 60, 2
        ),
    }

    with open(os.path.join(output_dir, "metadata.json"), "w") as f:
        json.dump(metadata, f, indent=2)

    print(f"\n  ✓ Dataset saved to {os.path.abspath(output_dir)}")
    print(
        f"    Total audio: {metadata['total_audio_minutes']} minutes"
    )


def main():
    parser = argparse.ArgumentParser(
        description="Prepare HuggingFace dataset from Dhwani correction pairs"
    )
    parser.add_argument(
        "--input",
        required=True,
        help="Input directory (output of collect_training_data.py)",
    )
    parser.add_argument(
        "--output",
        default="./dataset",
        help="Output directory for the HuggingFace dataset",
    )
    parser.add_argument(
        "--whisper-model",
        default="openai/whisper-base",
        help="HuggingFace Whisper model ID (default: openai/whisper-base)",
    )
    parser.add_argument(
        "--max-duration",
        type=float,
        default=30.0,
        help="Maximum audio duration per sample in seconds (default: 30.0)",
    )
    parser.add_argument(
        "--test-split",
        type=float,
        default=0.1,
        help="Fraction of data to use for testing (default: 0.1)",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Language code (default: en)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  Dhwani Dataset Preparation")
    print("=" * 60)
    print(f"\n  Input:     {args.input}")
    print(f"  Output:    {args.output}")
    print(f"  Model:     {args.whisper_model}")
    print(f"  Language:  {args.language}")
    print()

    prepare_dataset(
        input_dir=args.input,
        output_dir=args.output,
        whisper_model=args.whisper_model,
        max_duration_s=args.max_duration,
        test_split=args.test_split,
        language=args.language,
    )


if __name__ == "__main__":
    main()
