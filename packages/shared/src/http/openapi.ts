/**
 * Lightweight OpenAPI 3.0 spec helpers shared by HTTP services.
 *
 * Each service builds a static spec object and exposes it via:
 *   GET /openapi.json — raw spec
 *   GET /docs         — Swagger UI (mounted from `swagger-ui-express`)
 *
 * Validity is enforced in CI by `scripts/openapi/validate.mjs`, which loads
 * each spec and runs structural checks (root keys, unique paths, $ref targets).
 */

export interface OpenApiInfo {
  title: string;
  version: string;
  description?: string;
}

export interface OpenApiServer {
  url: string;
  description?: string;
}

export type OpenApiSpec = {
  openapi: "3.0.3";
  info: OpenApiInfo;
  servers: OpenApiServer[];
  tags?: Array<{ name: string; description?: string }>;
  paths: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    securitySchemes?: Record<string, unknown>;
  };
};

export function buildOpenApiSpec(spec: Omit<OpenApiSpec, "openapi">): OpenApiSpec {
  return { openapi: "3.0.3", ...spec };
}

/**
 * Minimal structural validation. Returns an array of error strings (empty = valid).
 * Used by the CI validator and by tests so we don't pull in `swagger-cli`.
 */
export function validateOpenApiSpec(spec: unknown): string[] {
  const errors: string[] = [];
  if (typeof spec !== "object" || spec === null) {
    return ["spec must be an object"];
  }
  const s = spec as Record<string, unknown>;
  if (s["openapi"] !== "3.0.3") errors.push(`openapi must be "3.0.3"`);
  const info = s["info"] as Record<string, unknown> | undefined;
  if (!info || typeof info["title"] !== "string" || typeof info["version"] !== "string") {
    errors.push("info.title and info.version are required strings");
  }
  if (!Array.isArray(s["servers"]) || (s["servers"] as unknown[]).length === 0) {
    errors.push("servers must be a non-empty array");
  }
  const paths = s["paths"];
  if (typeof paths !== "object" || paths === null) {
    errors.push("paths must be an object");
  } else {
    for (const [route, ops] of Object.entries(paths as Record<string, unknown>)) {
      if (!route.startsWith("/")) errors.push(`path "${route}" must start with /`);
      if (typeof ops !== "object" || ops === null) {
        errors.push(`path "${route}" must map methods to operation objects`);
      }
    }
  }
  return errors;
}
