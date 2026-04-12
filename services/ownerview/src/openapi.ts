/**
 * OwnerView REST API — OpenAPI 3.0.3 specification.
 * Mounted at /openapi.json (raw) and /docs (Swagger UI) by `app.ts`.
 */
import { buildOpenApiSpec, type OpenApiSpec } from "@playerco/shared";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: { error: { type: "string" }, code: { type: "string" } },
};

export const ownerviewOpenApiSpec: OpenApiSpec = buildOpenApiSpec({
  info: {
    title: "Railbird OwnerView API",
    version: "1.0.0",
    description:
      "Wallet-authenticated API exposing hole-card reveal, dealer commitments, and AI commentary.",
  },
  servers: [
    { url: "http://localhost:4001", description: "Local development" },
    { url: "https://ownerview.railbird.fun", description: "Production" },
  ],
  tags: [
    { name: "auth", description: "Wallet-based authentication" },
    { name: "owner", description: "Hole-card reveal endpoints (auth required)" },
    { name: "dealer", description: "Trustless dealer protocol" },
    { name: "reasoning", description: "Agent reasoning intake" },
    { name: "commentary", description: "AI commentary intake" },
    { name: "health", description: "Health" },
  ],
  components: {
    securitySchemes: {
      bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
      cookieAuth: { type: "apiKey", in: "cookie", name: "jwt" },
      dealerApiKey: { type: "apiKey", in: "header", name: "X-Dealer-Api-Key" },
    },
    schemas: {
      Error: errorSchema,
      Nonce: {
        type: "object",
        properties: {
          nonce: { type: "string" },
          message: { type: "string" },
          expiresAt: { type: "integer" },
        },
      },
      Session: {
        type: "object",
        properties: {
          token: { type: "string" },
          address: { type: "string" },
          expiresAt: { type: "integer" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        summary: "Service readiness",
        responses: { "200": { description: "Ready" }, "503": { description: "Degraded" } },
      },
    },
    "/auth/nonce": {
      get: {
        tags: ["auth"],
        summary: "Issue a SIWE-style nonce for an address",
        parameters: [
          {
            name: "address",
            in: "query",
            required: true,
            schema: { type: "string" },
            description: "0x-prefixed wallet address",
          },
        ],
        responses: {
          "200": {
            description: "Nonce issued",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Nonce" } } },
          },
          "400": { description: "Missing address" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/auth/verify": {
      post: {
        tags: ["auth"],
        summary: "Verify a signed nonce and issue a session token",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["address", "nonce", "signature"],
                properties: {
                  address: { type: "string" },
                  nonce: { type: "string" },
                  signature: { type: "string" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Session issued",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Session" } } },
          },
          "400": { description: "Invalid request" },
          "401": { description: "Invalid signature" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/auth/logout": {
      post: {
        tags: ["auth"],
        summary: "Clear session cookies (cookie-mode only)",
        responses: { "200": { description: "Cleared" } },
      },
    },
    "/owner/encryption-key": {
      post: {
        tags: ["owner"],
        summary: "Register an ECIES public key for hole-card delivery",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["publicKey"],
                properties: {
                  publicKey: { type: "string", description: "0x-prefixed compressed pubkey" },
                },
              },
            },
          },
        },
        responses: {
          "204": { description: "Stored" },
          "400": { description: "Invalid key" },
          "401": { description: "Unauthorised" },
        },
      },
    },
    "/owner/holecards": {
      get: {
        tags: ["owner"],
        summary: "Fetch encrypted hole cards for the current owner",
        security: [{ bearerAuth: [] }, { cookieAuth: [] }],
        parameters: [
          { name: "tableId", in: "query", required: true, schema: { type: "string" } },
          { name: "handId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Encrypted cards" },
          "401": { description: "Unauthorised" },
          "404": { description: "Not found" },
        },
      },
    },
    "/dealer/deal": {
      post: {
        tags: ["dealer"],
        summary: "Trigger dealing for a hand",
        security: [{ dealerApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tableId", "handId", "vrfRandomness"],
                properties: {
                  tableId: { type: "string" },
                  handId: { type: "string" },
                  vrfRandomness: { type: "string" },
                  dealerSeed: { type: "string" },
                  encryptionKeys: { type: "object", additionalProperties: { type: "string" } },
                  seatOwners: { type: "object", additionalProperties: { type: "string" } },
                },
              },
            },
          },
        },
        responses: {
          "201": { description: "Dealt" },
          "400": { description: "Invalid params" },
          "409": { description: "Already dealt" },
        },
      },
    },
    "/dealer/commitments": {
      get: {
        tags: ["dealer"],
        summary: "Get dealer commitments for a hand",
        security: [{ dealerApiKey: [] }],
        parameters: [
          { name: "tableId", in: "query", required: true, schema: { type: "string" } },
          { name: "handId", in: "query", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Commitments" }, "404": { description: "Not dealt" } },
      },
    },
    "/dealer/reveal": {
      get: {
        tags: ["dealer"],
        summary: "Get reveal data for a seat at showdown",
        security: [{ dealerApiKey: [] }],
        parameters: [
          { name: "tableId", in: "query", required: true, schema: { type: "string" } },
          { name: "handId", in: "query", required: true, schema: { type: "string" } },
          { name: "seatIndex", in: "query", required: true, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Reveal" }, "404": { description: "Not found" } },
      },
    },
    "/dealer/hand": {
      delete: {
        tags: ["dealer"],
        summary: "Clean up hole cards for a completed hand",
        security: [{ dealerApiKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["tableId", "handId"],
                properties: { tableId: { type: "string" }, handId: { type: "string" } },
              },
            },
          },
        },
        responses: { "200": { description: "Deleted" } },
      },
    },
    "/reasoning": {
      post: {
        tags: ["reasoning"],
        summary: "Submit agent reasoning for a decision",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Stored" }, "400": { description: "Invalid" } },
      },
      get: {
        tags: ["reasoning"],
        summary: "Fetch agent reasoning entries",
        responses: { "200": { description: "Entries" } },
      },
    },
    "/treasury-reasoning": {
      post: {
        tags: ["reasoning"],
        summary: "Submit treasury rebalance reasoning",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Stored" } },
      },
      get: {
        tags: ["reasoning"],
        summary: "Fetch treasury rebalance reasoning",
        responses: { "200": { description: "Entries" } },
      },
    },
    "/commentary": {
      post: {
        tags: ["commentary"],
        summary: "Submit AI commentary for a hand event",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Stored" } },
      },
      get: {
        tags: ["commentary"],
        summary: "Fetch commentary entries",
        responses: { "200": { description: "Entries" } },
      },
    },
  },
});
