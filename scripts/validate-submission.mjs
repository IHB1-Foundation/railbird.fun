#!/usr/bin/env node
// validate-submission.mjs — validate .initia/submission.json required fields.
// Usage: node scripts/validate-submission.mjs
// Exits 0 if all required fields are present and well-formed, non-zero otherwise.

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

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";
const ADDRESS_RE = /^0x[0-9a-fA-F]{40}$/;
const URL_RE = /^https?:\/\/.+/;
const VIDEO_RE =
  /^(https:\/\/(www\.)?youtube\.com\/watch\?.*v=.+|https:\/\/youtu\.be\/.+|https:\/\/www\.loom\.com\/.+|https:\/\/vimeo\.com\/.+|https?:\/\/.+\.mp4(\?.*)?)$/;

let data;
try {
  data = JSON.parse(readFileSync(submissionPath, "utf-8"));
} catch (err) {
  console.error(`ERROR: could not read ${submissionPath}: ${err.message}`);
  process.exit(1);
}

const errors = [];

// ── Presence checks ───────────────────────────────────────────────────────
for (const field of REQUIRED_FIELDS) {
  const value = data[field];
  if (value === undefined || value === null) {
    errors.push(`[${field}] Missing required field`);
  } else if (typeof value === "string" && value.trim() === "") {
    errors.push(`[${field}] Must not be empty`);
  } else if (Array.isArray(value) && value.length === 0) {
    errors.push(`[${field}] Must not be empty array`);
  }
}

// ── PLACEHOLDER check (bail on any field that still has a placeholder) ────
function checkNoPlaceholder(value, field) {
  if (typeof value === "string" && /PLACEHOLDER/i.test(value)) {
    errors.push(`[${field}] Contains PLACEHOLDER: "${value}"`);
  } else if (Array.isArray(value)) {
    value.forEach((item, i) => checkNoPlaceholder(item, `${field}[${i}]`));
  } else if (value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) {
      checkNoPlaceholder(v, `${field}.${k}`);
    }
  }
}
checkNoPlaceholder(data, "submission");

// ── Shape checks ──────────────────────────────────────────────────────────

// rollupChainId must be a positive integer (or numeric string)
if (data.rollupChainId !== undefined) {
  const n = Number(data.rollupChainId);
  if (!Number.isInteger(n) || n <= 0) {
    errors.push(`[rollupChainId] Must be a positive integer, got: "${data.rollupChainId}"`);
  }
}

// rpcUrl must be an http/https URL
if (data.rpcUrl !== undefined && !URL_RE.test(data.rpcUrl)) {
  errors.push(`[rpcUrl] Must be an http(s) URL, got: "${data.rpcUrl}"`);
}

// explorerUrl must be an http/https URL
if (data.explorerUrl !== undefined && !URL_RE.test(data.explorerUrl)) {
  errors.push(`[explorerUrl] Must be an http(s) URL, got: "${data.explorerUrl}"`);
}

// demoVideo must match known video hosting patterns
if (data.demoVideo !== undefined && !VIDEO_RE.test(data.demoVideo)) {
  errors.push(
    `[demoVideo] Must be a YouTube / Loom / Vimeo / direct MP4 URL, got: "${data.demoVideo}"`,
  );
}

// contracts: each address must be non-zero and match 0x + 40 hex chars
if (Array.isArray(data.contracts)) {
  data.contracts.forEach((c, i) => {
    if (!c.address) {
      errors.push(`[contracts[${i}].address] Missing`);
    } else if (!ADDRESS_RE.test(c.address)) {
      errors.push(`[contracts[${i}].address] Invalid format (need 0x + 40 hex): "${c.address}"`);
    } else if (c.address.toLowerCase() === ZERO_ADDRESS) {
      errors.push(`[contracts[${i}] "${c.name}"] Address is the zero address — deploy first`);
    }
  });
}

// tracks must include at least one of gaming/ai/defi
if (Array.isArray(data.tracks) && !data.tracks.some((t) => ["gaming", "ai", "defi"].includes(t))) {
  errors.push("[tracks] Must include at least one of: gaming, ai, defi");
}

// nativeFeatures must have at least one Initia-native feature
if (Array.isArray(data.nativeFeatures) && data.nativeFeatures.length === 0) {
  errors.push("[nativeFeatures] Must list at least one Initia-native feature");
}

// ── Result ────────────────────────────────────────────────────────────────
if (errors.length > 0) {
  console.error(`Submission validation FAILED (${errors.length} error(s)):`);
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
console.log("\nAll checks passed. Submission is ready for review.");
