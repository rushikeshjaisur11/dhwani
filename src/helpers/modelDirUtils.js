const { app } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");

let migrationChecked = false;

// One-time migration: carry over an existing ~/.cache/openwhispr (models,
// qdrant data, embeddings) to ~/.cache/dhwani so renaming this directory
// doesn't force re-downloading everything.
function migrateLegacyCacheDir(homeDir) {
  if (migrationChecked) return;
  migrationChecked = true;
  try {
    const legacyDir = path.join(homeDir, ".cache", "openwhispr");
    const newDir = path.join(homeDir, ".cache", "dhwani");
    if (fs.existsSync(legacyDir) && !fs.existsSync(newDir)) {
      fs.renameSync(legacyDir, newDir);
    }
  } catch {
    // best-effort — falls through to fresh downloads at newDir
  }
}

function getCacheRoot() {
  // app.getPath() can hang or throw before app.whenReady() in Electron 36+ —
  // fall back to os.homedir() (same value on desktop) until the app is ready.
  const homeDir = app?.isReady?.() ? app.getPath("home") : os.homedir();
  migrateLegacyCacheDir(homeDir);
  return path.join(homeDir, ".cache", "dhwani");
}

function getModelsDirForService(service) {
  return path.join(getCacheRoot(), `${service}-models`);
}

module.exports = { getCacheRoot, getModelsDirForService };
