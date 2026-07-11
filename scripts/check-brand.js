// Fails if "OpenWhispr" appears in renderable UI sources outside the allowlist.
// Internal identifiers (D-Bus, cache dirs, env vars, upstream URLs, enum values,
// event names, i18n keys) are exempt by pattern, not by file, so new violations
// in any file still get caught.
const { execSync } = require("child_process");

// Trimmed 2026-07-11 during the OpenWhispr→Dhwani purge: removed entries for
// D-Bus/gsettings identifiers, cache/config directories, the CLI bridge path,
// and OPENWHISPR_LOG_LEVEL — all renamed to Dhwani with migrations (see
// CLAUDE.md "Kept OpenWhispr references"). What's left below is genuinely
// still upstream: OpenWhispr's real hosted services and binary release repos
// this fork doesn't own, plus the "OpenWhispr Cloud" feature's internal
// identifiers (kept — it's a real, if currently unreachable, feature).
const ALLOWED_PATTERNS = [
  /openwhispr\.com/i, // upstream service URLs (auth, API) — real, unowned by this fork
  /VITE_OPENWHISPR_API_URL|VITE_OPENWHISPR_OAUTH_CALLBACK_URL|OPENWHISPR_API_URL/, // upstream cloud env vars/const
  /OPENWHISPR_(OPENAI|TRANSCRIPTION)_BASE_URL/, // legacy fallback env vars (see DHWANI_* primary)
  /OPENWHISPR_LOG_LEVEL/, // legacy fallback env var (see DHWANI_LOG_LEVEL primary)
  /OPENWHISPR_DEV_SERVER_PORT/, // legacy fallback env var (see DHWANI_DEV_SERVER_PORT primary)
  /OPENWHISPR_(START|SUCCESS)/, // internal log event tags in the kept openwhispr.ts provider
  /programs\.openwhispr|install OpenWhispr from the flake/, // upstream Nix flake's real module name
  /One-time migration: carry over an existing/, // modelDirUtils.js migration comment
  /OpenWhispr\/openwhispr/i, // upstream GitHub repo (prebuilt binary downloads)
  /open-whispr/, // legacy package identifier references
  /"schemes": \["openwhispr"\]/, // deep-link protocol (tied to upstream auth redirects)
  /CFBundleIconName/, // macOS icon asset name
  /certificateProfileName|codeSigningAccountName/, // upstream signing config (unused by us)
  /["'`]openwhispr["'`]/, // internal enum/mode values (cloudTranscriptionMode etc.)
  /["'`]openwhispr[.-]/, // namespaced event names / localStorage keys
  /@openwhispr\//, // upstream npm CLI package (real, published by upstream)
  /openwhispr (auth|--local)/, // upstream CLI usage examples
  /utm_campaign=openwhispr/, // partner referral URL
  /openwhispr[A-Za-z]*["']?\s*[:\]]/, // i18n keys and object keys (modes.openwhispr, openwhisprDesc)
  /[a-zA-Z]OpenWhispr|OpenWhispr[A-Z]/, // camelCase code identifiers (isOpenWhisprCloud)
  /modes\.openwhispr|\.openwhisprCloud|openwhisprDesc/, // i18n key paths in t() calls
  /OpenWhispr [Cc]loud/, // upstream's hosted service — a proper noun, not our brand
  /OpenWhispr\/whisper\.cpp/, // upstream's whisper.cpp binary release repo
  /x-openwhispr/, // upstream API request header
  /openwhisprProvider|\.\/openwhispr["']/, // internal provider module/id
  /Cloud \(OpenWhispr\)|OpenWhispr plan/, // comments about upstream cloud plans
  /OpenWhispr API URL/, // error naming the upstream cloud env var's URL
  /openwhispr-api/, // upstream backend repo reference in sync comments
  /nixosModules/, // upstream Nix flake module instructions
  /OpenWhispr\]\(https:\/\/github\.com\/OpenWhispr/, // CLAUDE.md fork-origin link
  /"Kept OpenWhispr references"/, // CLAUDE.md section title/self-reference
];

const out = execSync(
  'git grep -Iin "openwhispr" -- src/ docs/ *.json *.html ":(exclude)docs/superpowers" ":(exclude)docs/network-allowlist.md" ":(exclude)docs/REBRANDING.md" || exit 0',
  { encoding: "utf8" }
);

const violations = out
  .split("\n")
  .filter(Boolean)
  .filter((line) => {
    if (line.startsWith("package-lock.json")) return false;
    return !ALLOWED_PATTERNS.some((p) => p.test(line));
  });

if (violations.length) {
  console.error("Brand violations (rename to Dhwani or allowlist):");
  violations.forEach((v) => console.error("  " + v));
  process.exit(1);
}
console.log("brand check ok");
