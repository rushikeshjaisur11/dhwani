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
  // The prebuilt download comes from upstream OpenWhispr and lacks Dhwani's
  // Win+Alt+<digit> shell-override logic (windows-key-listener.c) — shipping
  // it would silently break those hotkeys, so never fall back to it.
  noDownloadFallback: true,
  fallbackMessage: "Push-to-Talk and Win+Alt+<digit> overrides on Windows will use fallback mode.",
}).catch((error) => {
  console.error("[windows-key-listener] Unexpected error:", error);
  // Don't fail the build
});
