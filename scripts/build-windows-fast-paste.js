#!/usr/bin/env node
/**
 * Ensures the Windows fast-paste binary is available.
 * Downloads a prebuilt binary from GitHub releases first, falls back to
 * local compilation if download fails.
 */

const { ensureWindowsBinary } = require("./lib/ensure-windows-binary");

ensureWindowsBinary({
  name: "windows-fast-paste",
  order: "download-first",
  msvcLibs: ["user32.lib"],
  gnuLibs: ["-luser32"],
  fallbackMessage: "Windows paste will use nircmd/PowerShell fallback.",
}).catch((error) => {
  console.error("[windows-fast-paste] Unexpected error:", error);
  // Don't fail the build
});
