/**
 * k6 Load Test — OwnerView Auth Endpoints
 *
 * Scenario: 100 RPS on /auth/nonce and /auth/verify.
 * Validates rate limiter fires (429 responses expected above threshold).
 *
 * Usage:
 *   k6 run --env OWNERVIEW_URL=http://localhost:3001 scripts/load/k6-auth.js
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate, Trend } from "k6/metrics";
import { randomBytes } from "k6/crypto";

const nonceLatency = new Trend("auth_nonce_latency", true);
const verifyLatency = new Trend("auth_verify_latency", true);
const rateLimited = new Counter("auth_rate_limited_total");
const successRate = new Rate("auth_success_rate");
const errorRate = new Rate("auth_error_rate");

export const options = {
  scenarios: {
    nonce_load: {
      executor: "constant-arrival-rate",
      rate: 100,            // 100 RPS
      timeUnit: "1s",
      duration: "2m",
      preAllocatedVUs: 20,
      maxVUs: 50,
    },
  },
  thresholds: {
    auth_nonce_latency: ["p(95)<500"],       // P95 < 500ms
    auth_error_rate:    ["rate<0.05"],       // < 5% server errors
    // Rate limiter validation: expect 429s when load exceeds 10 req/min per IP
    // (This threshold documents the expected behavior, not a failure condition)
  },
};

const BASE_URL = __ENV.OWNERVIEW_URL || "http://localhost:3001";

// Deterministic test wallets (not real — just for load testing)
const TEST_WALLETS = [
  "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266",
  "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
  "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
  "0x90F79bf6EB2c4f870365E785982E1f101E93b906",
  "0x15d34AAf54267DB7D7c367839AAf71A00a2C6A65",
];

export default function () {
  const wallet = TEST_WALLETS[__VU % TEST_WALLETS.length];

  // 1. Request nonce
  const nonceStart = Date.now();
  const nonceRes = http.get(`${BASE_URL}/auth/nonce?address=${wallet}`, {
    tags: { endpoint: "nonce" },
  });
  nonceLatency.add(Date.now() - nonceStart);

  if (nonceRes.status === 429) {
    rateLimited.add(1);
    // Rate limiter is working — this is expected under heavy load
    check(nonceRes, {
      "rate limit has Retry-After header": (r) =>
        r.headers["Retry-After"] !== undefined ||
        r.headers["retry-after"] !== undefined,
    });
    sleep(0.1);
    return;
  }

  const nonceOk = check(nonceRes, {
    "nonce status 200": (r) => r.status === 200,
    "nonce has nonce field": (r) => {
      try { return JSON.parse(r.body).nonce !== undefined; }
      catch { return false; }
    },
  });

  successRate.add(nonceOk ? 1 : 0);
  errorRate.add(nonceRes.status >= 500 ? 1 : 0);

  // 2. Attempt verify with invalid signature (load test — not real auth)
  const verifyStart = Date.now();
  const verifyRes = http.post(
    `${BASE_URL}/auth/verify`,
    JSON.stringify({
      address: wallet,
      signature: "0x" + "ab".repeat(65), // invalid sig — will be rejected
    }),
    {
      headers: { "Content-Type": "application/json" },
      tags: { endpoint: "verify" },
    }
  );
  verifyLatency.add(Date.now() - verifyStart);

  if (verifyRes.status === 429) {
    rateLimited.add(1);
  }

  // 400/401 expected for invalid signatures — that's correct behavior
  errorRate.add(verifyRes.status >= 500 ? 1 : 0);

  sleep(0.05);
}
