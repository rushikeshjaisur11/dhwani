/**
 * Export dictation history as a HuggingFace-style dataset for STT fine-tuning.
 *
 * Joins transcriptions DB rows (raw_text = STT output, text = cleaned/edited)
 * to retained audio files and writes <out>/manifest.jsonl + <out>/audio/*.webm.
 *
 * better-sqlite3 is compiled for Electron's ABI, so run via:
 *   npm run export:dataset
 *   (= cross-env ELECTRON_RUN_AS_NODE=1 electron scripts/export-dataset.js)
 *
 * Options:
 *   --out <dir>       output directory (default: dataset)
 *   --userdata <dir>  app userData dir (default: auto-detect in %APPDATA%)
 */
const fs = require("fs");
const path = require("path");

const USERDATA_CANDIDATES = [
  "dhwani",
  "Dhwani",
  "Dhwani-development",
  "open-whispr",
  "OpenWhispr",
  "OpenWhispr-development",
];
const DB_FILENAMES = ["transcriptions.db", "transcriptions-dev.db"];

function findAudioFile(files, id) {
  const bare = `${id}.webm`;
  const suffix = `-${id}.webm`;
  return files.find((f) => f === bare || f.endsWith(suffix)) || null;
}

function buildManifestRow(row, audioRelPath) {
  const text = row.text || row.raw_text || "";
  return {
    audio_filepath: audioRelPath,
    text,
    raw_text: row.raw_text || text,
    duration_ms: row.audio_duration_ms ?? null,
    model: row.model ?? null,
    provider: row.provider ?? null,
    timestamp: row.timestamp,
    id: row.id,
  };
}

function resolveUserDataDir(override) {
  if (override) return override;
  const appData = process.env.APPDATA;
  for (const name of USERDATA_CANDIDATES) {
    const dir = path.join(appData, name);
    if (DB_FILENAMES.some((f) => fs.existsSync(path.join(dir, f)))) return dir;
  }
  throw new Error(
    `No transcriptions DB found under ${appData} (tried: ${USERDATA_CANDIDATES.join(", ")}). Use --userdata <dir>.`
  );
}

function parseArgs(argv) {
  const args = { out: "dataset", userdata: null };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--out" && argv[i + 1]) args.out = argv[++i];
    if (argv[i] === "--userdata" && argv[i + 1]) args.userdata = argv[++i];
  }
  return args;
}

function main() {
  const Database = require("better-sqlite3");
  const args = parseArgs(process.argv.slice(2));
  const userData = resolveUserDataDir(args.userdata);
  const audioDir = path.join(userData, "audio");
  const audioFiles = fs.existsSync(audioDir) ? fs.readdirSync(audioDir) : [];

  const outDir = path.resolve(args.out);
  const outAudioDir = path.join(outDir, "audio");
  fs.mkdirSync(outAudioDir, { recursive: true });

  const manifestLines = [];
  let skippedNoFile = 0;
  let totalDurationMs = 0;

  for (const dbFile of DB_FILENAMES) {
    const dbPath = path.join(userData, dbFile);
    if (!fs.existsSync(dbPath)) continue;

    const db = new Database(dbPath, { readonly: true });
    const rows = db
      .prepare(
        "SELECT id, text, raw_text, timestamp, audio_duration_ms, model, provider FROM transcriptions WHERE has_audio = 1 AND status = 'completed' ORDER BY id"
      )
      .all();
    db.close();

    for (const row of rows) {
      const srcName = findAudioFile(audioFiles, row.id);
      if (!srcName) {
        skippedNoFile++;
        continue;
      }
      const destName = `${row.id}.webm`;
      fs.copyFileSync(path.join(audioDir, srcName), path.join(outAudioDir, destName));
      manifestLines.push(JSON.stringify(buildManifestRow(row, `audio/${destName}`)));
      totalDurationMs += row.audio_duration_ms || 0;
    }
  }

  fs.writeFileSync(path.join(outDir, "manifest.jsonl"), manifestLines.join("\n") + "\n");

  console.log(`Exported ${manifestLines.length} samples to ${outDir}`);
  console.log(`Total audio: ${(totalDurationMs / 3600000).toFixed(2)} hours`);
  if (skippedNoFile) {
    console.log(`Skipped ${skippedNoFile} rows whose audio was already deleted by retention.`);
  }
}

if (require.main === module) main();

module.exports = { findAudioFile, buildManifestRow, resolveUserDataDir, parseArgs };
