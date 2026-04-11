import { describe, it, mock } from "node:test";
import assert from "node:assert/strict";
import type { Request, Response, NextFunction } from "express";
import { createRateLimiter } from "./rateLimit.js";

function mockReq(ip: string, path = "/auth/nonce"): Request {
  return {
    headers: { "x-forwarded-for": ip },
    path,
    socket: { remoteAddress: ip },
  } as unknown as Request;
}

function mockRes() {
  let statusCode = 200;
  const headers: Record<string, string> = {};
  const res = {
    _statusCode: () => statusCode,
    _headers: () => headers,
    status(code: number) { statusCode = code; return res; },
    json(_body: unknown) { return res; },
    set(k: string, v: string) { headers[k] = v; return res; },
  };
  return res;
}

function noop(): void {}

describe("createRateLimiter", () => {
  it("allows requests within limit", () => {
    const limiter = createRateLimiter({ maxRequests: 5, windowMs: 60_000 });
    let passCount = 0;
    const next: NextFunction = () => { passCount++; };
    for (let i = 0; i < 5; i++) {
      limiter(mockReq(`allow-${i}`), mockRes() as any, next);
    }
    assert.equal(passCount, 5);
  });

  it("blocks 11th request with 429", () => {
    const limiter = createRateLimiter({ maxRequests: 10, windowMs: 60_000 });
    const ip = "5.6.7.8";
    let passCount = 0;
    const next: NextFunction = () => { passCount++; };
    for (let i = 0; i < 10; i++) {
      limiter(mockReq(ip), mockRes() as any, next);
    }
    const res = mockRes();
    limiter(mockReq(ip), res as any, noop as any);
    assert.equal(passCount, 10);
    assert.equal(res._statusCode(), 429);
  });

  it("returns Retry-After header on 429", () => {
    const limiter = createRateLimiter({ maxRequests: 2, windowMs: 60_000 });
    const ip = "9.9.9.9";
    const next: NextFunction = noop as any;
    limiter(mockReq(ip), mockRes() as any, next);
    limiter(mockReq(ip), mockRes() as any, next);
    const res = mockRes();
    limiter(mockReq(ip), res as any, noop as any);
    assert.ok(res._headers()["Retry-After"], "Retry-After header should be set");
  });

  it("uses first X-Forwarded-For IP", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const req = {
      headers: { "x-forwarded-for": "10.0.0.1, 10.0.0.2" },
      path: "/auth/nonce",
      socket: { remoteAddress: "127.0.0.1" },
    } as unknown as Request;
    let pass = 0;
    const next: NextFunction = () => { pass++; };
    limiter(req, mockRes() as any, next);
    assert.equal(pass, 1);
    const res = mockRes();
    limiter(req, res as any, noop as any);
    assert.equal(res._statusCode(), 429);
  });

  it("different paths have independent buckets", () => {
    const limiter = createRateLimiter({ maxRequests: 1, windowMs: 60_000 });
    const ip = "11.11.11.11";
    let pass = 0;
    const next: NextFunction = () => { pass++; };
    limiter(mockReq(ip, "/auth/nonce"), mockRes() as any, next);
    limiter(mockReq(ip, "/auth/verify"), mockRes() as any, next);
    assert.equal(pass, 2);
  });
});
