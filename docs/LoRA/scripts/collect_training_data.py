#!/usr/bin/env python3
"""
collect_training_data.py

Exports correction pairs from Dhwani's SQLite database into a structured
directory suitable for LoRA fine-tuning. Each correction pair consists of:
  - The raw audio file (.wav)
  - The raw STT output (what Whisper produced)
  - The user-corrected text (what the user fixed it to)

Usage:
    python collect_training_data.py \
        --db-path "C:/Users/<you>/AppData/Roaming/dhwani/transcriptions.db" \
        --audio-dir "C:/Users/<you>/AppData/Roaming/dhwani/training_audio" \
        --output ./training_data \
        --min-pairs 50
"""

import argparse
import json
import os
import shutil
import sqlite3
import sys
from datetime import datetime
from pathlib import Path

import soundfile as sf


def get_db_connection(db_path: str) -> sqlite3.Connection:
    """Open a read-only connection to the Dhwani SQLite database."""
    if not os.path.exists(db_path):
        print(f"Error: Database not found at {db_path}")
        sys.exit(1)

    conn = sqlite3.connect(f"file:{db_path}?mode=ro", uri=True)
    conn.row_factory = sqlite3.Row
    return conn


def check_table_exists(conn: sqlite3.Connection, table_name: str) -> bool:
    """Check if a table exists in the database."""
    cursor = conn.execute(
        "SELECT name FROM sqlite_master WHERE type='table' AND name=?",
        (table_name,),
    )
    return cursor.fetchone() is not None


def fetch_correction_pairs(
    conn: sqlite3.Connection,
    min_edit_distance_ratio: float = 0.02,
    max_edit_distance_ratio: float = 0.8,
) -> list[dict]:
    """
    Fetch correction pairs from the database.

    Filters:
    - min_edit_distance_ratio: Skip pairs where the change is too tiny
      (likely just whitespace or punctuation)
    - max_edit_distance_ratio: Skip pairs where the change is too large
      (likely a full rewrite, not a correction)
    """
    if not check_table_exists(conn, "correction_pairs"):
        print("Error: 'correction_pairs' table not found in database.")
        print("Make sure you have enabled voice adaptation data collection in Dhwani settings.")
        sys.exit(1)

    cursor = conn.execute(
        """
        SELECT
            id,
            transcription_id,
            audio_path,
            raw_stt_text,
            corrected_text,
            word_diffs,
            whisper_model,
            audio_duration_ms,
            language,
            created_at
        FROM correction_pairs
        WHERE raw_stt_text IS NOT NULL
          AND corrected_text IS NOT NULL
          AND audio_path IS NOT NULL
        ORDER BY created_at ASC
        """
    )

    pairs = []
    for row in cursor.fetchall():
        raw = row["raw_stt_text"].strip()
        corrected = row["corrected_text"].strip()

        # Skip empty pairs
        if not raw or not corrected:
            continue

        # Skip identical pairs (no actual correction)
        if raw == corrected:
            continue

        # Compute edit distance ratio
        edit_distance = levenshtein_distance(raw, corrected)
        max_len = max(len(raw), len(corrected))
        ratio = edit_distance / max_len if max_len > 0 else 0

        # Filter by edit distance ratio
        if ratio < min_edit_distance_ratio:
            continue  # Change too small (whitespace/punctuation only)
        if ratio > max_edit_distance_ratio:
            continue  # Change too large (full rewrite)

        pairs.append(
            {
                "id": row["id"],
                "transcription_id": row["transcription_id"],
                "audio_path": row["audio_path"],
                "raw_stt_text": raw,
                "corrected_text": corrected,
                "word_diffs": json.loads(row["word_diffs"])
                if row["word_diffs"]
                else [],
                "whisper_model": row["whisper_model"],
                "audio_duration_ms": row["audio_duration_ms"],
                "language": row["language"] or "en",
                "created_at": row["created_at"],
                "edit_distance": edit_distance,
                "edit_ratio": round(ratio, 4),
            }
        )

    return pairs


def fetch_from_transcriptions_fallback(conn: sqlite3.Connection) -> list[dict]:
    """
    Fallback: If the correction_pairs table doesn't exist yet,
    look for transcriptions that have both 'raw_text' and 'text' columns
    where the two differ (indicating the user or LLM made changes).

    This is a less precise data source since we can't distinguish
    user corrections from LLM polish, but it can bootstrap the training.
    """
    cursor = conn.execute(
        """
        SELECT
            id,
            text,
            raw_text,
            has_audio,
            audio_duration_ms,
            provider,
            model,
            created_at
        FROM transcriptions
        WHERE raw_text IS NOT NULL
          AND text IS NOT NULL
          AND raw_text != text
          AND has_audio = 1
        ORDER BY created_at ASC
        """
    )

    pairs = []
    for row in cursor.fetchall():
        raw = (row["raw_text"] or "").strip()
        corrected = (row["text"] or "").strip()

        if not raw or not corrected or raw == corrected:
            continue

        pairs.append(
            {
                "id": row["id"],
                "transcription_id": row["id"],
                "audio_path": None,  # Will need to be resolved
                "raw_stt_text": raw,
                "corrected_text": corrected,
                "word_diffs": [],
                "whisper_model": row["model"],
                "audio_duration_ms": row["audio_duration_ms"],
                "language": "en",
                "created_at": row["created_at"],
                "edit_distance": levenshtein_distance(raw, corrected),
                "edit_ratio": 0.0,
            }
        )

    return pairs


def levenshtein_distance(s1: str, s2: str) -> int:
    """Compute the Levenshtein (edit) distance between two strings."""
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)

    if len(s2) == 0:
        return len(s1)

    previous_row = range(len(s2) + 1)
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def validate_audio_file(audio_path: str, min_duration_s: float = 0.5) -> bool:
    """Check if an audio file exists and meets minimum duration requirements."""
    if not audio_path or not os.path.exists(audio_path):
        return False

    try:
        info = sf.info(audio_path)
        duration = info.duration
        return duration >= min_duration_s
    except Exception:
        return False


def export_training_data(
    pairs: list[dict],
    audio_dir: str,
    output_dir: str,
) -> dict:
    """
    Export correction pairs to a structured directory.

    Returns summary statistics.
    """
    pairs_dir = os.path.join(output_dir, "pairs")
    audio_out_dir = os.path.join(output_dir, "audio")
    os.makedirs(pairs_dir, exist_ok=True)
    os.makedirs(audio_out_dir, exist_ok=True)

    exported = []
    skipped = 0
    total_duration_ms = 0

    for i, pair in enumerate(pairs):
        # Resolve audio path
        audio_path = pair["audio_path"]

        # Try resolving relative to audio_dir
        if audio_path and not os.path.isabs(audio_path):
            audio_path = os.path.join(audio_dir, audio_path)

        # Validate audio
        if not validate_audio_file(audio_path):
            skipped += 1
            continue

        # Copy audio to output directory
        audio_filename = f"{i + 1:04d}.wav"
        dest_audio = os.path.join(audio_out_dir, audio_filename)

        try:
            shutil.copy2(audio_path, dest_audio)
        except (OSError, shutil.Error) as e:
            print(f"  Warning: Could not copy {audio_path}: {e}")
            skipped += 1
            continue

        # Write pair metadata
        pair_data = {
            "index": i + 1,
            "audio_file": f"audio/{audio_filename}",
            "raw_stt_text": pair["raw_stt_text"],
            "corrected_text": pair["corrected_text"],
            "word_diffs": pair["word_diffs"],
            "whisper_model": pair["whisper_model"],
            "audio_duration_ms": pair["audio_duration_ms"],
            "language": pair["language"],
            "edit_distance": pair["edit_distance"],
            "original_created_at": pair["created_at"],
        }

        pair_path = os.path.join(pairs_dir, f"{i + 1:04d}.json")
        with open(pair_path, "w", encoding="utf-8") as f:
            json.dump(pair_data, f, indent=2, ensure_ascii=False)

        exported.append(pair_data)
        total_duration_ms += pair.get("audio_duration_ms", 0) or 0

    # Write manifest
    manifest = {
        "version": "1.0",
        "exported_at": datetime.utcnow().isoformat() + "Z",
        "total_pairs": len(exported),
        "skipped_pairs": skipped,
        "total_audio_duration_ms": total_duration_ms,
        "total_audio_duration_minutes": round(total_duration_ms / 60000, 2),
        "languages": list(set(p["language"] for p in exported)),
        "whisper_models": list(set(p["whisper_model"] for p in exported if p["whisper_model"])),
    }

    with open(os.path.join(output_dir, "manifest.json"), "w") as f:
        json.dump(manifest, f, indent=2)

    # Write stats
    word_corrections = {}
    for pair in exported:
        for diff in pair.get("word_diffs", []):
            key = f"{diff.get('original', '')} → {diff.get('corrected', '')}"
            word_corrections[key] = word_corrections.get(key, 0) + 1

    # Sort by frequency
    top_corrections = sorted(
        word_corrections.items(), key=lambda x: x[1], reverse=True
    )[:50]

    stats = {
        "total_exported": len(exported),
        "total_skipped": skipped,
        "total_audio_minutes": round(total_duration_ms / 60000, 2),
        "avg_edit_distance": round(
            sum(p["edit_distance"] for p in exported) / max(len(exported), 1), 2
        ),
        "top_corrections": [
            {"correction": k, "count": v} for k, v in top_corrections
        ],
    }

    with open(os.path.join(output_dir, "stats.json"), "w") as f:
        json.dump(stats, f, indent=2)

    return manifest


def main():
    parser = argparse.ArgumentParser(
        description="Export Dhwani correction pairs for LoRA training"
    )
    parser.add_argument(
        "--db-path",
        required=True,
        help="Path to Dhwani's SQLite database (transcriptions.db)",
    )
    parser.add_argument(
        "--audio-dir",
        default="",
        help="Directory where Dhwani stores training audio files",
    )
    parser.add_argument(
        "--output",
        default="./training_data",
        help="Output directory for exported training data",
    )
    parser.add_argument(
        "--min-pairs",
        type=int,
        default=50,
        help="Minimum number of correction pairs required (default: 50)",
    )
    parser.add_argument(
        "--fallback",
        action="store_true",
        help="Use transcriptions table as fallback if correction_pairs doesn't exist",
    )
    args = parser.parse_args()

    print("=" * 60)
    print("  Dhwani LoRA Training Data Collector")
    print("=" * 60)
    print(f"\n  Database:   {args.db_path}")
    print(f"  Audio Dir:  {args.audio_dir or '(auto-detect)'}")
    print(f"  Output:     {args.output}")
    print(f"  Min Pairs:  {args.min_pairs}")
    print()

    # Connect to database
    conn = get_db_connection(args.db_path)

    # Fetch correction pairs
    if check_table_exists(conn, "correction_pairs"):
        print("  Found 'correction_pairs' table. Fetching data...")
        pairs = fetch_correction_pairs(conn)
    elif args.fallback:
        print("  'correction_pairs' table not found. Using fallback (transcriptions)...")
        pairs = fetch_from_transcriptions_fallback(conn)
    else:
        print("  Error: 'correction_pairs' table not found.")
        print("  Use --fallback to use the transcriptions table instead.")
        sys.exit(1)

    conn.close()

    print(f"  Found {len(pairs)} valid correction pairs.")

    if len(pairs) < args.min_pairs:
        print(
            f"\n  ⚠ Not enough data! Need at least {args.min_pairs} pairs, "
            f"but found only {len(pairs)}."
        )
        print("  Keep using Dhwani and correcting mistakes to collect more data.")
        sys.exit(1)

    # Resolve audio directory
    audio_dir = args.audio_dir
    if not audio_dir:
        # Try to auto-detect from the first pair's audio path
        first_audio = pairs[0].get("audio_path", "")
        if first_audio and os.path.isabs(first_audio):
            audio_dir = os.path.dirname(first_audio)
        else:
            audio_dir = "."

    # Export
    print(f"\n  Exporting to {args.output}...")
    os.makedirs(args.output, exist_ok=True)

    manifest = export_training_data(pairs, audio_dir, args.output)

    print(f"\n  ✓ Export complete!")
    print(f"    Total pairs:    {manifest['total_pairs']}")
    print(f"    Skipped:        {manifest['skipped_pairs']}")
    print(f"    Audio duration: {manifest['total_audio_duration_minutes']} minutes")
    print(f"    Languages:      {', '.join(manifest['languages'])}")
    print(f"\n  Output: {os.path.abspath(args.output)}")
    print()


if __name__ == "__main__":
    main()
