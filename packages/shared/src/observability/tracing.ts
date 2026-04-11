/**
 * OpenTelemetry distributed tracing initialisation for Node.js services/bots.
 *
 * Must be called BEFORE any other imports (instruments http, pg, express).
 *
 * Usage in entrypoint:
 *   import { initTracing } from "@playerco/shared";
 *   initTracing({ service: "indexer" }); // first line, before other imports
 *
 * Requires env vars (optional — no-ops if absent):
 *   OTEL_EXPORTER_ENDPOINT  — OTLP HTTP endpoint (e.g. Honeycomb, Tempo, Grafana Tempo)
 *   CHAIN_ENV               — "local" | "testnet" | "mainnet"
 *
 * Install OTel packages to enable (not workspace deps by default):
 *   pnpm add @opentelemetry/sdk-node @opentelemetry/auto-instrumentations-node \
 *            @opentelemetry/exporter-trace-otlp-http @opentelemetry/resources \
 *            @opentelemetry/semantic-conventions @opentelemetry/sdk-trace-base
 */

export interface TracingInitOptions {
  /** Service name shown in traces */
  service: string;
  /** Override OTLP endpoint */
  endpoint?: string;
  /** Trace sample rate 0-1 (default: 0.01 = 1%) */
  sampleRate?: number;
}

/**
 * Dynamically import an OTel package by name. Returns null if not installed.
 * Uses a computed module specifier to prevent TypeScript from checking the type
 * of packages that are only optional runtime dependencies.
 */
async function optionalImport(specifier: string): Promise<Record<string, unknown> | null> {
  try {
    // Computed string prevents TS from checking module resolution
    return await import(/* webpackIgnore: true */ specifier) as Record<string, unknown>;
  } catch {
    return null;
  }
}

/**
 * Initialise OpenTelemetry SDK with auto-instrumentation.
 * No-ops when OTEL_EXPORTER_ENDPOINT is not set or CHAIN_ENV is "local".
 * Gracefully handles missing OTel packages (logs a warning).
 */
export function initTracing(opts: TracingInitOptions): void {
  const endpoint = opts.endpoint ?? process.env.OTEL_EXPORTER_ENDPOINT;
  const environment = process.env.CHAIN_ENV ?? "local";
  const sampleRate = opts.sampleRate ?? 0.01; // 1% default

  // Skip in local or when endpoint not configured
  if (!endpoint || environment === "local") {
    return;
  }

  void (async () => {
    try {
      const sdkMod = await optionalImport("@opentelemetry/sdk-node");
      if (!sdkMod) {
        console.warn("[tracing] @opentelemetry/sdk-node not installed — tracing disabled");
        return;
      }

      const [autoMod, exporterMod, resourceMod, semconvMod, tracerMod] = await Promise.all([
        optionalImport("@opentelemetry/auto-instrumentations-node"),
        optionalImport("@opentelemetry/exporter-trace-otlp-http"),
        optionalImport("@opentelemetry/resources"),
        optionalImport("@opentelemetry/semantic-conventions"),
        optionalImport("@opentelemetry/sdk-trace-base"),
      ]);

      if (!autoMod || !exporterMod || !resourceMod || !semconvMod || !tracerMod) {
        console.warn("[tracing] Some OTel packages missing — tracing disabled");
        return;
      }

      /* eslint-disable @typescript-eslint/no-explicit-any */
      const NodeSDK = sdkMod["NodeSDK"] as any;
      const getNodeAutoInstrumentations = autoMod["getNodeAutoInstrumentations"] as any;
      const OTLPTraceExporter = exporterMod["OTLPTraceExporter"] as any;
      const Resource = resourceMod["Resource"] as any;
      const SEMRESATTRS_SERVICE_NAME = semconvMod["SEMRESATTRS_SERVICE_NAME"] as string;
      const TraceIdRatioBasedSampler = tracerMod["TraceIdRatioBasedSampler"] as any;
      /* eslint-enable @typescript-eslint/no-explicit-any */

      const instance = new NodeSDK({
        resource: new Resource({ [SEMRESATTRS_SERVICE_NAME]: opts.service }),
        traceExporter: new OTLPTraceExporter({ url: `${endpoint}/v1/traces` }),
        sampler: new TraceIdRatioBasedSampler(sampleRate),
        instrumentations: [getNodeAutoInstrumentations()],
      });

      instance.start();
      console.info(`[tracing] OTel initialised: service=${opts.service} sampleRate=${sampleRate}`);

      process.on("SIGTERM", async () => {
        await instance.shutdown().catch(console.error);
      });
    } catch (err) {
      console.warn("[tracing] OTel initialisation failed:", (err as Error).message);
    }
  })();
}
