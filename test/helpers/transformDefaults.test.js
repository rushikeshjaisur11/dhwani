const test = require("node:test");
const assert = require("node:assert/strict");

// Requires Node's native TypeScript type-stripping (Node >= 22.6 with
// --experimental-strip-types, on by default in Node 23.6+/24). CI runs Node 24.

test("mergeTransforms concatenates defaults and user customs, defaults never removed", async () => {
  const { mergeTransforms } = await import(
    "../../src/config/transforms/loadEffectiveTransforms.ts"
  );

  const defaults = [
    { id: "builtin-polish", name: "Polish", prompt: "polish prompt", builtin: true },
    { id: "builtin-prompt-engineer", name: "Prompt Engineer", prompt: "pe prompt", builtin: true },
  ];
  const customs = [{ id: "custom-1", name: "My Transform", prompt: "custom prompt", builtin: false }];

  assert.deepEqual(mergeTransforms(defaults, customs), [...defaults, ...customs]);
});

test("migrateLegacyCustoms assigns ids to pre-existing {name, prompt} rows", async () => {
  const { migrateLegacyCustoms } = await import(
    "../../src/config/transforms/loadEffectiveTransforms.ts"
  );

  const legacy = [{ name: "Old Custom", prompt: "old prompt" }];
  const migrated = migrateLegacyCustoms(legacy);

  assert.equal(migrated.length, 1);
  assert.equal(migrated[0].name, "Old Custom");
  assert.equal(migrated[0].prompt, "old prompt");
  assert.equal(migrated[0].builtin, false);
  assert.equal(typeof migrated[0].id, "string");
  assert.ok(migrated[0].id.length > 0);
});

test("migrateLegacyCustoms drops malformed rows and non-array input", async () => {
  const { migrateLegacyCustoms } = await import(
    "../../src/config/transforms/loadEffectiveTransforms.ts"
  );

  assert.deepEqual(migrateLegacyCustoms(null), []);
  assert.deepEqual(migrateLegacyCustoms([{ name: "no prompt" }, { prompt: "no name" }, 42]), []);
});

test("validateDefaultsPayload rejects malformed remote/cache payloads", async () => {
  const { validateDefaultsPayload } = await import(
    "../../src/config/transforms/loadEffectiveTransforms.ts"
  );

  assert.equal(validateDefaultsPayload(null), null);
  assert.equal(validateDefaultsPayload({ version: 1 }), null);
  assert.equal(validateDefaultsPayload({ version: "1", items: [] }), null);
  assert.equal(
    validateDefaultsPayload({ version: 1, items: [{ id: "x" }] }),
    null
  );

  const valid = validateDefaultsPayload({
    version: 2,
    items: [{ id: "a", name: "A", prompt: "p" }],
  });
  assert.deepEqual(valid, { version: 2, items: [{ id: "a", name: "A", prompt: "p" }] });
});
