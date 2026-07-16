const os = require("os");
const debugLogger = require("./debugLogger");

// ponytail: os.freemem() polling — Electron has no native low-memory event
// on Windows; swap to a real pressure signal if one ever lands.
const POLL_INTERVAL_MS = 30000;
const MIN_FREE_BYTES = 500 * 1024 * 1024;
const MIN_FREE_FRACTION = 0.1;
// Cooldown after an eviction so a still-low freemem reading doesn't
// unload/reload thrash (transcribe paths lazily restart their server).
const EVICTION_COOLDOWN_MS = 5 * 60 * 1000;

class MemoryPressureMonitor {
  constructor() {
    this.evictors = new Map();
    this.timer = null;
    this.lastEvictionAt = 0;
  }

  // evict: async fn that unloads the model (may internally no-op if busy).
  register(name, evict) {
    this.evictors.set(name, evict);
  }

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => this._check(), POLL_INTERVAL_MS);
    this.timer.unref?.();
  }

  stop() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  _check() {
    const free = os.freemem();
    if (free >= MIN_FREE_BYTES && free / os.totalmem() >= MIN_FREE_FRACTION) return;
    if (Date.now() - this.lastEvictionAt < EVICTION_COOLDOWN_MS) return;
    this.lastEvictionAt = Date.now();
    debugLogger.warn(
      `[MemoryPressure] Low memory (${Math.round(free / 1048576)}MB free) — evicting loaded local models`
    );
    for (const [name, evict] of this.evictors) {
      Promise.resolve()
        .then(evict)
        .catch((err) => debugLogger.warn(`[MemoryPressure] Evicting ${name} failed:`, err.message));
    }
  }
}

module.exports = new MemoryPressureMonitor();
