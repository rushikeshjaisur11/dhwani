// Retry wrapper for single-request main-process network calls (proxied fetches
// to cloud STT/LLM providers in ipcHandlers.js). Mirrors src/utils/retry.ts
// (renderer-side) — kept separate because main.js/ipcHandlers.js are plain
// CommonJS and can't import that TS module directly. Defaults match
// RETRY_CONFIG in src/config/constants.ts.

const MAX_RETRIES = 3;
const INITIAL_DELAY_MS = 1000;
const MAX_DELAY_MS = 10000;
const BACKOFF_MULTIPLIER = 2;

async function withRetry(fn, options = {}) {
  const {
    maxRetries = MAX_RETRIES,
    initialDelay = INITIAL_DELAY_MS,
    maxDelay = MAX_DELAY_MS,
    backoffMultiplier = BACKOFF_MULTIPLIER,
    shouldRetry = () => true,
  } = options;

  let lastError;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // A 429's Retry-After header (see httpError below), when present,
      // overrides the computed delay for that attempt.
      const wait = typeof error?.retryAfterMs === "number" ? error.retryAfterMs : delay;
      await new Promise((resolve) => setTimeout(resolve, wait));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

// Retry strategy for cloud STT/LLM API calls: retry network errors (no status
// attached — the request may never have reached the server), 429 rate limits,
// and 5xx server errors. Never retry other 4xx (bad request, auth failure,
// invalid model, ...) — those fail identically every time.
function createApiRetryStrategy() {
  return {
    shouldRetry: (error) => {
      const status = error && error.status;
      if (status === undefined) return true; // network/timeout error
      if (status === 429) return true;
      return status >= 500 && status < 600;
    },
  };
}

// Builds an Error carrying the HTTP status (and, for 429, a Retry-After-derived
// delay) so createApiRetryStrategy/withRetry can classify it correctly. Call
// sites should throw this instead of a bare `new Error(...)` for non-ok fetch
// responses, or retry can't tell a 4xx apart from a network failure.
function httpError(status, message, headers) {
  const err = new Error(message);
  err.status = status;
  if (status === 429 && headers && typeof headers.get === "function") {
    const retryAfter = headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(seconds)) err.retryAfterMs = seconds * 1000;
  }
  return err;
}

module.exports = { withRetry, createApiRetryStrategy, httpError };
