/** @type {import('next').NextConfig} */
// NOTE: Content-Security-Policy is handled per-request in src/middleware.ts
// so that production builds can use a nonce-based policy without `'unsafe-inline'`.
// The static headers below apply only the non-CSP security headers.
import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV !== "production";
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  webpack: (config, { isServer }) => {
    if (!isServer) {
      // prom-client (from @playerco/shared metrics) uses Node built-ins
      // that don't exist in the browser. Stub them out.
      config.resolve.fallback = {
        ...config.resolve.fallback,
        cluster: false,
        fs: false,
        net: false,
        tls: false,
        v8: false,
        os: false,
        path: false,
        stream: false,
        http: false,
        https: false,
        zlib: false,
        // abiVersion.js uses node:crypto (server-only); stub in browser
        crypto: false,
      };
      // Handle node: protocol URIs — strip prefix so fallback map applies
      // e.g. "node:crypto" → "crypto" which is then caught by fallback: { crypto: false }
      const { NormalModuleReplacementPlugin } = await import("webpack");
      config.plugins.push(
        new NormalModuleReplacementPlugin(/^node:(.+)$/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        })
      );
    }
    return config;
  },
  // Environment variables for client-side use
  env: {
    // Indexer API — default to localhost in development to prevent
    // accidentally hitting production APIs when env vars are omitted.
    NEXT_PUBLIC_INDEXER_URL:
      process.env.NEXT_PUBLIC_INDEXER_URL || (isDev ? "http://localhost:3001" : "https://indexer.railbird.fun"),
    NEXT_PUBLIC_OWNERVIEW_URL:
      process.env.NEXT_PUBLIC_OWNERVIEW_URL || (isDev ? "http://localhost:4000" : "https://ownerview.railbird.fun"),
    // Chain config
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet.hsk.xyz",
    NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || "133",
    NEXT_PUBLIC_BLOCK_EXPLORER: process.env.NEXT_PUBLIC_BLOCK_EXPLORER || "https://testnet-explorer.hsk.xyz",
    // nad.fun contract addresses — leave empty when DEX is not available (disables widget)
    NEXT_PUBLIC_NADFUN_LENS_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS || "",
    NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS || "",
    NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS || "",
    NEXT_PUBLIC_WMON_ADDRESS: process.env.NEXT_PUBLIC_WMON_ADDRESS || "",
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent clickjacking
          { key: "X-Frame-Options", value: "DENY" },
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Enforce HTTPS
          { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
          // Don't send Referer to cross-origin requests
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // Block dangerous browser features
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default withBundleAnalyzer(nextConfig);
