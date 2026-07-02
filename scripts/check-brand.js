// Fails if "OpenWhispr" appears in renderable UI sources outside the allowlist.
// Internal identifiers (D-Bus, cache dirs, env vars, upstream URLs, enum values,
// event names, i18n keys) are exempt by pattern, not by file, so new violations
// in any file still get caught.
const { execSync } = require("child_process");

const ALLOWED_PATTERNS = [
  /openwhispr\.com/i, // upstream service URLs (auth, docs, API)
  /com\.openwhispr/, // D-Bus / gsettings identifiers
  /\.cache[\\/]+openwhispr/, // model/cache directories
  /USERPROFILE.*openwhispr/, // cache dir shown in settings (real path on disk)
  /\.openwhispr/, // config dir fragments (~/.openwhispr)
  /OPENWHISPR_[A-Z_]+/, // env var names
  /VITE_OPENWHISPR/, // env var names
  /OpenWhispr\/openwhispr/i, // upstream GitHub repo references (binary downloads)
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
  /com\/openwhispr/, // D-Bus object paths (Linux)
  /custom-keybindings\/openwhispr/, // gsettings paths (Linux)
  /openwhispr-binds/, // hyprland conf filename (Linux)
];

const out = execSync(
  'git grep -Iin "openwhispr" -- src/ docs/ *.json *.html ":(exclude)docs/superpowers" ":(exclude)docs/network-allowlist.md" || exit 0',
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
