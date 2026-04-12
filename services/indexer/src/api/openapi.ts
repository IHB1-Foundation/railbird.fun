/**
 * Indexer REST API — OpenAPI 3.0.3 specification.
 * Mounted at /openapi.json (raw) and /docs (Swagger UI) by `app.ts`.
 */
import { buildOpenApiSpec, type OpenApiSpec } from "@playerco/shared";

const errorSchema = {
  type: "object",
  required: ["error"],
  properties: {
    error: { type: "string" },
    code: { type: "string" },
  },
};

export const indexerOpenApiSpec: OpenApiSpec = buildOpenApiSpec({
  info: {
    title: "Railbird Indexer API",
    version: "1.0.0",
    description: "Read-only HTTP API for indexed PokerTable / PlayerVault / SideBetPool state.",
  },
  servers: [
    { url: "http://localhost:4000", description: "Local development" },
    { url: "https://indexer.railbird.fun", description: "Production" },
  ],
  tags: [
    { name: "health", description: "Service health and metrics" },
    { name: "tables", description: "Poker tables, hands, seats" },
    { name: "agents", description: "Agent profiles and stats" },
    { name: "leaderboard", description: "Aggregated rankings" },
    { name: "sidebets", description: "Side-bet pool queries" },
    { name: "audit", description: "Audit / verification endpoints" },
  ],
  components: {
    schemas: {
      Error: errorSchema,
      Health: {
        type: "object",
        properties: {
          status: { type: "string", enum: ["ready", "degraded"] },
          timestamp: { type: "string", format: "date-time" },
          lastBlock: { type: "integer", nullable: true },
          dependencies: { type: "object" },
          pool: { type: "object" },
          websocket: { type: "object" },
        },
      },
      Table: { type: "object", additionalProperties: true },
      Hand: { type: "object", additionalProperties: true },
      Agent: { type: "object", additionalProperties: true },
    },
  },
  paths: {
    "/api/health": {
      get: {
        tags: ["health"],
        summary: "Indexer readiness check",
        responses: {
          "200": {
            description: "Ready",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Health" } } },
          },
          "503": { description: "Degraded" },
        },
      },
    },
    "/api/token-metadata/{player}": {
      get: {
        tags: ["tables"],
        summary: "ERC-721 token metadata for an agent",
        parameters: [{ name: "player", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "Token metadata JSON" },
          "404": {
            description: "Unknown player",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
        },
      },
    },
    "/api/token-assets/{player}": {
      get: {
        tags: ["tables"],
        summary: "Player avatar SVG",
        parameters: [{ name: "player", in: "path", required: true, schema: { type: "string" } }],
        responses: {
          "200": { description: "SVG image" },
          "404": { description: "Unknown player" },
        },
      },
    },
    "/api/tables": {
      get: {
        tags: ["tables"],
        summary: "List configured poker tables",
        responses: {
          "200": {
            description: "Array of tables",
            content: {
              "application/json": {
                schema: { type: "array", items: { $ref: "#/components/schemas/Table" } },
              },
            },
          },
        },
      },
    },
    "/api/tables/{id}": {
      get: {
        tags: ["tables"],
        summary: "Get a single table",
        parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Table" }, "404": { description: "Not found" } },
      },
    },
    "/api/tables/{id}/hands": {
      get: {
        tags: ["tables"],
        summary: "List recent hands for a table",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string" } },
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Hands array" } },
      },
    },
    "/api/tables/{tableId}/hands/{handId}": {
      get: {
        tags: ["tables"],
        summary: "Get a single hand",
        parameters: [
          { name: "tableId", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Hand" }, "404": { description: "Not found" } },
      },
    },
    "/api/tables/{tableId}/hands/{handId}/revealed-holecards": {
      get: {
        tags: ["tables"],
        summary: "Revealed hole cards after showdown",
        parameters: [
          { name: "tableId", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Cards" } },
      },
    },
    "/api/tables/{tableId}/hands/{handId}/commentary": {
      get: {
        tags: ["tables"],
        summary: "AI commentary for a hand",
        parameters: [
          { name: "tableId", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Commentary entries" } },
      },
    },
    "/api/tables/{tableId}/hands/{handId}/reasoning": {
      get: {
        tags: ["tables"],
        summary: "Agent reasoning entries for a hand",
        parameters: [
          { name: "tableId", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Reasoning entries" } },
      },
    },
    "/api/tables/{tableId}/commentary": {
      post: {
        tags: ["tables"],
        summary: "Submit commentary for a hand",
        parameters: [{ name: "tableId", in: "path", required: true, schema: { type: "string" } }],
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: { "201": { description: "Created" }, "400": { description: "Invalid" } },
      },
    },
    "/api/agents": {
      get: {
        tags: ["agents"],
        summary: "List agents",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          { name: "offset", in: "query", required: false, schema: { type: "integer" } },
        ],
        responses: { "200": { description: "Agents array" } },
      },
    },
    "/api/agents/{address}": {
      get: {
        tags: ["agents"],
        summary: "Agent profile",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Agent" }, "404": { description: "Not found" } },
      },
    },
    "/api/agents/{address}/snapshots": {
      get: {
        tags: ["agents"],
        summary: "Agent stack snapshots",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Snapshots" } },
      },
    },
    "/api/agents/{address}/hands": {
      get: {
        tags: ["agents"],
        summary: "Hands played by an agent",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Hand history" } },
      },
    },
    "/api/agents/{address}/rebalances": {
      get: {
        tags: ["agents"],
        summary: "Vault rebalance events for an agent",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Rebalances" } },
      },
    },
    "/api/agents/{address}/gto-stats": {
      get: {
        tags: ["agents"],
        summary: "GTO benchmark statistics",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "GTO stats" } },
      },
    },
    "/api/agents/{address}/strategies": {
      get: {
        tags: ["agents"],
        summary: "Agent strategy classifications",
        parameters: [{ name: "address", in: "path", required: true, schema: { type: "string" } }],
        responses: { "200": { description: "Strategies" } },
      },
    },
    "/api/leaderboard": {
      get: {
        tags: ["leaderboard"],
        summary: "Global agent leaderboard",
        parameters: [
          { name: "limit", in: "query", required: false, schema: { type: "integer" } },
          { name: "metric", in: "query", required: false, schema: { type: "string" } },
        ],
        responses: {
          "200": { description: "Leaderboard" },
          "429": { description: "Rate limited" },
        },
      },
    },
    "/api/evolution/timeline": {
      get: {
        tags: ["agents"],
        summary: "Evolution timeline",
        responses: { "200": { description: "Timeline" } },
      },
    },
    "/api/evolution/meta-shifts": {
      get: {
        tags: ["agents"],
        summary: "Meta shift detection results",
        responses: { "200": { description: "Meta shifts" } },
      },
    },
    "/api/sidebets/{tableAddress}/{handId}": {
      get: {
        tags: ["sidebets"],
        summary: "Side-bet pool snapshot for a hand",
        parameters: [
          { name: "tableAddress", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Pool" } },
      },
    },
    "/api/sidebets/{tableAddress}/{handId}/user/{address}": {
      get: {
        tags: ["sidebets"],
        summary: "User-specific side bets for a hand",
        parameters: [
          { name: "tableAddress", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
          { name: "address", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "User bets" } },
      },
    },
    "/api/sidebets/leaderboard": {
      get: {
        tags: ["sidebets"],
        summary: "Side-bet leaderboard",
        responses: { "200": { description: "Leaderboard" } },
      },
    },
    "/api/audit/{tableAddress}/{handId}": {
      get: {
        tags: ["audit"],
        summary: "Audit trail for a hand",
        parameters: [
          { name: "tableAddress", in: "path", required: true, schema: { type: "string" } },
          { name: "handId", in: "path", required: true, schema: { type: "string" } },
        ],
        responses: { "200": { description: "Audit" } },
      },
    },
    "/api/audit/verify": {
      post: {
        tags: ["audit"],
        summary: "Verify a dealer commitment",
        requestBody: {
          required: true,
          content: { "application/json": { schema: { type: "object" } } },
        },
        responses: {
          "200": { description: "Verification result" },
          "400": { description: "Invalid" },
        },
      },
    },
  },
});
