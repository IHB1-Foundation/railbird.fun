import { describe, it, beforeEach, afterEach } from "node:test";
import assert from "node:assert";
import { privateKeyToAccount, generatePrivateKey } from "viem/accounts";
import { createApp, type AppContext } from "../app.js";

const TEST_JWT_SECRET = "test-secret-key-that-is-at-least-32-characters-long";

// Simple test HTTP client using native fetch on the express app
async function request(
  app: AppContext["app"],
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; json: () => Promise<unknown> }> {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, async () => {
      try {
        const addr = server.address();
        if (!addr || typeof addr === "string") {
          throw new Error("Failed to get server address");
        }
        const url = `http://localhost:${addr.port}${path}`;
        const options: RequestInit = {
          method,
          headers: { "Content-Type": "application/json" },
        };
        if (body) {
          options.body = JSON.stringify(body);
        }
        const res = await fetch(url, options);
        resolve({
          status: res.status,
          json: () => res.json(),
        });
      } catch (err) {
        reject(err);
      } finally {
        server.close();
      }
    });
  });
}

describe("Auth Routes", () => {
  let ctx: AppContext;

  beforeEach(() => {
    ctx = createApp({ jwtSecret: TEST_JWT_SECRET });
  });

  afterEach(() => {
    ctx.authService.stop();
  });

  describe("GET /auth/nonce", () => {
    it("returns nonce for valid address", async () => {
      const address = "0x1234567890123456789012345678901234567890";
      const res = await request(ctx.app, "GET", `/auth/nonce?address=${address}`);
      assert.equal(res.status, 200);
      const json = (await res.json()) as { nonce: string; message: string };
      assert.ok(json.nonce.length > 0);
      assert.ok(json.message.includes(json.nonce));
    });

    it("returns 400 for missing address", async () => {
      const res = await request(ctx.app, "GET", "/auth/nonce");
      assert.equal(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.equal(json.code, "MISSING_ADDRESS");
    });

    it("returns 400 for invalid address", async () => {
      const res = await request(ctx.app, "GET", "/auth/nonce?address=invalid");
      assert.equal(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.equal(json.code, "INVALID_ADDRESS");
    });
  });

  describe("POST /auth/verify", () => {
    it("issues token for valid signature", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      // Get nonce
      const nonceRes = await request(
        ctx.app,
        "GET",
        `/auth/nonce?address=${account.address}`
      );
      const { nonce, message } = (await nonceRes.json()) as {
        nonce: string;
        message: string;
      };

      // Sign
      const signature = await account.signMessage({ message });

      // Verify
      const verifyRes = await request(ctx.app, "POST", "/auth/verify", {
        address: account.address,
        nonce,
        signature,
      });

      assert.equal(verifyRes.status, 200);
      const json = (await verifyRes.json()) as {
        token: string;
        address: string;
        expiresAt: number;
      };
      assert.ok(json.token.length > 0);
      assert.equal(json.address, account.address.toLowerCase());
      assert.ok(json.expiresAt > Date.now());
    });

    it("returns 400 for missing fields", async () => {
      const res = await request(ctx.app, "POST", "/auth/verify", {
        address: "0x1234567890123456789012345678901234567890",
      });
      assert.equal(res.status, 400);
      const json = (await res.json()) as { code: string };
      assert.equal(json.code, "MISSING_FIELDS");
    });

    it("returns 401 for invalid signature", async () => {
      const privateKey1 = generatePrivateKey();
      const privateKey2 = generatePrivateKey();
      const account1 = privateKeyToAccount(privateKey1);
      const account2 = privateKeyToAccount(privateKey2);

      // Get nonce for account1
      const nonceRes = await request(
        ctx.app,
        "GET",
        `/auth/nonce?address=${account1.address}`
      );
      const { nonce, message } = (await nonceRes.json()) as {
        nonce: string;
        message: string;
      };

      // Sign with account2 (wrong key)
      const signature = await account2.signMessage({ message });

      // Verify should fail
      const verifyRes = await request(ctx.app, "POST", "/auth/verify", {
        address: account1.address,
        nonce,
        signature,
      });

      assert.equal(verifyRes.status, 401);
      const json = (await verifyRes.json()) as { code: string };
      assert.equal(json.code, "INVALID_SIGNATURE");
    });

    it("returns 400 for reused nonce", async () => {
      const privateKey = generatePrivateKey();
      const account = privateKeyToAccount(privateKey);

      // Get nonce
      const nonceRes = await request(
        ctx.app,
        "GET",
        `/auth/nonce?address=${account.address}`
      );
      const { nonce, message } = (await nonceRes.json()) as {
        nonce: string;
        message: string;
      };

      const signature = await account.signMessage({ message });

      // First verify succeeds
      const res1 = await request(ctx.app, "POST", "/auth/verify", {
        address: account.address,
        nonce,
        signature,
      });
      assert.equal(res1.status, 200);

      // Second verify fails
      const res2 = await request(ctx.app, "POST", "/auth/verify", {
        address: account.address,
        nonce,
        signature,
      });
      assert.equal(res2.status, 400);
      const json = (await res2.json()) as { code: string };
      assert.equal(json.code, "INVALID_NONCE");
    });
  });

  describe("GET /health", () => {
    it("returns ok", async () => {
      const res = await request(ctx.app, "GET", "/health");
      assert.equal(res.status, 200);
      const json = (await res.json()) as { status: string };
      assert.equal(json.status, "ok");
    });
  });
});
