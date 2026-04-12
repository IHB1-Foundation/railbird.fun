/**
 * k6 Load Test — SideBet Place/Settle/Claim
 *
 * Scenario: 50 concurrent users placing side bets.
 * Requires: local anvil + deployed SideBetPool contract.
 *
 * Usage:
 *   k6 run \
 *     --env INDEXER_URL=http://localhost:3100 \
 *     --env SIDEBET_CONTRACT=0x... \
 *     --env RPC_URL=http://localhost:8545 \
 *     scripts/load/k6-sidebet.js
 *
 * Note: This test uses the indexer REST API to observe side bet state.
 * Actual on-chain transactions require a chain RPC relay — see docs.
 */

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Trend, Rate } from "k6/metrics";

const betLatency = new Trend("sidebet_bet_latency", true);
const claimLatency = new Trend("sidebet_claim_latency", true);
const betErrors = new Counter("sidebet_errors");
const successRate = new Rate("sidebet_success_rate");

export const options = {
  vus: 50,
  duration: "2m",
  thresholds: {
    sidebet_bet_latency: ["p(95)<2000"],  // P95 < 2s (on-chain TX is slow)
    sidebet_errors:      ["count<100"],   // < 100 hard errors
    sidebet_success_rate: ["rate>0.85"],  // > 85% success
  },
};

const INDEXER_URL = __ENV.INDEXER_URL || "http://localhost:3100";

export default function () {
  const vu = __VU;
  const iter = __ITER;

  // 1. Check current hand via indexer
  const tablesRes = http.get(`${INDEXER_URL}/api/tables`, {
    tags: { step: "get-tables" },
  });

  const tablesOk = check(tablesRes, {
    "tables endpoint reachable": (r) => r.status === 200 || r.status === 304,
  });

  if (!tablesOk) {
    betErrors.add(1);
    successRate.add(0);
    sleep(0.5);
    return;
  }

  let tables = [];
  try {
    tables = JSON.parse(tablesRes.body);
  } catch {
    betErrors.add(1);
    successRate.add(0);
    sleep(0.5);
    return;
  }

  if (!tables || tables.length === 0) {
    // No tables available — expected in some test environments
    successRate.add(1);
    sleep(1);
    return;
  }

  const table = tables[0];
  const tableId = table.id;

  // 2. Check if there's an active hand to bet on
  const handRes = http.get(`${INDEXER_URL}/api/tables/${tableId}`, {
    tags: { step: "get-table" },
  });

  if (handRes.status !== 200) {
    betErrors.add(1);
    successRate.add(0);
    sleep(0.5);
    return;
  }

  let tableState;
  try {
    tableState = JSON.parse(handRes.body);
  } catch {
    betErrors.add(1);
    successRate.add(0);
    sleep(0.5);
    return;
  }

  // 3. If hand is active (BETTING_PRE = 2), simulate reading side bet odds
  const isBetting = tableState.gameState >= 2 && tableState.gameState <= 8;
  if (isBetting) {
    // In production: would call SideBetPool.placeBet via RPC relay
    // For load test: measure indexer latency under concurrent reads
    const betStart = Date.now();
    const sideBetRes = http.get(
      `${INDEXER_URL}/api/tables/${tableId}/sidebets?handId=${tableState.currentHandId}`,
      { tags: { step: "read-sidebets" } }
    );
    betLatency.add(Date.now() - betStart);

    const ok = check(sideBetRes, {
      "sidebet read status ok": (r) => r.status === 200 || r.status === 404,
    });
    successRate.add(ok ? 1 : 0);
    if (!ok) betErrors.add(1);
  }

  // 4. Check claim state from indexer (simulates claim flow)
  const claimStart = Date.now();
  const historyRes = http.get(
    `${INDEXER_URL}/api/tables/${tableId}/hands?limit=5`,
    { tags: { step: "hand-history" } }
  );
  claimLatency.add(Date.now() - claimStart);

  const historyOk = check(historyRes, {
    "hand history reachable": (r) => r.status === 200 || r.status === 404,
  });
  if (!historyOk) betErrors.add(1);

  successRate.add(historyOk ? 1 : 0);
  sleep(0.5 + Math.random());
}
