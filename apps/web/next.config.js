/** @type {import('next').NextConfig} */
const isDev = process.env.NODE_ENV !== "production";

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
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
          // Content Security Policy
          {
            key: "Content-Security-Policy",
            value: [
              "default-src 'self'",
              // Allow Next.js inline scripts and eval in dev
              isDev
                ? "script-src 'self' 'unsafe-inline' 'unsafe-eval'"
                : "script-src 'self' 'unsafe-inline'",
              "style-src 'self' 'unsafe-inline'",
              // Wallet providers inject images and connect to RPC endpoints
              "img-src 'self' data: blob: https:",
              // WebSocket connections for live table updates, RPC calls
              "connect-src 'self' wss: ws: https:",
              "font-src 'self' data:",
              "frame-src 'none'",
              "object-src 'none'",
              "base-uri 'self'",
              "form-action 'self'",
            ].join("; "),
          },
          // Block dangerous browser features
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
