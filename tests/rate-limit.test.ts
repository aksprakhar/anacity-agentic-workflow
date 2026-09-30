import { test } from "node:test";
import assert from "node:assert/strict";
import { clientKey, createRateLimiter } from "../src/lib/rate-limit";

test("rate limiter allows up to the limit per window, per client", () => {
  const check = createRateLimiter(2, 60_000);
  assert.equal(check("a", 0).allowed, true);
  assert.equal(check("a", 1_000).allowed, true);
  const blocked = check("a", 2_000);
  assert.equal(blocked.allowed, false);
  assert.equal(blocked.retryAfter, 58);
  assert.equal(check("b", 2_000).allowed, true);
  assert.equal(check("a", 60_000).allowed, true);
});

test("client key uses the first forwarded address", () => {
  const request = (headers: Record<string, string>) =>
    new Request("http://localhost/api/assist", { headers });
  assert.equal(
    clientKey(request({ "x-forwarded-for": "203.0.113.5, 10.0.0.1" })),
    "203.0.113.5",
  );
  assert.equal(clientKey(request({ "x-real-ip": "198.51.100.7" })), "198.51.100.7");
  assert.equal(clientKey(request({})), "unknown");
});
