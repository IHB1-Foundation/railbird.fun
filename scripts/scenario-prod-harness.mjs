#!/usr/bin/env node

const DEFAULT_WEB_URL = "https://www.railbird.fun";
const DEFAULT_INDEXER_URL = "https://indexer-production-4bb1.up.railway.app";
const DEFAULT_OWNERVIEW_URL = "https://ownerview-production.up.railway.app";

const WEB_URL = process.env.SCENARIO_WEB_URL || process.env.NEXT_PUBLIC_APP_URL || DEFAULT_WEB_URL;
const INDEXER_URL =
  process.env.SCENARIO_INDEXER_URL || process.env.NEXT_PUBLIC_INDEXER_URL || DEFAULT_INDEXER_URL;
const OWNERVIEW_URL =
  process.env.SCENARIO_OWNERVIEW_URL ||
  process.env.NEXT_PUBLIC_OWNERVIEW_URL ||
  DEFAULT_OWNERVIEW_URL;

let passCount = 0;
let failCount = 0;
let skipCount = 0;

function pass(label, detail = "") {
  passCount += 1;
  console.log(`PASS ${label}${detail ? ` :: ${detail}` : ""}`);
}

function fail(label, detail) {
  failCount += 1;
  console.error(`FAIL ${label} :: ${detail}`);
}

function skip(label, detail) {
  skipCount += 1;
  console.log(`SKIP ${label}${detail ? ` :: ${detail}` : ""}`);
}

async function fetchText(url, init) {
  const res = await fetch(url, init);
  const text = (await res.text()).replace(/<!-- -->/g, "");
  return { res, text };
}

async function fetchJson(url, init) {
  const res = await fetch(url, init);
  const text = await res.text();
  let json = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  return { res, text, json };
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

async function runCheck(label, fn) {
  try {
    await fn();
    pass(label);
  } catch (error) {
    fail(label, error instanceof Error ? error.message : String(error));
  }
}

async function main() {
  console.log(`WEB_URL=${WEB_URL}`);
  console.log(`INDEXER_URL=${INDEXER_URL}`);
  console.log(`OWNERVIEW_URL=${OWNERVIEW_URL}`);

  let tables = [];

  await runCheck("indexer health", async () => {
    const { res, json, text } = await fetchJson(`${INDEXER_URL}/api/health`);
    assert([200, 503].includes(res.status), `unexpected status ${res.status}`);
    assert(json && typeof json === "object", `expected JSON body, got: ${text.slice(0, 160)}`);
    assert(
      json.status === "ready" || json.status === "degraded",
      `unexpected status payload: ${JSON.stringify(json)}`,
    );
  });

  await runCheck("ownerview health", async () => {
    const { res, json, text } = await fetchJson(`${OWNERVIEW_URL}/health`);
    assert([200, 503].includes(res.status), `unexpected status ${res.status}`);
    assert(json && typeof json === "object", `expected JSON body, got: ${text.slice(0, 160)}`);
    assert(
      json.status === "ready" || json.status === "degraded",
      `unexpected status payload: ${JSON.stringify(json)}`,
    );
  });

  await runCheck("table feed", async () => {
    const { res, json, text } = await fetchJson(`${INDEXER_URL}/api/tables`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(Array.isArray(json), `expected array, got: ${text.slice(0, 160)}`);
    tables = json;
    assert(json.length > 0, "expected at least one table");
  });

  await runCheck("landing page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(
      text.includes("AI Agents Play On-Chain Poker") ||
        text.includes("Autonomous AI agents") ||
        text.includes("Now Playing"),
      "landing title missing",
    );
    assert(!text.includes("Unable to load tables"), "landing still shows table load failure");
  });

  await runCheck("live page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/live`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("AI Poker Arena"), "live dashboard heading missing");
  });

  await runCheck("live grid mode", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/live?mode=grid`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Grid View"), "grid mode marker missing");
  });

  await runCheck("live stream mode", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/live?stream=1`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Stream Mode"), "stream mode marker missing");
  });

  await runCheck("leaderboard page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/leaderboard`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Leaderboard"), "leaderboard title missing");
  });

  await runCheck("docs page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/docs`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Developer Docs"), "docs title missing");
    assert(text.includes("WebSocket Stream"), "docs websocket section missing");
  });

  await runCheck("verify page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/verify`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("AI Decision Verifier"), "verify page title missing");
  });

  await runCheck("create-agent page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/create-agent`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Create Your AI Agent"), "create-agent title missing");
  });

  await runCheck("my agents page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/me`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("My Agents"), "my agents title missing");
  });

  await runCheck("betting page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/betting`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(
      text.includes("Predict the Winner") ||
        text.includes("Bet Slip") ||
        text.includes("Virtual Bankroll") ||
        text.includes("Rail Bets"),
      "betting markers missing",
    );
  });

  await runCheck("sidebet leaderboard page", async () => {
    const { res, text } = await fetchText(`${WEB_URL}/sidebets/leaderboard`);
    assert(res.ok, `unexpected status ${res.status}`);
    assert(text.includes("Side Bet Leaderboard"), "sidebet leaderboard title missing");
  });

  if (tables.length > 0) {
    await runCheck("table detail page", async () => {
      const tableId = tables[0].tableId;
      const { res, text } = await fetchText(`${WEB_URL}/table/${encodeURIComponent(tableId)}`);
      assert(res.ok, `unexpected status ${res.status}`);
      assert(
        text.includes("Action Log") || text.includes("Table Viewer") || text.includes("Why"),
        "table detail markers missing",
      );
    });

    await runCheck("table replay deep link", async () => {
      const tableId = tables[0].tableId;
      const handId = tables[0].currentHand?.handId || tables[0].currentHandId || "0";
      const { res, text } = await fetchText(
        `${WEB_URL}/table/${encodeURIComponent(tableId)}?hand=${encodeURIComponent(handId)}`,
      );
      assert(res.ok, `unexpected status ${res.status}`);
      assert(text.includes(`Replay Hand #${handId}`), "table replay marker missing");
    });

    await runCheck("table clips view", async () => {
      const tableId = tables[0].tableId;
      const { res, text } = await fetchText(
        `${WEB_URL}/table/${encodeURIComponent(tableId)}?view=clips`,
      );
      assert(res.ok, `unexpected status ${res.status}`);
      assert(text.includes("Highlight Builder"), "clips marker missing");
    });

    await runCheck("embed table page", async () => {
      const tableId = tables[0].tableId;
      const { res, text } = await fetchText(
        `${WEB_URL}/embed/table/${encodeURIComponent(tableId)}?theme=dark`,
      );
      assert(res.ok, `unexpected status ${res.status}`);
      assert(text.includes("Railbird Embed"), "embed title missing");
      assert(text.includes(`Table #${tableId}`), "embed table id missing");
      assert(
        res.headers.get("x-frame-options") === null,
        "x-frame-options should be unset for embed routes",
      );
      const csp = res.headers.get("content-security-policy") || "";
      assert(csp.includes("frame-ancestors"), "embed CSP missing frame-ancestors");
      assert(
        !csp.includes("frame-ancestors 'none'"),
        "embed frame-ancestors still blocks embedding",
      );
    });
  } else {
    skip("table detail page", "no tables available from indexer");
    skip("table replay deep link", "no tables available from indexer");
    skip("table clips view", "no tables available from indexer");
    skip("embed table page", "no tables available from indexer");
  }

  console.log(`RESULT pass=${passCount} fail=${failCount} skip=${skipCount}`);
  if (failCount > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack || error.message : String(error));
  process.exit(1);
});
