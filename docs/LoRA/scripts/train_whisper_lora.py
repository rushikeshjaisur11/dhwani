#!/usr/bin/env python3
"""
train_whisper_lora.py

Full LoRA fine-tuning script for OpenAI Whisper models using PEFT.
Trains a lightweight adapter on user-specific correction data collected
by Dhwani, producing a personalized STT model.

Usage:
    python train_whisper_lora.py \
        --model openai/whisper-base \
        --dataset ./dataset \
        --output ./lora_adapter \
        --epochs 5 \
        --rank 8 \
        --alpha 16 \
        --learning-rate 3e-4 \
        --batch-size 4

Resume from checkpoint:
    python train_whisper_lora.py \
        --model openai/whisper-base \
        --dataset ./dataset \
        --output ./lora_adapter \
        --resume-from ./lora_adapter/checkpoint-500
"""

import argparse
import json
import os
import sys
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import evaluate
import numpy as np
import torch
from datasets import DatasetDict
from peft import LoraConfig, PeftModel, get_peft_model, prepare_model_for_kbit_training
from transformers import (
    Seq2SeqTrainer,
    Seq2SeqTrainingArguments,
    WhisperForConditionalGeneration,
    WhisperProcessor,
    WhisperTokenizer,
)


@dataclass
class DataCollatorSpeechSeq2SeqWithPadding:
    """
    Custom data collator for Whisper fine-tuning.

    Handles padding of both input features (log-mel spectrograms)
    and labels (tokenized text) to create uniform batches.
    """

    processor: Any
    decoder_start_token_id: int

    def __call__(self, features: list[dict]) -> dict:
        # Extract input features and pad
        input_features = [
            {"input_features": feature["input_features"]} for feature in features
        ]
        batch = self.processor.feature_extractor.pad(
            input_features, return_tensors="pt"
        )

        # Extract labels and pad
        label_features = [{"input_ids": feature["labels"]} for feature in features]
        labels_batch = self.processor.tokenizer.pad(
            label_features, return_tensors="pt"
        )

        # Replace padding token id with -100 so it's ignored by the loss function
        labels = labels_batch["input_ids"].masked_fill(
            labels_batch.attention_mask.ne(1), -100
        )

        # If the beginning-of-sentence token was appended during previous tokenization,
        # cut it here since it will be appended later anyway
        if (labels[:, 0] == self.decoder_start_token_id).all().cpu().item():
            labels = labels[:, 1:]

        batch["labels"] = labels

        return batch


def compute_metrics(pred, tokenizer, metric):
    """Compute Word Error Rate (WER) metric."""
    pred_ids = pred.predictions
    label_ids = pred.label_ids

    # Replace -100 with pad token id
    label_ids[label_ids == -100] = tokenizer.pad_token_id

    # Decode predictions and references
    pred_str = tokenizer.batch_decode(pred_ids, skip_special_tokens=True)
    label_str = tokenizer.batch_decode(label_ids, skip_special_tokens=True)

    # Compute WER
    wer = 100 * metric.compute(predictions=pred_str, references=label_str)

    return {"wer": wer}


def print_trainable_parameters(model):
    """Print the number of trainable parameters in the model."""
    trainable_params = 0
    all_params = 0
    for _, param in model.named_parameters():
        all_params += param.numel()
        if param.requires_grad:
            trainable_params += param.numel()

    trainable_pct = 100 * trainable_params / all_params
    print(f"\n  Model Parameters:")
    print(f"    Total:     {all_params:,}")
    print(f"    Trainable: {trainable_params:,} ({trainable_pct:.2f}%)")
    print()


def train(
    model_name: str,
    dataset_path: str,
    output_dir: str,
    epochs: int = 5,
    rank: int = 8,
    alpha: int = 16,
    dropout: float = 0.05,
    learning_rate: float = 3e-4,
    batch_size: int = 4,
    gradient_accumulation_steps: int = 2,
    warmup_steps: int = 50,
    device: str = "auto",
    resume_from: str | None = None,
    language: str = "en",
    fp16: bool = True,
):
    """Run the full LoRA training pipeline."""

    print("=" * 60)
    print("  Dhwani Whisper LoRA Fine-Tuning")
    print("=" * 60)

    # ── Detect device ──────────────────────────────────────────
    if device == "auto":
        if torch.cuda.is_available():
            device = "cuda"
            print(f"\n  Device: CUDA ({torch.cuda.get_device_name(0)})")
            print(f"  VRAM:   {torch.cuda.get_device_properties(0).total_mem / 1e9:.1f} GB")
        elif hasattr(torch.backends, "mps") and torch.backends.mps.is_available():
            device = "mps"
            print(f"\n  Device: Apple MPS (Metal Performance Shaders)")
            fp16 = False  # MPS doesn't support fp16 training well
        else:
            device = "cpu"
            print(f"\n  Device: CPU (training will be slow)")
            fp16 = False

    # ── Load dataset ───────────────────────────────────────────
    print(f"\n  Loading dataset from {dataset_path}...")
    dataset = DatasetDict.load_from_disk(dataset_path)

    # Load dataset metadata
    metadata_path = os.path.join(dataset_path, "metadata.json")
    if os.path.exists(metadata_path):
        with open(metadata_path) as f:
            dataset_metadata = json.load(f)
        print(f"  Train samples: {dataset_metadata.get('num_train', '?')}")
        print(f"  Test samples:  {dataset_metadata.get('num_test', '?')}")
        print(f"  Audio:         {dataset_metadata.get('total_audio_minutes', '?')} min")

    # ── Load Whisper model ─────────────────────────────────────
    print(f"\n  Loading base model: {model_name}...")

    processor = WhisperProcessor.from_pretrained(
        model_name, language=language, task="transcribe"
    )
    tokenizer = WhisperTokenizer.from_pretrained(
        model_name, language=language, task="transcribe"
    )

    model = WhisperForConditionalGeneration.from_pretrained(
        model_name,
        torch_dtype=torch.float16 if (fp16 and device == "cuda") else torch.float32,
    )

    # Whisper-specific config
    model.generation_config.language = language
    model.generation_config.task = "transcribe"
    model.generation_config.forced_decoder_ids = None

    # ── Configure LoRA ─────────────────────────────────────────
    print(f"\n  Configuring LoRA (rank={rank}, alpha={alpha}, dropout={dropout})...")

    if resume_from and os.path.exists(resume_from):
        print(f"  Resuming from: {resume_from}")
        model = PeftModel.from_pretrained(model, resume_from)
        # Unfreeze LoRA parameters for continued training
        for name, param in model.named_parameters():
            if "lora" in name.lower():
                param.requires_grad = True
    else:
        # Define which layers to apply LoRA to
        # For Whisper, we target the attention projections in both encoder and decoder
        lora_config = LoraConfig(
            r=rank,
            lora_alpha=alpha,
            lora_dropout=dropout,
            target_modules=[
                "q_proj",    # Query projection
                "v_proj",    # Value projection
                "k_proj",    # Key projection
                "out_proj",  # Output projection
            ],
            bias="none",
            task_type="SEQ_2_SEQ_LM",
        )

        model = get_peft_model(model, lora_config)

    print_trainable_parameters(model)

    # ── Data collator ──────────────────────────────────────────
    data_collator = DataCollatorSpeechSeq2SeqWithPadding(
        processor=processor,
        decoder_start_token_id=model.config.decoder_start_token_id,
    )

    # ── WER metric ─────────────────────────────────────────────
    wer_metric = evaluate.load("wer")

    def compute_metrics_fn(pred):
        return compute_metrics(pred, tokenizer, wer_metric)

    # ── Training arguments ─────────────────────────────────────
    training_args = Seq2SeqTrainingArguments(
        output_dir=output_dir,
        num_train_epochs=epochs,
        per_device_train_batch_size=batch_size,
        per_device_eval_batch_size=batch_size,
        gradient_accumulation_steps=gradient_accumulation_steps,
        learning_rate=learning_rate,
        lr_scheduler_type="cosine",
        warmup_steps=warmup_steps,
        fp16=fp16 and device == "cuda",
        eval_strategy="epoch",
        save_strategy="epoch",
        save_total_limit=3,
        load_best_model_at_end=True,
        metric_for_best_model="wer",
        greater_is_better=False,
        predict_with_generate=True,
        generation_max_length=225,
        logging_steps=10,
        logging_dir=os.path.join(output_dir, "logs"),
        report_to="none",
        remove_unused_columns=False,
        dataloader_num_workers=2 if device != "cpu" else 0,
        seed=42,
    )

    # ── Trainer ────────────────────────────────────────────────
    trainer = Seq2SeqTrainer(
        model=model,
        args=training_args,
        train_dataset=dataset["train"],
        eval_dataset=dataset["test"],
        data_collator=data_collator,
        compute_metrics=compute_metrics_fn,
        tokenizer=processor.feature_extractor,
    )

    # ── Compute baseline WER ───────────────────────────────────
    print("  Computing baseline WER on test set...")
    baseline_results = trainer.evaluate()
    baseline_wer = baseline_results.get("eval_wer", -1)
    print(f"  Baseline WER: {baseline_wer:.2f}%")

    # ── Train ──────────────────────────────────────────────────
    print(f"\n  Starting training for {epochs} epochs...")
    print(f"  Effective batch size: {batch_size * gradient_accumulation_steps}")
    print(f"  Learning rate: {learning_rate}")
    print()

    train_result = trainer.train(
        resume_from_checkpoint=resume_from
        if resume_from and os.path.exists(os.path.join(resume_from, "trainer_state.json"))
        else None
    )

    # ── Evaluate final model ───────────────────────────────────
    print("\n  Evaluating fine-tuned model...")
    final_results = trainer.evaluate()
    final_wer = final_results.get("eval_wer", -1)

    improvement = ((baseline_wer - final_wer) / baseline_wer * 100) if baseline_wer > 0 else 0

    print(f"\n  {'=' * 50}")
    print(f"  Training Complete!")
    print(f"  {'=' * 50}")
    print(f"  Baseline WER:   {baseline_wer:.2f}%")
    print(f"  Fine-tuned WER: {final_wer:.2f}%")
    print(f"  Improvement:    {improvement:.1f}%")

    # ── Save the LoRA adapter ──────────────────────────────────
    print(f"\n  Saving LoRA adapter to {output_dir}...")
    model.save_pretrained(output_dir)
    processor.save_pretrained(output_dir)

    # Save training metadata
    training_metadata = {
        "base_model": model_name,
        "lora_rank": rank,
        "lora_alpha": alpha,
        "lora_dropout": dropout,
        "epochs": epochs,
        "learning_rate": learning_rate,
        "batch_size": batch_size,
        "gradient_accumulation_steps": gradient_accumulation_steps,
        "baseline_wer": round(baseline_wer, 4),
        "final_wer": round(final_wer, 4),
        "improvement_pct": round(improvement, 2),
        "device": device,
        "fp16": fp16,
        "language": language,
        "train_loss": train_result.training_loss,
        "train_samples": len(dataset["train"]),
        "test_samples": len(dataset["test"]),
        "trained_at": datetime.utcnow().isoformat() + "Z",
    }

    with open(os.path.join(output_dir, "training_metadata.json"), "w") as f:
        json.dump(training_metadata, f, indent=2)

    print(f"\n  ✓ LoRA adapter saved to: {os.path.abspath(output_dir)}")

    # ── Warn if model regressed ────────────────────────────────
    if final_wer >= baseline_wer and baseline_wer > 0:
        print("\n  ⚠ WARNING: The fine-tuned model did not improve over baseline!")
        print("  Possible causes:")
        print("    - Not enough training data (try collecting more corrections)")
        print("    - Learning rate too high (try lowering to 1e-4)")
        print("    - Overfitting (try adding --dropout 0.1)")
        print("    - Noisy training data (review and clean correction pairs)")

    return training_metadata


def main():
    parser = argparse.ArgumentParser(
        description="LoRA fine-tuning for Whisper on Dhwani correction data"
    )
    parser.add_argument(
        "--model",
        default="openai/whisper-base",
        help="HuggingFace Whisper model ID",
    )
    parser.add_argument(
        "--dataset",
        required=True,
        help="Path to prepared HuggingFace dataset (output of prepare_dataset.py)",
    )
    parser.add_argument(
        "--output",
        default="./lora_adapter",
        help="Output directory for the LoRA adapter",
    )
    parser.add_argument(
        "--epochs",
        type=int,
        default=5,
        help="Number of training epochs (default: 5)",
    )
    parser.add_argument(
        "--rank",
        type=int,
        default=8,
        help="LoRA rank (default: 8)",
    )
    parser.add_argument(
        "--alpha",
        type=int,
        default=16,
        help="LoRA alpha scaling factor (default: 16, usually 2x rank)",
    )
    parser.add_argument(
        "--dropout",
        type=float,
        default=0.05,
        help="LoRA dropout rate (default: 0.05)",
    )
    parser.add_argument(
        "--learning-rate",
        type=float,
        default=3e-4,
        help="Learning rate (default: 3e-4)",
    )
    parser.add_argument(
        "--batch-size",
        type=int,
        default=4,
        help="Training batch size per device (default: 4)",
    )
    parser.add_argument(
        "--gradient-accumulation",
        type=int,
        default=2,
        help="Gradient accumulation steps (default: 2)",
    )
    parser.add_argument(
        "--warmup-steps",
        type=int,
        default=50,
        help="Learning rate warmup steps (default: 50)",
    )
    parser.add_argument(
        "--device",
        default="auto",
        choices=["auto", "cuda", "mps", "cpu"],
        help="Training device (default: auto-detect)",
    )
    parser.add_argument(
        "--resume-from",
        default=None,
        help="Path to a previous LoRA adapter or checkpoint to resume from",
    )
    parser.add_argument(
        "--language",
        default="en",
        help="Language code (default: en)",
    )
    parser.add_argument(
        "--no-fp16",
        action="store_true",
        help="Disable mixed precision training",
    )
    args = parser.parse_args()

    train(
        model_name=args.model,
        dataset_path=args.dataset,
        output_dir=args.output,
        epochs=args.epochs,
        rank=args.rank,
        alpha=args.alpha,
        dropout=args.dropout,
        learning_rate=args.learning_rate,
        batch_size=args.batch_size,
        gradient_accumulation_steps=args.gradient_accumulation,
        warmup_steps=args.warmup_steps,
        device=args.device,
        resume_from=args.resume_from,
        language=args.language,
        fp16=not args.no_fp16,
    )


if __name__ == "__main__":
    main()
