import { RETRY_CONFIG } from "../config/constants";

export interface RetryOptions {
  maxRetries?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffMultiplier?: number;
  shouldRetry?: (error: any) => boolean;
}

export async function withRetry<T>(fn: () => Promise<T>, options: RetryOptions = {}): Promise<T> {
  const {
    maxRetries = RETRY_CONFIG.MAX_RETRIES,
    initialDelay = RETRY_CONFIG.INITIAL_DELAY,
    maxDelay = RETRY_CONFIG.MAX_DELAY,
    backoffMultiplier = RETRY_CONFIG.BACKOFF_MULTIPLIER,
    shouldRetry = () => true,
  } = options;

  let lastError: any;
  let delay = initialDelay;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // Wait before retrying with exponential backoff. A 429's Retry-After
      // header (see httpError below), when present, overrides the computed
      // delay for that attempt.
      const wait =
        typeof (error as any)?.retryAfterMs === "number" ? (error as any).retryAfterMs : delay;
      await new Promise((resolve) => setTimeout(resolve, wait));
      delay = Math.min(delay * backoffMultiplier, maxDelay);
    }
  }

  throw lastError;
}

/**
 * Builds an Error carrying the HTTP status (and, for 429, a Retry-After-derived
 * delay) so `createApiRetryStrategy`/`withRetry` can classify it correctly.
 * Call sites should throw this instead of a bare `new Error(...)` for non-ok
 * fetch responses, or retry can't tell a 4xx apart from a network failure.
 */
export function httpError(
  status: number,
  message: string,
  headers?: { get(name: string): string | null } | null
): Error & { status: number; retryAfterMs?: number } {
  const err = new Error(message) as Error & { status: number; retryAfterMs?: number };
  err.status = status;
  if (status === 429 && headers) {
    const retryAfter = headers.get("retry-after");
    const seconds = retryAfter ? Number(retryAfter) : NaN;
    if (Number.isFinite(seconds)) err.retryAfterMs = seconds * 1000;
  }
  return err;
}

// Retry strategy for cloud STT/LLM API calls: retry network errors (no status
// attached — the request may never have reached the server), 429 rate limits,
// and 5xx server errors. Never retry other 4xx (bad request, auth failure,
// invalid model, ...) — those fail identically every time.
export function createApiRetryStrategy() {
  return {
    shouldRetry: (error: any) => {
      const status = error?.status;
      if (status === undefined) return true; // network/timeout error
      if (status === 429) return true;
      return status >= 500 && status < 600;
    },
  };
}

// Specific retry strategy for file operations
export function createFileRetryStrategy() {
  return {
    shouldRetry: (error: any) => {
      // Retry on temporary file system errors
      const retriableErrors = ["EBUSY", "ENOENT", "EPERM", "EAGAIN"];
      return retriableErrors.includes(error.code);
    },
    maxRetries: 2,
    initialDelay: 500,
  };
}
