#!/usr/bin/env node
/**
 * OpenAPI spec validator — runs in CI to ensure every service exposes a
 * structurally valid OpenAPI 3.0.3 document. We avoid `swagger-cli` to keep
 * the dependency footprint small; structural checks live in shared.
 */

import { fileURLToPath, pathToFileURL } from "node:url";
import { dirname, resolve } from "node:path";
import { existsSync } from "node:fs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const repoRoot = resolve(__dirname, "..", "..");

const services = [
  {
    name: "indexer",
    spec: "services/indexer/dist/api/openapi.js",
    exportName: "indexerOpenApiSpec",
  },
  {
    name: "ownerview",
    spec: "services/ownerview/dist/openapi.js",
    exportName: "ownerviewOpenApiSpec",
  },
  {
    name: "fleet",
    spec: "services/fleet/dist/openapi.js",
    exportName: "fleetOpenApiSpec",
  },
];

const { validateOpenApiSpec } = await import(
  pathToFileURL(resolve(repoRoot, "packages/shared/dist/http/openapi.js")).href
);

let failed = 0;
for (const svc of services) {
  const path = resolve(repoRoot, svc.spec);
  if (!existsSync(path)) {
    console.error(`✗ ${svc.name}: missing ${svc.spec} (run \`pnpm build\` first)`);
    failed += 1;
    continue;
  }
  const mod = await import(pathToFileURL(path).href);
  const spec = mod[svc.exportName];
  if (!spec) {
    console.error(`✗ ${svc.name}: missing export ${svc.exportName}`);
    failed += 1;
    continue;
  }
  const errors = validateOpenApiSpec(spec);
  if (errors.length > 0) {
    console.error(`✗ ${svc.name}:`);
    for (const e of errors) console.error(`    ${e}`);
    failed += 1;
  } else {
    const paths = Object.keys(spec.paths ?? {}).length;
    console.log(`✓ ${svc.name}: ${paths} paths`);
  }
}

if (failed > 0) {
  console.error(`\n${failed} spec(s) failed validation`);
  process.exit(1);
}
console.log("\nAll OpenAPI specs are structurally valid.");
