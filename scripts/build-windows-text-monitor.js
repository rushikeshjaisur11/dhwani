#!/usr/bin/env node
/**
 * Ensures the Windows text monitor binary is available.
 * Downloads a prebuilt binary from GitHub releases first, falls back to
 * local compilation if download fails.
 */

const { ensureWindowsBinary } = require("./lib/ensure-windows-binary");

ensureWindowsBinary({
  name: "windows-text-monitor",
  order: "download-first",
  msvcLibs: ["ole32.lib", "oleaut32.lib"],
  gnuLibs: ["-lole32", "-loleaut32", "-luuid"],
  fallbackMessage: "Auto-learn correction monitoring will be disabled on Windows.",
}).catch((error) => {
  console.error("[windows-text-monitor] Unexpected error:", error);
  // Don't fail the build
});
