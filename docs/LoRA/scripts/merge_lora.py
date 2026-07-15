#!/usr/bin/env python3
"""
merge_lora.py

Merges LoRA adapter weights back into the base Whisper model to produce
a single, standalone model file. Optionally exports to GGML format for
use with whisper.cpp in the Dhwani desktop application.

Usage:
    python merge_lora.py \
        --base-model openai/whisper-base \
        --lora-path ./lora_adapter \
        --output ./whisper-base-personalized \
        --export-ggml

    python merge_lora.py \
        --base-model openai/whisper-base \
        --lora-path ./lora_adapter \
        --output ./whisper-base-personalized \
        --export-ggml \
        --whisper-cpp-path ../../resources/bin/whisper
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from datetime import datetime

import torch
from peft import PeftModel
from transformers import WhisperForConditionalGeneration, WhisperProcessor


def merge_lora_weights(
    base_model_name: str,
    lora_path: str,
    output_dir: str,
    device: str = "cpu",
) -> None:
    """
    Load the base Whisper model, apply the LoRA adapter, merge the weights,
    and save the resulting model.
    """
    print(f"\n  Loading base model: {base_model_name}...")
    base_model = WhisperForConditionalGeneration.from_pretrained(
        base_model_name,
        torch_dtype=torch.float32,  # Merge in full precision for accuracy
        device_map=device,
    )

    print(f"  Loading LoRA adapter: {lora_path}...")
    model = PeftModel.from_pretrained(base_model, lora_path)

    print("  Merging LoRA weights into base model...")
    merged_model = model.merge_and_unload()

    # Save the merged model
    print(f"  Saving merged model to {output_dir}...")
    os.makedirs(output_dir, exist_ok=True)
    merged_model.save_pretrained(output_dir, safe_serialization=True)

    # Save the processor (tokenizer + feature extractor)
    processor = WhisperProcessor.from_pretrained(base_model_name)
    processor.save_pretrained(output_dir)

    # Copy training metadata if it exists
    metadata_src = os.path.join(lora_path, "training_metadata.json")
    if os.path.exists(metadata_src):
        metadata_dst = os.path.join(output_dir, "training_metadata.json")
        shutil.copy2(metadata_src, metadata_dst)

    # Compute and save model info
    total_params = sum(p.numel() for p in merged_model.parameters())
    model_size_mb = sum(
        p.numel() * p.element_size() for p in merged_model.parameters()
    ) / (1024 * 1024)

    model_info = {
        "base_model": base_model_name,
        "lora_adapter": lora_path,
        "total_parameters": total_params,
        "model_size_mb": round(model_size_mb, 2),
        "merged_at": datetime.utcnow().isoformat() + "Z",
        "format": "safetensors",
    }

    with open(os.path.join(output_dir, "model_info.json"), "w") as f:
        json.dump(model_info, f, indent=2)

    print(f"\n  ✓ Merged model saved ({model_size_mb:.1f} MB)")


def export_to_ggml(
    merged_model_dir: str,
    output_dir: str,
    whisper_cpp_path: str | None = None,
) -> str | None:
    """
    Convert the merged HuggingFace model to GGML format for whisper.cpp.

    This requires the whisper.cpp conversion script. If whisper_cpp_path
    is not provided, it will attempt to find it automatically.
    """
    print("\n  Converting to GGML format...")

    # Find the conversion script
    convert_script = None
    search_paths = []

    if whisper_cpp_path:
        search_paths.append(
            os.path.join(whisper_cpp_path, "models", "convert-h5-to-ggml.py")
        )
        search_paths.append(
            os.path.join(whisper_cpp_path, "convert-h5-to-ggml.py")
        )

    # Common locations
    search_paths.extend(
        [
            os.path.join(os.path.dirname(__file__), "..", "..", "..", "resources", "bin", "whisper", "models", "convert-h5-to-ggml.py"),
            os.path.expanduser("~/whisper.cpp/models/convert-h5-to-ggml.py"),
            "/usr/local/share/whisper.cpp/models/convert-h5-to-ggml.py",
        ]
    )

    for path in search_paths:
        if os.path.exists(path):
            convert_script = path
            break

    if convert_script is None:
        print("  ⚠ Could not find whisper.cpp conversion script.")
        print("  Trying alternative conversion method using transformers...")
        return export_to_ggml_alternative(merged_model_dir, output_dir)

    # Run the conversion
    ggml_output = os.path.join(output_dir, "ggml-model.bin")

    try:
        result = subprocess.run(
            [
                sys.executable,
                convert_script,
                merged_model_dir,
                os.path.dirname(convert_script),
                ggml_output,
            ],
            capture_output=True,
            text=True,
            timeout=300,
        )

        if result.returncode != 0:
            print(f"  Error during conversion: {result.stderr}")
            return None

        if os.path.exists(ggml_output):
            size_mb = os.path.getsize(ggml_output) / (1024 * 1024)
            print(f"  ✓ GGML model exported: {ggml_output} ({size_mb:.1f} MB)")
            return ggml_output
        else:
            print("  Error: GGML output file was not created.")
            return None

    except subprocess.TimeoutExpired:
        print("  Error: Conversion timed out after 5 minutes.")
        return None
    except FileNotFoundError:
        print(f"  Error: Python not found at {sys.executable}")
        return None


def export_to_ggml_alternative(
    merged_model_dir: str,
    output_dir: str,
) -> str | None:
    """
    Alternative GGML export using the `ct2-transformers-converter` tool
    or manual weight extraction.

    This is a fallback when the whisper.cpp conversion script is not available.
    """
    try:
        # Try using the huggingface_hub's convert utility
        from transformers import WhisperForConditionalGeneration

        print("  Loading merged model for manual GGML conversion...")
        model = WhisperForConditionalGeneration.from_pretrained(merged_model_dir)

        # Extract state dict
        state_dict = model.state_dict()

        # Save in a format that can be manually converted
        ggml_prep_dir = os.path.join(output_dir, "ggml_prep")
        os.makedirs(ggml_prep_dir, exist_ok=True)

        torch.save(state_dict, os.path.join(ggml_prep_dir, "pytorch_model.bin"))

        print(f"  ✓ Model weights saved for manual GGML conversion at {ggml_prep_dir}")
        print("  To complete GGML conversion, run:")
        print(f"    python whisper.cpp/models/convert-h5-to-ggml.py {merged_model_dir} whisper.cpp/models/ output.bin")

        return None

    except Exception as e:
        print(f"  Error during alternative conversion: {e}")
        return None


def main():
    parser = argparse.ArgumentParser(
        description="Merge LoRA adapter into base Whisper model and optionally export to GGML"
    )
    parser.add_argument(
        "--base-model",
        required=True,
        help="HuggingFace base Whisper model ID (e.g., openai/whisper-base)",
    )
    parser.add_argument(
        "--lora-path",
        required=True,
        help="Path to the trained LoRA adapter directory",
    )
    parser.add_argument(
        "--output",
        required=True,
        help="Output directory for the merged model",
    )
    parser.add_argument(
        "--export-ggml",
        action="store_true",
        help="Also export the merged model to GGML format for whisper.cpp",
    )
    parser.add_argument(
        "--whisper-cpp-path",
        default=None,
        help="Path to whisper.cpp directory (for GGML conversion)",
    )
    parser.add_argument(
        "--device",
        default="cpu",
        help="Device to use for merging (default: cpu)",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  Dhwani LoRA Merge Tool")
    print("=" * 60)
    print(f"\n  Base Model:  {args.base_model}")
    print(f"  LoRA Path:   {args.lora_path}")
    print(f"  Output:      {args.output}")
    print(f"  Export GGML: {args.export_ggml}")

    # Validate inputs
    if not os.path.exists(args.lora_path):
        print(f"\n  Error: LoRA adapter not found at {args.lora_path}")
        sys.exit(1)

    # Step 1: Merge
    merge_lora_weights(
        base_model_name=args.base_model,
        lora_path=args.lora_path,
        output_dir=args.output,
        device=args.device,
    )

    # Step 2: Export to GGML (optional)
    if args.export_ggml:
        ggml_path = export_to_ggml(
            merged_model_dir=args.output,
            output_dir=args.output,
            whisper_cpp_path=args.whisper_cpp_path,
        )

        if ggml_path:
            print(f"\n  ✓ GGML model ready for Dhwani: {ggml_path}")
            print("  Copy this file to your Dhwani personalized_models directory.")
        else:
            print("\n  ⚠ GGML export could not be completed automatically.")
            print("  The HuggingFace model was saved successfully and can be")
            print("  converted to GGML manually using whisper.cpp tools.")

    print(f"\n  Done! Output: {os.path.abspath(args.output)}")


if __name__ == "__main__":
    main()
