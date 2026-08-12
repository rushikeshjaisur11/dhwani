import { describe, it, expect, vi } from "vitest";
import { withRetry, createApiRetryStrategy, httpError } from "./retry";

describe("withRetry", () => {
  it("retries a flaky call that fails twice with a retryable error then succeeds", async () => {
    let calls = 0;
    const flaky = vi.fn(async () => {
      calls++;
      if (calls < 3) {
        throw httpError(503, "server error");
      }
      return "ok";
    });

    const result = await withRetry(flaky, {
      ...createApiRetryStrategy(),
      initialDelay: 1,
      maxDelay: 1,
    });

    expect(result).toBe("ok");
    expect(calls).toBe(3);
  });

  it("never retries a 4xx client error", async () => {
    let calls = 0;
    const badRequest = vi.fn(async () => {
      calls++;
      throw httpError(400, "bad request");
    });

    await expect(
      withRetry(badRequest, { ...createApiRetryStrategy(), initialDelay: 1, maxDelay: 1 })
    ).rejects.toThrow("bad request");
    expect(calls).toBe(1);
  });

  it("retries a network error with no status attached", async () => {
    let calls = 0;
    const networkFailure = vi.fn(async () => {
      calls++;
      if (calls < 2) throw new TypeError("fetch failed");
      return "ok";
    });

    const result = await withRetry(networkFailure, {
      ...createApiRetryStrategy(),
      initialDelay: 1,
      maxDelay: 1,
    });

    expect(result).toBe("ok");
    expect(calls).toBe(2);
  });

  it("retries 429 and honors a Retry-After header as the wait time", async () => {
    let calls = 0;
    const rateLimited = vi.fn(async () => {
      calls++;
      if (calls < 2) {
        throw httpError(429, "rate limited", { get: () => "0" });
      }
      return "ok";
    });

    const start = Date.now();
    const result = await withRetry(rateLimited, {
      ...createApiRetryStrategy(),
      initialDelay: 5000, // would take 5s if Retry-After were ignored
      maxDelay: 5000,
    });
    const elapsedMs = Date.now() - start;

    expect(result).toBe("ok");
    expect(calls).toBe(2);
    expect(elapsedMs).toBeLessThan(1000);
  });

  it("gives up after maxRetries and throws the last error", async () => {
    const alwaysFails = vi.fn(async () => {
      throw httpError(500, "still down");
    });

    await expect(
      withRetry(alwaysFails, {
        ...createApiRetryStrategy(),
        maxRetries: 2,
        initialDelay: 1,
        maxDelay: 1,
      })
    ).rejects.toThrow("still down");
    expect(alwaysFails).toHaveBeenCalledTimes(3); // initial attempt + 2 retries
  });
});
