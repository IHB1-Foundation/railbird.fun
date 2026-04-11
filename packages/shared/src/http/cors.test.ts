import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { parseAllowedOrigins, createCorsMiddleware } from "./cors.js";

// ─── parseAllowedOrigins ───────────────────────────────────────────────────

describe("parseAllowedOrigins", () => {
  it("empty string → empty array (deny-by-default)", () => {
    assert.deepEqual(parseAllowedOrigins(""), []);
  });

  it("undefined → empty array", () => {
    assert.deepEqual(parseAllowedOrigins(undefined), []);
  });

  it("whitespace-only → empty array", () => {
    assert.deepEqual(parseAllowedOrigins("   "), []);
  });

  it("'*' → ['*'] (allow all)", () => {
    assert.deepEqual(parseAllowedOrigins("*"), ["*"]);
  });

  it("single origin", () => {
    assert.deepEqual(parseAllowedOrigins("https://example.com"), ["https://example.com"]);
  });

  it("multiple origins (comma-separated)", () => {
    assert.deepEqual(
      parseAllowedOrigins("https://a.com, https://b.com, https://c.com"),
      ["https://a.com", "https://b.com", "https://c.com"]
    );
  });
});

// ─── createCorsMiddleware ─────────────────────────────────────────────────

function makeReq(origin?: string, method = "GET") {
  return {
    headers: origin ? { origin } : {} as Record<string, string>,
    method,
  };
}

function makeRes() {
  const h: Record<string, string> = {};
  let statusCode = 200;
  let ended = false;
  const res = {
    header(k: string, v: string) { h[k] = v; return res; },
    status(code: number) { statusCode = code; return res; },
    end() { ended = true; return res; },
    _h: () => h,
    _status: () => statusCode,
    _ended: () => ended,
  };
  return res;
}

describe("createCorsMiddleware (deny-by-default)", () => {
  it("no origins set → no CORS headers for unknown origin", () => {
    const mw = createCorsMiddleware([]);
    const res = makeRes();
    let called = false;
    mw(makeReq("https://evil.com"), res, () => { called = true; });
    assert.ok(called);
    assert.equal(res._h()["Access-Control-Allow-Origin"], undefined);
  });

  it("explicit origin in list → echoed with Vary", () => {
    const mw = createCorsMiddleware(["https://railbird.fun"]);
    const res = makeRes();
    mw(makeReq("https://railbird.fun"), res, () => {});
    assert.equal(res._h()["Access-Control-Allow-Origin"], "https://railbird.fun");
    assert.equal(res._h()["Vary"], "Origin");
  });

  it("wildcard '*' → Access-Control-Allow-Origin: *", () => {
    const mw = createCorsMiddleware(["*"]);
    const res = makeRes();
    mw(makeReq("https://anywhere.com"), res, () => {});
    assert.equal(res._h()["Access-Control-Allow-Origin"], "*");
  });

  it("origin not in list → no CORS headers (denied)", () => {
    const mw = createCorsMiddleware(["https://railbird.fun"]);
    const res = makeRes();
    mw(makeReq("https://attacker.com"), res, () => {});
    assert.equal(res._h()["Access-Control-Allow-Origin"], undefined);
  });

  it("OPTIONS preflight with allowed origin returns 204", () => {
    const mw = createCorsMiddleware(["https://railbird.fun"]);
    const res = makeRes();
    mw(makeReq("https://railbird.fun", "OPTIONS"), res, () => {});
    assert.equal(res._status(), 204);
    assert.ok(res._ended());
  });

  it("OPTIONS without matching origin still returns 204", () => {
    const mw = createCorsMiddleware([]);
    const res = makeRes();
    mw(makeReq("https://evil.com", "OPTIONS"), res, () => {});
    assert.equal(res._status(), 204);
  });
});
