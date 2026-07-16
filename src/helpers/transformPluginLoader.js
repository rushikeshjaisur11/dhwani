const fs = require("fs");
const path = require("path");
const os = require("os");
const debugLogger = require("./debugLogger");

// File-based transforms: one JSON file per transform in ~/.dhwani/transforms/
// (same convention as ~/.dhwani/cli-bridge.json). Shape matches the renderer's
// Transform type: { id, name, prompt, shortcut? }. The renderer pulls these
// via get-transform-plugins, merges them into the effective transform list,
// and registers their hotkeys through the existing sync-transform-hotkeys
// pipeline — this is a second entry point into that pipeline, not a new one.
const PLUGINS_DIR = path.join(os.homedir(), ".dhwani", "transforms");
const MAX_PLUGINS = 50;

// Trust boundary: hand-written/shared files on disk.
function isValidPlugin(t) {
  return (
    t &&
    typeof t === "object" &&
    typeof t.id === "string" &&
    typeof t.name === "string" &&
    typeof t.prompt === "string"
  );
}

function loadPlugins(dir = PLUGINS_DIR) {
  let files;
  try {
    files = fs.readdirSync(dir);
  } catch {
    return []; // dir doesn't exist until first export/manual drop
  }
  const plugins = [];
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const parsed = JSON.parse(fs.readFileSync(path.join(dir, file), "utf8"));
      if (!isValidPlugin(parsed)) {
        debugLogger.warn(`[TransformPlugins] Skipping invalid plugin file: ${file}`);
        continue;
      }
      plugins.push({
        id: parsed.id,
        name: parsed.name,
        prompt: parsed.prompt,
        ...(typeof parsed.shortcut === "string" && parsed.shortcut
          ? { shortcut: parsed.shortcut }
          : {}),
        plugin: true,
      });
    } catch (err) {
      debugLogger.warn(`[TransformPlugins] Failed to read ${file}: ${err.message}`);
    }
  }
  return plugins.slice(0, MAX_PLUGINS);
}

function exportPlugin(transform, dir = PLUGINS_DIR) {
  if (!isValidPlugin(transform)) throw new Error("Invalid transform");
  fs.mkdirSync(dir, { recursive: true });
  const safeName = transform.id.replace(/[^a-zA-Z0-9_-]/g, "_");
  const filePath = path.join(dir, `${safeName}.json`);
  const { id, name, prompt, shortcut } = transform;
  fs.writeFileSync(filePath, JSON.stringify({ id, name, prompt, shortcut }, null, 2));
  return filePath;
}

module.exports = { PLUGINS_DIR, loadPlugins, exportPlugin };
