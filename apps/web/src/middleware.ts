import { NextResponse, type NextRequest } from "next/server";

/**
 * Middleware: per-request Content-Security-Policy with nonce.
 *
 * In production, replaces `'unsafe-inline'` with `'nonce-<random>'` +
 * `'strict-dynamic'` so script injection via inline scripts is blocked.
 * In development, a relaxed policy allows Next.js HMR and eval.
 *
 * Next.js App Router propagates the `x-nonce` request header to server
 * components so they can stamp the nonce onto any <Script> elements.
 */
export function middleware(request: NextRequest) {
  const isProd = process.env.NODE_ENV === "production";

  // Generate a cryptographically random nonce for this request.
  const nonce = crypto.randomUUID().replace(/-/g, "");

  const scriptSrc = isProd
    ? `'nonce-${nonce}' 'strict-dynamic'`
    : "'self' 'unsafe-inline' 'unsafe-eval'";

  const csp = [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "connect-src 'self' wss: ws: https:",
    "font-src 'self' data:",
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");

  // Forward nonce to server components via request header.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // Set the CSP response header (overrides next.config.js static CSP).
  response.headers.set("Content-Security-Policy", csp);

  return response;
}

export const config = {
  matcher: [
    // Run on all paths except Next.js internals and static assets.
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
