/**
 * Fleet REST API — OpenAPI 3.0.3 specification.
 * Mounted at /openapi.json (raw) and /docs (Swagger UI) by `index.ts`.
 */
import { buildOpenApiSpec, type OpenApiSpec } from "@playerco/shared";

export const fleetOpenApiSpec: OpenApiSpec = buildOpenApiSpec({
  info: {
    title: "Railbird Fleet API",
    version: "1.0.0",
    description: "Spawn and manage agent bot processes against pooled operator wallets.",
  },
  servers: [
    { url: "http://localhost:3003", description: "Local development" },
    { url: "https://fleet.railbird.fun", description: "Production" },
  ],
  tags: [
    { name: "health", description: "Service health" },
    { name: "agents", description: "Spawned agent processes" },
    { name: "wallets", description: "Operator wallet pool" },
  ],
  components: {
    schemas: {
      Error: {
        type: "object",
        required: ["error"],
        properties: { error: { type: "string" } },
      },
      AgentStatus: {
        type: "object",
        properties: {
          agentId: { type: "string", format: "uuid" },
          operatorAddress: { type: "string" },
          tableAddress: { type: "string" },
          ownerAddress: { type: "string" },
          personaName: { type: "string" },
          personaEmoji: { type: "string" },
          status: { type: "string", enum: ["starting", "running", "stopped", "crashed"] },
          pid: { type: "integer", nullable: true },
          restarts: { type: "integer" },
          createdAt: { type: "integer" },
        },
      },
    },
  },
  paths: {
    "/health": {
      get: {
        tags: ["health"],
        summary: "Service health",
        responses: { "200": { description: "Healthy" } },
      },
    },
    "/fleet/agents": {
      post: {
        tags: ["agents"],
        summary: "Spawn a new agent against an available operator wallet",
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["ownerAddress", "tableAddress", "personaConfig"],
                properties: {
                  ownerAddress: { type: "string" },
                  tableAddress: { type: "string" },
                  personaConfig: {
                    type: "object",
                    required: ["name"],
                    properties: { name: { type: "string" }, emoji: { type: "string" } },
                  },
                },
              },
            },
          },
        },
        responses: {
          "201": {
            description: "Agent spawned",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agentId: { type: "string", format: "uuid" },
                    operatorAddress: { type: "string" },
                    status: { type: "string" },
                  },
                },
              },
            },
          },
          "400": {
            description: "Missing fields",
            content: { "application/json": { schema: { $ref: "#/components/schemas/Error" } } },
          },
          "503": { description: "No wallets available" },
        },
      },
      get: {
        tags: ["agents"],
        summary: "List spawned agents",
        responses: {
          "200": {
            description: "Agents",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    agents: { type: "array", items: { $ref: "#/components/schemas/AgentStatus" } },
                  },
                },
              },
            },
          },
        },
      },
    },
    "/fleet/agents/{id}": {
      get: {
        tags: ["agents"],
        summary: "Get agent status",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: {
          "200": {
            description: "Agent status",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/AgentStatus" },
              },
            },
          },
          "404": { description: "Not found" },
        },
      },
      delete: {
        tags: ["agents"],
        summary: "Stop an agent and release its wallet",
        parameters: [
          { name: "id", in: "path", required: true, schema: { type: "string", format: "uuid" } },
        ],
        responses: { "200": { description: "Stopped" }, "404": { description: "Not found" } },
      },
    },
    "/fleet/wallets/available": {
      get: {
        tags: ["wallets"],
        summary: "Wallet pool capacity",
        responses: {
          "200": {
            description: "Counts",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  properties: {
                    available: { type: "integer" },
                    total: { type: "integer" },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
});
