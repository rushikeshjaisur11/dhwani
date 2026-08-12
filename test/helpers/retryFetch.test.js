const test = require("node:test");
const assert = require("node:assert/strict");
const { withRetry, createApiRetryStrategy, httpError } = require("../../src/helpers/retryFetch");

test("retries a flaky call that fails twice with a retryable error then succeeds", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 3) throw httpError(503, "server error");
      return "ok";
    },
    { ...createApiRetryStrategy(), initialDelay: 1, maxDelay: 1 }
  );

  assert.equal(result, "ok");
  assert.equal(calls, 3);
});

test("never retries a 4xx client error", async () => {
  let calls = 0;
  await assert.rejects(
    withRetry(
      async () => {
        calls++;
        throw httpError(400, "bad request");
      },
      { ...createApiRetryStrategy(), initialDelay: 1, maxDelay: 1 }
    ),
    /bad request/
  );
  assert.equal(calls, 1);
});

test("retries a network error with no status attached", async () => {
  let calls = 0;
  const result = await withRetry(
    async () => {
      calls++;
      if (calls < 2) throw new Error("ECONNRESET");
      return "ok";
    },
    { ...createApiRetryStrategy(), initialDelay: 1, maxDelay: 1 }
  );

  assert.equal(result, "ok");
  assert.equal(calls, 2);
});
