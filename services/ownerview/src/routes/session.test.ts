/**
 * Tests for session revocation routes.
 * Uses jose directly (no AuthService import) to avoid the viem transitive dep
 * that breaks ownerview's ESM test runner in the current workspace setup.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as jose from "jose";
import type { Request, Response } from "express";
import { createSessionRoutes, isSessionRevoked } from "./session.js";

const JWT_SECRET = "test-secret-key-that-is-at-least-32-characters-long";
const TEST_ADDRESS = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

async function mintJwt(address: string): Promise<string> {
  const secret = new TextEncoder().encode(JWT_SECRET);
  const now = Math.floor(Date.now() / 1000);
  return new jose.SignJWT({ sub: address.toLowerCase() })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt(now)
    .setExpirationTime(now + 3600)
    .sign(secret);
}

// Minimal AuthService stub that verifies JWTs without importing viem.
function makeAuthService() {
  const secret = new TextEncoder().encode(JWT_SECRET);
  return {
    verifySession: async (token: string) => {
      try {
        const { payload } = await jose.jwtVerify(token, secret);
        if (!payload.sub) return null;
        return { sub: payload.sub as string, iat: payload.iat!, exp: payload.exp! };
      } catch {
        return null;
      }
    },
  };
}

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    body: {},
    query: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response & { statusCode: number; jsonData: unknown } {
  const res: Partial<Response> & { statusCode: number; jsonData: unknown } = {
    statusCode: 200,
    jsonData: null,
    status(code: number) {
      this.statusCode = code;
      return this as Response;
    },
    json(data: unknown) {
      this.jsonData = data;
      return this as Response;
    },
  };
  return res as Response & { statusCode: number; jsonData: unknown };
}

type RouterLayer = {
  route?: {
    path: string;
    stack: Array<{ method: string; handle: (req: Request, res: Response) => void }>;
  };
};

function extractHandler(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  router: any,
  path: string,
): (req: Request, res: Response) => Promise<void> {
  const layer = (router as { stack: RouterLayer[] }).stack.find((l) => l.route?.path === path);
  const handle = layer?.route?.stack[0]?.handle;
  if (!handle) throw new Error(`handler for ${path} not found`);
  return handle as (req: Request, res: Response) => Promise<void>;
}

describe("POST /session/revoke", () => {
  const authService = makeAuthService();
  const router = createSessionRoutes(authService as never);
  const revokeHandler = extractHandler(router, "/revoke");

  it("returns 401 when no token provided", async () => {
    const res = makeRes();
    await revokeHandler(makeReq({ headers: {}, cookies: {} }), res);
    assert.equal(res.statusCode, 401);
  });

  it("returns 401 when token is invalid", async () => {
    const res = makeRes();
    await revokeHandler(makeReq({ headers: { authorization: "Bearer bad-jwt" } }), res);
    assert.equal(res.statusCode, 401);
  });

  it("records revocation and responds ok with valid JWT", async () => {
    const jwt = await mintJwt(TEST_ADDRESS);
    const req = makeReq({ headers: { authorization: `Bearer ${jwt}` }, body: { via: "manual" } });
    const res = makeRes();
    await revokeHandler(req, res);
    assert.equal(res.statusCode, 200);
    const data = res.jsonData as { ok: boolean; address: string; revokedAt: string };
    assert.equal(data.ok, true);
    assert.equal(data.address, TEST_ADDRESS.toLowerCase());
    assert.equal(isSessionRevoked(TEST_ADDRESS), true);
  });
});

describe("GET /session/status", () => {
  const authService = makeAuthService();
  const router = createSessionRoutes(authService as never);
  const statusHandler = extractHandler(router, "/status");

  it("returns 400 when address is missing", async () => {
    const res = makeRes();
    await statusHandler(makeReq({ query: {} }), res);
    assert.equal(res.statusCode, 400);
  });

  it("returns isRevoked: false for an unknown address", async () => {
    const res = makeRes();
    await statusHandler(
      makeReq({ query: { address: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb" } }),
      res,
    );
    assert.equal(res.statusCode, 200);
    const data = res.jsonData as { isRevoked: boolean };
    assert.equal(data.isRevoked, false);
  });
});
