#!/usr/bin/env node
/**
 * Ensures the Windows copy helper binary is available.
 * Compiles locally first, and never downloads since there is no prebuilt.
 */

const { ensureWindowsBinary } = require("./lib/ensure-windows-binary");

ensureWindowsBinary({
  name: "windows-copy-selection",
  order: "compile-first",
  msvcLibs: ["user32.lib"],
  gnuLibs: ["-luser32"],
  noDownloadFallback: true,
  fallbackMessage: "Windows copy will use PowerShell fallback.",
}).catch((error) => {
  console.error("[windows-copy-selection] Unexpected error:", error);
});
