#!/usr/bin/env python3
"""
evaluate.py

Evaluates a fine-tuned Whisper model against the base model on a test set.
Computes Word Error Rate (WER) for both models and produces a detailed
comparison report showing which specific words improved.

Usage:
    python evaluate.py \
        --base-model openai/whisper-base \
        --lora-path ./lora_adapter \
        --test-data ./dataset \
        --output ./evaluation_report.json
"""

import argparse
import json
import os
import sys
from collections import Counter
from datetime import datetime

import torch
from datasets import DatasetDict
from jiwer import wer as compute_wer
from jiwer import process_words
from peft import PeftModel
from tqdm import tqdm
from transformers import (
    WhisperForConditionalGeneration,
    WhisperProcessor,
)


def load_base_model(model_name: str, device: str):
    """Load the base Whisper model."""
    model = WhisperForConditionalGeneration.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    ).to(device)
    model.eval()
    return model


def load_finetuned_model(model_name: str, lora_path: str, device: str):
    """Load the base model with LoRA adapter applied."""
    base_model = WhisperForConditionalGeneration.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if device == "cuda" else torch.float32,
    )
    model = PeftModel.from_pretrained(base_model, lora_path)
    model = model.merge_and_unload()
    model = model.to(device)
    model.eval()
    return model


def transcribe_samples(model, processor, dataset, device: str, desc: str = ""):
    """Run inference on all samples in a dataset and return predictions."""
    predictions = []

    for sample in tqdm(dataset, desc=f"  {desc}"):
        input_features = torch.tensor(sample["input_features"]).unsqueeze(0).to(device)

        if device == "cuda":
            input_features = input_features.half()

        with torch.no_grad():
            predicted_ids = model.generate(
                input_features,
                max_new_tokens=225,
            )

        transcription = processor.batch_decode(
            predicted_ids, skip_special_tokens=True
        )[0].strip()

        predictions.append(transcription)

    return predictions


def compute_word_level_analysis(
    references: list[str],
    base_predictions: list[str],
    finetuned_predictions: list[str],
) -> dict:
    """
    Analyze word-level improvements and regressions between
    the base model and the fine-tuned model.
    """
    words_fixed = Counter()      # Words the fine-tuned model got right that base got wrong
    words_regressed = Counter()  # Words the fine-tuned model got wrong that base got right
    words_both_wrong = Counter() # Words both models got wrong

    for ref, base_pred, ft_pred in zip(references, base_predictions, finetuned_predictions):
        ref_words = ref.lower().split()
        base_words = base_pred.lower().split()
        ft_words = ft_pred.lower().split()

        # Simple positional comparison (works for similar-length outputs)
        max_len = max(len(ref_words), len(base_words), len(ft_words))

        for i in range(min(len(ref_words), max_len)):
            ref_w = ref_words[i] if i < len(ref_words) else ""
            base_w = base_words[i] if i < len(base_words) else ""
            ft_w = ft_words[i] if i < len(ft_words) else ""

            base_correct = ref_w == base_w
            ft_correct = ref_w == ft_w

            if not base_correct and ft_correct:
                words_fixed[f"{base_w} → {ref_w}"] += 1
            elif base_correct and not ft_correct:
                words_regressed[f"{ref_w} → {ft_w}"] += 1
            elif not base_correct and not ft_correct:
                words_both_wrong[f"{ref_w} (base: {base_w}, ft: {ft_w})"] += 1

    return {
        "words_fixed": dict(words_fixed.most_common(30)),
        "words_regressed": dict(words_regressed.most_common(30)),
        "words_both_wrong": dict(words_both_wrong.most_common(20)),
        "total_fixed": sum(words_fixed.values()),
        "total_regressed": sum(words_regressed.values()),
    }


def generate_report(
    base_wer: float,
    finetuned_wer: float,
    word_analysis: dict,
    num_samples: int,
    model_name: str,
    lora_path: str,
) -> dict:
    """Generate a comprehensive evaluation report."""
    improvement = ((base_wer - finetuned_wer) / base_wer * 100) if base_wer > 0 else 0

    report = {
        "summary": {
            "base_model": model_name,
            "lora_adapter": lora_path,
            "num_test_samples": num_samples,
            "base_wer": round(base_wer * 100, 2),
            "finetuned_wer": round(finetuned_wer * 100, 2),
            "improvement_pct": round(improvement, 2),
            "regression_check": "PASSED" if finetuned_wer <= base_wer else "FAILED",
        },
        "word_analysis": word_analysis,
        "evaluated_at": datetime.utcnow().isoformat() + "Z",
    }

    return report


def print_report(report: dict):
    """Print a formatted evaluation report to the console."""
    summary = report["summary"]
    analysis = report["word_analysis"]

    print()
    print("╔" + "═" * 58 + "╗")
    print("║" + "Evaluation Results".center(58) + "║")
    print("╠" + "═" * 58 + "╣")
    print(f"║  Base Model WER:      {summary['base_wer']:>6.2f}%{' ' * 30}║")
    print(f"║  Fine-Tuned WER:      {summary['finetuned_wer']:>6.2f}%{' ' * 30}║")
    print(f"║  Improvement:         {summary['improvement_pct']:>6.1f}%{' ' * 30}║")
    print("║" + " " * 58 + "║")

    if analysis["words_fixed"]:
        print("║  Most Improved Words:" + " " * 36 + "║")
        for correction, count in list(analysis["words_fixed"].items())[:5]:
            line = f"    {correction}  ({count}x fixed)"
            print(f"║  {line:<56}║")

    print("║" + " " * 58 + "║")
    status = summary["regression_check"]
    status_icon = "✅" if status == "PASSED" else "❌"
    print(f"║  Regression Check:    {status_icon} {status}{' ' * (33 - len(status))}║")
    print("╚" + "═" * 58 + "╝")

    if analysis["total_regressed"] > 0:
        print(f"\n  ⚠ {analysis['total_regressed']} word(s) regressed:")
        for word, count in list(analysis["words_regressed"].items())[:5]:
            print(f"    - {word}  ({count}x)")


def main():
    parser = argparse.ArgumentParser(
        description="Evaluate fine-tuned Whisper model against baseline"
    )
    parser.add_argument(
        "--base-model",
        required=True,
        help="HuggingFace base Whisper model ID",
    )
    parser.add_argument(
        "--lora-path",
        required=True,
        help="Path to the trained LoRA adapter",
    )
    parser.add_argument(
        "--test-data",
        required=True,
        help="Path to the prepared dataset (with test split)",
    )
    parser.add_argument(
        "--output",
        default="./evaluation_report.json",
        help="Output path for the evaluation report",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cuda", "mps", "cpu"],
        help="Device for inference (default: auto-detect)",
    )
    args = parser.parse_args()

    # Detect device
    if args.device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
        else:
            device = "cpu"
    else:
        device = args.device

    print("=" * 60)
    print("  Dhwani Whisper LoRA Evaluation")
    print("=" * 60)
    print(f"\n  Base Model:  {args.base_model}")
    print(f"  LoRA Path:   {args.lora_path}")
    print(f"  Test Data:   {args.test_data}")
    print(f"  Device:      {device}")

    # Load dataset
    print(f"\n  Loading test dataset...")
    dataset = DatasetDict.load_from_disk(args.test_data)

    if "test" not in dataset:
        print("  Error: Dataset does not contain a 'test' split.")
        sys.exit(1)

    test_dataset = dataset["test"]
    references = test_dataset["text"]

    print(f"  Test samples: {len(test_dataset)}")

    # Load processor
    processor = WhisperProcessor.from_pretrained(args.base_model)

    # ── Evaluate base model ────────────────────────────────────
    print(f"\n  Loading base model: {args.base_model}...")
    base_model = load_base_model(args.base_model, device)

    base_predictions = transcribe_samples(
        base_model, processor, test_dataset, device, "Base model inference"
    )

    base_wer = compute_wer(references, base_predictions)
    print(f"  Base WER: {base_wer * 100:.2f}%")

    # Free memory
    del base_model
    torch.cuda.empty_cache() if device == "cuda" else None

    # ── Evaluate fine-tuned model ──────────────────────────────
    print(f"\n  Loading fine-tuned model...")
    ft_model = load_finetuned_model(args.base_model, args.lora_path, device)

    ft_predictions = transcribe_samples(
        ft_model, processor, test_dataset, device, "Fine-tuned model inference"
    )

    ft_wer = compute_wer(references, ft_predictions)
    print(f"  Fine-tuned WER: {ft_wer * 100:.2f}%")

    # Free memory
    del ft_model
    torch.cuda.empty_cache() if device == "cuda" else None

    # ── Word-level analysis ────────────────────────────────────
    print("\n  Analyzing word-level improvements...")
    word_analysis = compute_word_level_analysis(
        references, base_predictions, ft_predictions
    )

    # ── Generate report ────────────────────────────────────────
    report = generate_report(
        base_wer=base_wer,
        finetuned_wer=ft_wer,
        word_analysis=word_analysis,
        num_samples=len(test_dataset),
        model_name=args.base_model,
        lora_path=args.lora_path,
    )

    # Save report
    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, "w") as f:
        json.dump(report, f, indent=2)

    # Print formatted report
    print_report(report)

    print(f"\n  Report saved to: {os.path.abspath(args.output)}")

    # Save sample comparisons
    samples_output = args.output.replace(".json", "_samples.json")
    samples = []
    for i in range(min(20, len(references))):
        samples.append(
            {
                "reference": references[i],
                "base_prediction": base_predictions[i],
                "finetuned_prediction": ft_predictions[i],
            }
        )

    with open(samples_output, "w", encoding="utf-8") as f:
        json.dump(samples, f, indent=2, ensure_ascii=False)

    print(f"  Sample comparisons saved to: {os.path.abspath(samples_output)}")


if __name__ == "__main__":
    main()
