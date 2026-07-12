#!/usr/bin/env node
/**
 * Ensures the Windows key listener binary is available.
 * Compiles locally first (so source changes are picked up), falls back to
 * downloading a prebuilt binary from GitHub releases.
 */

const { ensureWindowsBinary } = require("./lib/ensure-windows-binary");

ensureWindowsBinary({
  name: "windows-key-listener",
  order: "compile-first",
  msvcLibs: ["user32.lib"],
  gnuLibs: ["-luser32"],
  fallbackMessage: "Push-to-Talk on Windows will use fallback mode.",
}).catch((error) => {
  console.error("[windows-key-listener] Unexpected error:", error);
  // Don't fail the build
});
