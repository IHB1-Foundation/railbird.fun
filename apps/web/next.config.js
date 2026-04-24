/** @type {import('next').NextConfig} */
// NOTE: Content-Security-Policy is handled per-request in src/middleware.ts
// so that production builds can use a nonce-based policy without `'unsafe-inline'`.
// The static headers below apply only the non-CSP security headers.
import bundleAnalyzer from "@next/bundle-analyzer";

const isDev = process.env.NODE_ENV !== "production";
const withBundleAnalyzer = bundleAnalyzer({ enabled: process.env.ANALYZE === "true" });
const DEFAULT_PUBLIC_APP_URL = "https://www.railbird.fun";
const DEFAULT_INDEXER_URL = "https://indexer-production-7498.up.railway.app";
const DEFAULT_OWNERVIEW_URL = "https://ownerview-production-496d.up.railway.app";
const DEFAULT_RPC_URL = isDev
  ? process.env.RPC_URL || "http://localhost:8545"
  : "https://rollup-node-production.up.railway.app";
const DEFAULT_CHAIN_ID = isDev
  ? process.env.INITIA_CHAIN_ID || process.env.CHAIN_ID || "31337"
  : "241167961210297";
const DEFAULT_CHAIN_ENV = isDev ? "local" : "initia-testnet";
const DEFAULT_CHAIN_NAME = "Railbird Rollup (Initia)";
const DEFAULT_NATIVE_SYMBOL = "INIT";
const DEFAULT_CHIP_SYMBOL = "RCHIP";
const DEFAULT_INTERWOVEN_CHAIN_ID = process.env.INITIA_COSMOS_CHAIN_ID || "railbird-1";
const DEFAULT_TABLE_MAX_SEATS = "9";
const DEFAULT_BLOCK_EXPLORER = "https://scan.testnet.initia.xyz";

const publicEnv = {
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || DEFAULT_PUBLIC_APP_URL,
  NEXT_PUBLIC_CHAIN_ENV: process.env.NEXT_PUBLIC_CHAIN_ENV || DEFAULT_CHAIN_ENV,
  // Indexer API — default to localhost in development to prevent
  // accidentally hitting production APIs when env vars are omitted.
  NEXT_PUBLIC_INDEXER_URL:
    process.env.NEXT_PUBLIC_INDEXER_URL || (isDev ? "http://localhost:3002" : DEFAULT_INDEXER_URL),
  NEXT_PUBLIC_OWNERVIEW_URL:
    process.env.NEXT_PUBLIC_OWNERVIEW_URL ||
    (isDev ? "http://localhost:3001" : DEFAULT_OWNERVIEW_URL),
  // Chain config
  NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || DEFAULT_RPC_URL,
  NEXT_PUBLIC_CHAIN_ID: process.env.NEXT_PUBLIC_CHAIN_ID || DEFAULT_CHAIN_ID,
  NEXT_PUBLIC_INTERWOVEN_CHAIN_ID:
    process.env.NEXT_PUBLIC_INTERWOVEN_CHAIN_ID || DEFAULT_INTERWOVEN_CHAIN_ID,
  NEXT_PUBLIC_CHAIN_NAME: process.env.NEXT_PUBLIC_CHAIN_NAME || DEFAULT_CHAIN_NAME,
  NEXT_PUBLIC_NATIVE_SYMBOL: process.env.NEXT_PUBLIC_NATIVE_SYMBOL || DEFAULT_NATIVE_SYMBOL,
  NEXT_PUBLIC_BLOCK_EXPLORER: process.env.NEXT_PUBLIC_BLOCK_EXPLORER || DEFAULT_BLOCK_EXPLORER,
  NEXT_PUBLIC_CHIP_SYMBOL: process.env.NEXT_PUBLIC_CHIP_SYMBOL || DEFAULT_CHIP_SYMBOL,
  NEXT_PUBLIC_TABLE_MAX_SEATS: process.env.NEXT_PUBLIC_TABLE_MAX_SEATS || DEFAULT_TABLE_MAX_SEATS,
  NEXT_PUBLIC_ENABLE_TRADING_WIDGET: process.env.NEXT_PUBLIC_ENABLE_TRADING_WIDGET || "false",
  NEXT_PUBLIC_ENABLE_AUTOSIGN: process.env.NEXT_PUBLIC_ENABLE_AUTOSIGN || "false",
  NEXT_PUBLIC_ENABLE_INTERWOVEN_KIT: process.env.NEXT_PUBLIC_ENABLE_INTERWOVEN_KIT || "false",
  NEXT_PUBLIC_ENABLE_INIT_USERNAMES: process.env.NEXT_PUBLIC_ENABLE_INIT_USERNAMES || "true",
};

if (!isDev && publicEnv.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet") {
  const requiredPublicEnv = [
    "NEXT_PUBLIC_INDEXER_URL",
    "NEXT_PUBLIC_OWNERVIEW_URL",
    "NEXT_PUBLIC_RPC_URL",
    "NEXT_PUBLIC_CHAIN_ID",
  ];
  const missing = requiredPublicEnv.filter((name) => !publicEnv[name]);
  if (missing.length > 0) {
    throw new Error(
      `Missing required Initia public env vars for production build: ${missing.join(", ")}`,
    );
  }
}

const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

  webpack: (config, { isServer, webpack }) => {
    config.ignoreWarnings = [
      ...(config.ignoreWarnings ?? []),
      {
        module: /@opentelemetry\/instrumentation\/build\/esm\/platform\/node\/instrumentation\.js$/,
        message: /Critical dependency: the request of a dependency is an expression/,
      },
    ];

    config.plugins.push(
      new webpack.NormalModuleReplacementPlugin(/^cosmjs-types\/(.+)\.js$/, (resource) => {
        resource.request = resource.request.replace(/\.js$/, "");
      }),
    );

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
        // @sentry/node-core's import-in-the-middle uses node:module
        module: false,
        worker_threads: false,
        diagnostics_channel: false,
        async_hooks: false,
        url: false,
        util: false,
        buffer: false,
        events: false,
        querystring: false,
        string_decoder: false,
        perf_hooks: false,
        readline: false,
        child_process: false,
        process: false,
      };
      // Handle node: protocol URIs — strip prefix so fallback map applies
      // e.g. "node:crypto" → "crypto" which is then caught by fallback: { crypto: false }
      config.plugins.push(
        new webpack.NormalModuleReplacementPlugin(/^node:(.+)$/, (resource) => {
          resource.request = resource.request.replace(/^node:/, "");
        }),
      );
      // T-1903: @sentry/node and friends are server-only. The shared package's
      // observability/sentry.ts uses await import(), but webpack still
      // statically bundles dynamic-import targets. Ignore them on the client.
      config.plugins.push(
        new webpack.IgnorePlugin({
          resourceRegExp: /^@sentry\/(node|node-core|opentelemetry)/,
        }),
        new webpack.IgnorePlugin({
          resourceRegExp: /^@opentelemetry\/(sdk-node|exporter-otlp-http|instrumentation-)/,
        }),
        new webpack.IgnorePlugin({ resourceRegExp: /^import-in-the-middle/ }),
        new webpack.IgnorePlugin({ resourceRegExp: /^require-in-the-middle/ }),
        new webpack.IgnorePlugin({ resourceRegExp: /^@fastify\/otel/ }),
        new webpack.IgnorePlugin({ resourceRegExp: /^pino$/ }),
        new webpack.IgnorePlugin({ resourceRegExp: /^pg$/ }),
      );
    }
    return config;
  },
  // Environment variables for client-side use
  env: publicEnv,

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          // Prevent MIME-type sniffing
          { key: "X-Content-Type-Options", value: "nosniff" },
          // Enforce HTTPS
          {
            key: "Strict-Transport-Security",
            value: "max-age=63072000; includeSubDomains; preload",
          },
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
