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

// Polish isn't a real transform-pipeline entry — it's a UI mirror of the
// pre-existing Settings Polish feature (same "polish" hotkey slot, same
// settings, same usePolish.js execution), so users don't end up with two
// separately-configured "Polish" hotkeys. Never registered via
// registerTransformHotkey/syncTransformHotkeys.
export const BUILTIN_POLISH_ID = "builtin-polish";

export const DEFAULTS_VERSION = 1;

export const BUNDLED_DEFAULTS: Transform[] = [
  {
    id: BUILTIN_POLISH_ID,
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
const BUILTIN_OVERRIDES_KEY = "builtinTransformOverrides";
const REFRESH_INTERVAL_MS = 24 * 60 * 60 * 1000; // once/day

// User customizations of builtin transforms (detail pages): shortcut and/or
// prompt. Stored separately from customs so defaults refresh cleanly.
export interface BuiltinOverride {
  shortcut?: string;
  prompt?: string;
}

export function loadBuiltinOverrides(): Record<string, BuiltinOverride> {
  try {
    const parsed = JSON.parse(localStorage.getItem(BUILTIN_OVERRIDES_KEY) || "{}");
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function saveBuiltinOverride(id: string, override: BuiltinOverride | null) {
  const all = loadBuiltinOverrides();
  if (override && Object.keys(override).length > 0) {
    all[id] = override;
  } else {
    delete all[id];
  }
  localStorage.setItem(BUILTIN_OVERRIDES_KEY, JSON.stringify(all));
}

export function applyBuiltinOverrides(defaults: Transform[]): Transform[] {
  const overrides = loadBuiltinOverrides();
  return defaults.map((d) => (overrides[d.id] ? { ...d, ...overrides[d.id] } : d));
}

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

// Effective list = defaults ++ customs. Defaults are never removable; their
// shortcut/prompt can be overridden via builtinTransformOverrides (callers
// apply applyBuiltinOverrides before merging). Pure so it's unit-testable.
export function mergeTransforms(defaults: Transform[], customs: Transform[]): Transform[] {
  return [...defaults, ...customs];
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

// Synchronous variant for callers that can't await a network fetch (e.g. a
// global-hotkey handler that must respond immediately). Uses whatever
// defaults are already cached/bundled — never triggers a fetch itself.
export function getEffectiveTransformsSync(): Transform[] {
  const cache = readCache();
  const defaults = cache?.items ?? BUNDLED_DEFAULTS;
  return mergeTransforms(applyBuiltinOverrides(defaults), loadCustoms());
}
