#!/usr/bin/env node
// validate-submission.mjs — validate .initia/submission.json required fields.
// Usage: node scripts/validate-submission.mjs
// Exits 0 if all required fields are present, non-zero otherwise.

import { readFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const submissionPath = resolve(__dirname, "../.initia/submission.json");

const REQUIRED_FIELDS = [
  "name",
  "tagline",
  "description",
  "tracks",
  "repo",
  "demoUrl",
  "demoVideo",
  "contracts",
  "rollupChainId",
  "rpcUrl",
  "explorerUrl",
  "team",
  "contacts",
  "nativeFeatures",
];

let data;
try {
  data = JSON.parse(readFileSync(submissionPath, "utf-8"));
} catch (err) {
  console.error(`ERROR: could not read ${submissionPath}: ${err.message}`);
  process.exit(1);
}

const errors = [];

for (const field of REQUIRED_FIELDS) {
  const value = data[field];
  if (value === undefined || value === null) {
    errors.push(`Missing required field: ${field}`);
  } else if (typeof value === "string" && value.trim() === "") {
    errors.push(`Empty string for required field: ${field}`);
  } else if (Array.isArray(value) && value.length === 0) {
    errors.push(`Empty array for required field: ${field}`);
  }
}

// Extra check: tracks must include at least one of gaming/ai/defi
if (Array.isArray(data.tracks) && !data.tracks.some((t) => ["gaming", "ai", "defi"].includes(t))) {
  errors.push("tracks must include at least one of: gaming, ai, defi");
}

// Extra check: nativeFeatures must have at least one Initia-native feature
if (Array.isArray(data.nativeFeatures) && data.nativeFeatures.length === 0) {
  errors.push("nativeFeatures must list at least one Initia-native feature");
}

if (errors.length > 0) {
  console.error("Submission validation FAILED:");
  for (const err of errors) {
    console.error(`  ✗ ${err}`);
  }
  process.exit(1);
}

console.log("Submission validation PASSED:");
for (const field of REQUIRED_FIELDS) {
  const val = data[field];
  const preview = Array.isArray(val)
    ? `[${val.length} items]`
    : typeof val === "object"
      ? "{...}"
      : String(val).slice(0, 60);
  console.log(`  ✓ ${field}: ${preview}`);
}
console.log("\nAll required fields present. Submission is ready for review.");
