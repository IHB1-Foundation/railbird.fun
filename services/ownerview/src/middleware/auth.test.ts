import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";
import { createAuthMiddleware, type AuthenticatedRequest } from "./auth.js";
import { AuthService } from "../auth/index.js";
import type { Response, NextFunction } from "express";

// Simple mock response
function createMockResponse(): Response & { statusCode: number; jsonData: unknown } {
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

describe("AuthMiddleware", () => {
  const jwtSecret = "test-secret-key-that-is-at-least-32-chars-long";
  let authService: AuthService;
  let middleware: ReturnType<typeof createAuthMiddleware>;

  beforeEach(() => {
    authService = new AuthService({ jwtSecret });
    middleware = createAuthMiddleware(authService);
  });

  afterEach(() => {
    authService.stop();
  });

  it("should reject requests without Authorization header", async () => {
    const req = { headers: {} } as AuthenticatedRequest;
    const res = createMockResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.jsonData, {
      error: "Missing Authorization header",
      code: "MISSING_AUTH",
    });
    assert.equal(nextCalled, false);
  });

  it("should reject requests with invalid auth format (no Bearer)", async () => {
    const req = {
      headers: { authorization: "Basic token123" },
    } as AuthenticatedRequest;
    const res = createMockResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.jsonData, {
      error: "Invalid Authorization header format. Expected: Bearer <token>",
      code: "INVALID_AUTH_FORMAT",
    });
    assert.equal(nextCalled, false);
  });

  it("should reject requests with invalid token", async () => {
    const req = {
      headers: { authorization: "Bearer invalid-token" },
    } as AuthenticatedRequest;
    const res = createMockResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.jsonData, {
      error: "Invalid or expired token",
      code: "INVALID_TOKEN",
    });
    assert.equal(nextCalled, false);
  });

  it("should attach wallet address and call next() for valid token", async () => {
    // Create a valid token using the internal session manager
    // We need to mock the verify method since we can't create real tokens easily
    const testAddress = "0x1234567890123456789012345678901234567890";

    // Override verifySession for this test
    const originalVerify = authService.verifySession.bind(authService);
    authService.verifySession = async (token: string) => {
      if (token === "valid-token") {
        return {
          sub: testAddress as `0x${string}`,
          iat: Math.floor(Date.now() / 1000),
          exp: Math.floor(Date.now() / 1000) + 3600,
        };
      }
      return originalVerify(token);
    };

    const req = {
      headers: { authorization: "Bearer valid-token" },
    } as AuthenticatedRequest;
    const res = createMockResponse();
    let nextCalled = false;

    await middleware(req, res, () => {
      nextCalled = true;
    });

    assert.equal(nextCalled, true);
    assert.equal(req.wallet, testAddress);
  });
});
