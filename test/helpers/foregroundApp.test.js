const { test } = require("node:test");
const assert = require("node:assert");
const { parseForegroundOutput } = require("../../src/helpers/foregroundApp");

test("parses process name and window title", () => {
  const result = parseForegroundOutput("Code\tsettings.json - dhwani - Visual Studio Code");
  assert.deepStrictEqual(result, {
    app: "Code",
    title: "settings.json - dhwani - Visual Studio Code",
  });
});

test("title may contain tabs - only first tab splits", () => {
  const result = parseForegroundOutput("chrome\tA\tB");
  assert.deepStrictEqual(result, { app: "chrome", title: "A\tB" });
});

test("returns null for own process (electron dev)", () => {
  assert.strictEqual(parseForegroundOutput("electron\tDhwani"), null);
});

test("returns null for own process (packaged)", () => {
  assert.strictEqual(parseForegroundOutput("Dhwani\tDhwani"), null);
});

test("returns null on empty or malformed output", () => {
  assert.strictEqual(parseForegroundOutput(""), null);
  assert.strictEqual(parseForegroundOutput("\t"), null);
  assert.strictEqual(parseForegroundOutput("justonefield"), null);
});
