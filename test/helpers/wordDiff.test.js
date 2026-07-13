const test = require("node:test");
const assert = require("node:assert/strict");

// Requires Node's native TypeScript type-stripping (Node >= 22.6 with
// --experimental-strip-types, on by default in Node 23.6+/24). CI runs Node 24.

const load = () => import("../../src/utils/wordDiff.ts");

test("identical texts produce one same op and zero changes", async () => {
  const { wordDiff } = await load();
  const { ops, changeCount } = wordDiff("hello world", "hello world");
  assert.deepEqual(ops, [{ type: "same", text: "hello world" }]);
  assert.equal(changeCount, 0);
});

test("word replacement yields adjacent del+ins counted as one change", async () => {
  const { wordDiff } = await load();
  const { ops, changeCount } = wordDiff("who are you", "Who are you?");
  assert.deepEqual(ops, [
    { type: "del", text: "who" },
    { type: "ins", text: "Who" },
    { type: "same", text: "are" },
    { type: "del", text: "you" },
    { type: "ins", text: "you?" },
  ]);
  assert.equal(changeCount, 2);
});

test("insertion and deletion at different spots count separately", async () => {
  const { wordDiff } = await load();
  const { ops, changeCount } = wordDiff("a b c d", "a x b d");
  assert.equal(changeCount, 2); // "x" inserted, "c" removed
  assert.equal(
    ops
      .map((o) => `${o.type}:${o.text}`)
      .join("|"),
    "same:a|ins:x|same:b|del:c|same:d"
  );
});

test("empty before means everything is one insertion", async () => {
  const { wordDiff } = await load();
  const { ops, changeCount } = wordDiff("", "brand new text");
  assert.deepEqual(ops, [{ type: "ins", text: "brand new text" }]);
  assert.equal(changeCount, 1);
});

test("over-cap inputs fall back to whole-text del+ins", async () => {
  const { wordDiff } = await load();
  const big = Array.from({ length: 501 }, (_, i) => `w${i}`).join(" ");
  const { ops, changeCount } = wordDiff(big, "short");
  assert.equal(ops.length, 2);
  assert.equal(ops[0].type, "del");
  assert.equal(ops[1].type, "ins");
  assert.equal(changeCount, 1);
});
