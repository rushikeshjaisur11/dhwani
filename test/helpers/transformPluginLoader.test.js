const { test } = require("node:test");
const assert = require("node:assert");
const fs = require("fs");
const os = require("os");
const path = require("path");

const { loadPlugins, exportPlugin } = require("../../src/helpers/transformPluginLoader");

test("export/load roundtrip, invalid files skipped", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dhwani-plugins-"));
  try {
    const transform = {
      id: "custom-123",
      name: "Shoutify",
      prompt: "Rewrite in all caps.",
      shortcut: "Control+Alt+S",
    };
    const file = exportPlugin(transform, dir);
    assert.ok(file.endsWith("custom-123.json"));

    fs.writeFileSync(path.join(dir, "broken.json"), "{not json");
    fs.writeFileSync(path.join(dir, "missing-fields.json"), JSON.stringify({ name: "x" }));
    fs.writeFileSync(path.join(dir, "readme.txt"), "ignored");

    const plugins = loadPlugins(dir);
    assert.strictEqual(plugins.length, 1);
    assert.deepStrictEqual(plugins[0], { ...transform, plugin: true });

    assert.throws(() => exportPlugin({ id: "x" }, dir), /Invalid transform/);
    assert.deepStrictEqual(loadPlugins(path.join(dir, "does-not-exist")), []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
