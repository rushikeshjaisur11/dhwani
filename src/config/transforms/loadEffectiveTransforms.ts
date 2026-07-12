// Pure merge/validation logic for Transforms defaults, kept separate from
// TransformsView so it can be unit tested without React. Also holds the
// bundled fallback seed — kept in this file (not a separate defaults.ts)
// because Node's native TS type-stripping (used by test/helpers/*.test.js)
// can't resolve extensionless cross-file relative imports.
// TRANSFORMS_DEFAULTS_URL (src/config/constants.ts) is the remote override
// that lets these defaults update without an app release.

export interface Transform {
  id: string;
  name: string;
  prompt: string;
  shortcut?: string;
  builtin?: boolean;
}

export const DEFAULTS_VERSION = 1;

export const BUNDLED_DEFAULTS: Transform[] = [
  {
    id: "builtin-polish",
    name: "Polish",
    prompt:
      "Rewrite the text to sound clearer and more polished, in the author's own voice. Make it more concise, improve clarity and flow, and preserve the original tone. Do not add new information.",
    shortcut: "Win+Alt+1",
    builtin: true,
  },
  {
    id: "builtin-prompt-engineer",
    name: "Prompt Engineer",
    prompt:
      "Take the messy, spoken, unstructured text and convert it into a clean, optimized AI prompt with sections for Title, Role & stance, Task, Context, and Inputs available, as appropriate to the content.",
    shortcut: "Win+Alt+2",
    builtin: true,
  },
];

const CACHE_KEY = "transformDefaultsCache";
const CUSTOMS_KEY = "customTransforms";
const HIDDEN_KEY = "hiddenTransformDefaults";
// User-assigned shortcut overrides for builtin/default transforms, keyed by
// id. Customs store their shortcut directly on the object (fully
// user-owned), but defaults come from the bundled/remote source, so a
// remote refresh must not clobber a user's own remap — kept as a separate
// override layer instead.
const SHORTCUT_OVERRIDES_KEY = "transformShortcutOverrides";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // once/day

interface DefaultsCache {
  version: number;
  fetchedAt: number;
  items: Transform[];
}

function isValidTransform(value: unknown): value is Transform {
  if (!value || typeof value !== "object") return false;
  const t = value as Record<string, unknown>;
  return typeof t.id === "string" && typeof t.name === "string" && typeof t.prompt === "string";
}

// Validates untrusted remote/cached JSON before it's ever used to seed UI
// state or register a hotkey.
export function validateDefaultsPayload(payload: unknown): { version: number; items: Transform[] } | null {
  if (!payload || typeof payload !== "object") return null;
  const p = payload as Record<string, unknown>;
  if (typeof p.version !== "number" || !Array.isArray(p.items)) return null;
  const items = p.items.filter(isValidTransform).slice(0, 50); // sanity cap
  if (items.length === 0) return null;
  return { version: p.version, items };
}

// Migrates legacy {name, prompt} rows (pre-id schema) to the current shape.
export function migrateLegacyCustoms(raw: unknown): Transform[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((row) => row && typeof row === "object" && typeof row.name === "string" && typeof row.prompt === "string")
    .map((row) => ({
      id: typeof row.id === "string" ? row.id : `custom-${row.name}`,
      name: row.name,
      prompt: row.prompt,
      builtin: false,
    }));
}

// Effective list = (defaults - hidden, with shortcut overrides applied) ++
// customs. Pure so it's unit-testable.
export function mergeTransforms(
  defaults: Transform[],
  hiddenDefaultIds: string[],
  customs: Transform[],
  shortcutOverrides: Record<string, string> = {}
): Transform[] {
  const visibleDefaults = defaults
    .filter((d) => !hiddenDefaultIds.includes(d.id))
    .map((d) =>
      Object.prototype.hasOwnProperty.call(shortcutOverrides, d.id)
        ? { ...d, shortcut: shortcutOverrides[d.id] || undefined }
        : d
    );
  return [...visibleDefaults, ...customs];
}

function readCache(): DefaultsCache | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const validated = validateDefaultsPayload(parsed);
    if (!validated) return null;
    return { ...validated, fetchedAt: parsed.fetchedAt ?? 0 };
  } catch {
    return null;
  }
}

function writeCache(cache: DefaultsCache) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
  } catch {
    // best-effort; ignore quota/serialization errors
  }
}

// Resolves the effective defaults array: bundled, refreshed at most once/day
// from TRANSFORMS_DEFAULTS_URL, falling back to cache then bundled on any
// fetch/validation failure.
export async function resolveDefaults(remoteUrl: string): Promise<Transform[]> {
  const cache = readCache();
  const isFresh = cache && Date.now() - cache.fetchedAt < REFRESH_INTERVAL_MS;
  if (isFresh) return cache!.items;

  try {
    const res = await fetch(remoteUrl);
    if (!res.ok) throw new Error(`status ${res.status}`);
    const validated = validateDefaultsPayload(await res.json());
    if (!validated) throw new Error("invalid payload");
    writeCache({ ...validated, fetchedAt: Date.now() });
    return validated.items;
  } catch {
    if (cache) return cache.items;
    return BUNDLED_DEFAULTS;
  }
}

export function loadCustoms(): Transform[] {
  try {
    const raw = localStorage.getItem(CUSTOMS_KEY);
    return migrateLegacyCustoms(raw ? JSON.parse(raw) : []);
  } catch {
    return [];
  }
}

export function saveCustoms(customs: Transform[]) {
  localStorage.setItem(CUSTOMS_KEY, JSON.stringify(customs));
}

export function loadHiddenDefaultIds(): string[] {
  try {
    const raw = localStorage.getItem(HIDDEN_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((id) => typeof id === "string") : [];
  } catch {
    return [];
  }
}

export function saveHiddenDefaultIds(ids: string[]) {
  localStorage.setItem(HIDDEN_KEY, JSON.stringify(ids));
}

export function clearHiddenDefaultIds() {
  localStorage.removeItem(HIDDEN_KEY);
}

export function loadShortcutOverrides(): Record<string, string> {
  try {
    const raw = localStorage.getItem(SHORTCUT_OVERRIDES_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== "object") return {};
    const result: Record<string, string> = {};
    for (const [id, hotkey] of Object.entries(parsed)) {
      if (typeof hotkey === "string") result[id] = hotkey;
    }
    return result;
  } catch {
    return {};
  }
}

export function saveShortcutOverrides(overrides: Record<string, string>) {
  localStorage.setItem(SHORTCUT_OVERRIDES_KEY, JSON.stringify(overrides));
}

// Synchronous variant for callers that can't await a network fetch (e.g. a
// global-hotkey handler that must respond immediately). Uses whatever
// defaults are already cached/bundled — never triggers a fetch itself.
export function getEffectiveTransformsSync(): Transform[] {
  const cache = readCache();
  const defaults = cache?.items ?? BUNDLED_DEFAULTS;
  return mergeTransforms(defaults, loadHiddenDefaultIds(), loadCustoms(), loadShortcutOverrides());
}
