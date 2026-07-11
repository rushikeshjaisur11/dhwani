# Rebranding: OpenWhispr → Dhwani

Renamed (user-visible): product name, appId (`com.rushikesh.dhwani`), package name
(`dhwani`, version reset to 0.1.0), window/HTML titles, all i18n strings across 10
locales, component copy, alt/aria labels, permission dialog text, default agent name,
GNOME/KDE shortcut display names, macOS usage descriptions, audio filename prefix,
download User-Agent, keychain service name, update feed + publish repo
(`rushikeshjaisur11/dhwani`).

Deliberately KEPT as OpenWhispr identifiers (do not rename):

| Identifier | Why |
|---|---|
| `com.openwhispr.App` D-Bus service, `/com/openwhispr/App` paths, gsettings paths | Linux hotkey plumbing; renaming gains nothing, costs upstream merges |
| `~/.cache/openwhispr/*`, `~/.openwhispr/*` | Existing model downloads keep working; upstream compatibility |
| `OPENWHISPR_*` / `VITE_OPENWHISPR_*` env vars | Referenced across scripts, CI, and upstream docs |
| `openwhispr.com` URLs (auth, docs, cloud API) | Upstream services; our product is local-first and does not replace them |
| `openwhispr://` protocol scheme | Tied to upstream auth redirect flows |
| `"openwhispr"` enum/mode values, event names, localStorage keys, i18n keys | Internal identifiers, never rendered |
| "OpenWhispr Cloud" in comments/errors about the upstream hosted service | Proper noun for their service, not our brand |
| `OpenWhispr/openwhispr` + `OpenWhispr/whisper.cpp` GitHub repos in download scripts | Prebuilt binaries genuinely come from upstream releases |
| npm script names, binary names, GitHub workflow files | Build plumbing, not user-visible |

Guard: `node scripts/check-brand.js`. New user-visible "OpenWhispr" strings fail the
check; new internal identifiers extend `ALLOWED_PATTERNS` with a justification
comment.

Note: renaming the keychain service (`secretCrypto.js`) means API keys saved under
the OpenWhispr service name are not readable by Dhwani — re-enter them in Settings.
Not an issue for fresh installs.
