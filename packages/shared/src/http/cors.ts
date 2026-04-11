/**
 * Minimal interface matching the subset of express types used here.
 * This keeps @playerco/shared free of an express dependency.
 */
interface CorsRequest {
  headers: Record<string, string | string[] | undefined>;
  method: string;
}

interface CorsResponse {
  header(name: string, value: string): this;
  status(code: number): this;
  end(): this;
}

type CorsNext = () => void;
type CorsHandler = (req: CorsRequest, res: CorsResponse, next: CorsNext) => void;

/**
 * Parse the CORS_ALLOWED_ORIGINS env var into an explicit origins list.
 *
 * Rules:
 * - Empty / undefined → [] (deny all non-explicit origins — fail-closed)
 * - "*"               → ["*"] (allow all — development only)
 * - "a,b,c"           → ["a", "b", "c"] (explicit allowlist)
 *
 * @param raw - Raw env var value (e.g. process.env.CORS_ALLOWED_ORIGINS)
 */
export function parseAllowedOrigins(raw?: string): string[] {
  if (!raw || raw.trim() === "") return [];
  if (raw.trim() === "*") return ["*"];
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Create a CORS middleware from an explicit origins list.
 *
 * Behaviour:
 * - If origins includes "*": set `Access-Control-Allow-Origin: *`
 * - If request origin is in the explicit list: echo it back (with Vary: Origin)
 * - Otherwise: no CORS headers set → browser enforces same-origin policy (deny-by-default)
 * - OPTIONS preflight always returns 204
 *
 * @param origins - Output of parseAllowedOrigins()
 * @param methods - Allowed methods string (default: "GET, POST, OPTIONS")
 * @param allowHeaders - Allowed request headers string
 */
export function createCorsMiddleware(
  origins: string[],
  methods = "GET, POST, OPTIONS",
  allowHeaders = "Content-Type, Authorization, X-Request-ID"
): CorsHandler {
  const allowAll = origins.includes("*");
  const originSet = new Set(origins.filter((o) => o !== "*"));

  return function corsMiddleware(req: CorsRequest, res: CorsResponse, next: CorsNext): void {
    const requestOrigin = req.headers["origin"];
    const origin = Array.isArray(requestOrigin) ? requestOrigin[0] : requestOrigin;

    if (allowAll) {
      res.header("Access-Control-Allow-Origin", "*");
      res.header("Access-Control-Allow-Methods", methods);
      res.header("Access-Control-Allow-Headers", allowHeaders);
    } else if (origin && originSet.has(origin)) {
      res.header("Access-Control-Allow-Origin", origin);
      res.header("Vary", "Origin");
      res.header("Access-Control-Allow-Methods", methods);
      res.header("Access-Control-Allow-Headers", allowHeaders);
      res.header("Access-Control-Allow-Credentials", "true");
    }
    // else: no CORS headers → browser blocks cross-origin requests (deny-by-default)

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  };
}
