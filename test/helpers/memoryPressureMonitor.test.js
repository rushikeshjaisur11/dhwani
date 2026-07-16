const { test } = require("node:test");
const assert = require("node:assert");
const os = require("os");

const monitor = require("../../src/helpers/memoryPressureMonitor");

const tick = () => new Promise((resolve) => setImmediate(resolve));

test("evicts under pressure, honors cooldown, no-ops when memory is fine", async () => {
  const origFree = os.freemem;
  const origTotal = os.totalmem;
  let evictions = 0;
  monitor.register("fake", () => {
    evictions++;
  });

  try {
    os.totalmem = () => 16 * 1024 ** 3;

    os.freemem = () => 8 * 1024 ** 3; // plenty free
    monitor._check();
    await tick();
    assert.strictEqual(evictions, 0);

    os.freemem = () => 100 * 1024 ** 2; // below 500MB floor
    monitor._check();
    await tick();
    assert.strictEqual(evictions, 1);

    monitor._check(); // still low, but inside cooldown
    await tick();
    assert.strictEqual(evictions, 1);

    monitor.lastEvictionAt = 0; // cooldown elapsed
    os.freemem = () => 1 * 1024 ** 3; // >500MB but <10% of total
    monitor._check();
    await tick();
    assert.strictEqual(evictions, 2);
  } finally {
    os.freemem = origFree;
    os.totalmem = origTotal;
    monitor.evictors.delete("fake");
    monitor.lastEvictionAt = 0;
  }
});
