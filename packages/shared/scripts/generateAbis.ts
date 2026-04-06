#!/usr/bin/env tsx
/**
 * ABI generation script.
 * Reads compiled Foundry artifacts from contracts/out/ and writes
 * TypeScript ABI files to packages/shared/src/abis/.
 *
 * Usage:
 *   pnpm --filter @playerco/shared generate-abis
 * or:
 *   cd packages/shared && npx tsx scripts/generateAbis.ts
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..", "..", "..");
const ARTIFACTS_ROOT = join(REPO_ROOT, "contracts", "out");
const OUT_DIR = join(__dirname, "..", "src", "abis");

interface AbiEntry {
  type: string;
  name?: string;
  inputs?: Array<{ name: string; type: string; internalType?: string; components?: unknown[] }>;
  outputs?: Array<{ name: string; type: string; internalType?: string; components?: unknown[] }>;
  stateMutability?: string;
  anonymous?: boolean;
}

/** Strip internalType fields for a cleaner TypeScript output. */
function stripInternalTypes(abi: AbiEntry[]): AbiEntry[] {
  return JSON.parse(
    JSON.stringify(abi, (key, value) => (key === "internalType" ? undefined : value))
  );
}

function loadAbi(contractDir: string, contractName: string): AbiEntry[] {
  const path = join(ARTIFACTS_ROOT, contractDir, `${contractName}.json`);
  const artifact = JSON.parse(readFileSync(path, "utf-8")) as { abi: AbiEntry[] };
  return stripInternalTypes(artifact.abi);
}

function writeAbiFile(filename: string, exportName: string, abi: AbiEntry[]): void {
  const content = `// Auto-generated from Foundry artifacts. Do not edit manually.
// Run: pnpm --filter @playerco/shared generate-abis
export const ${exportName} = ${JSON.stringify(abi, null, 2)} as const;
`;
  writeFileSync(join(OUT_DIR, filename), content, "utf-8");
  console.log(`  Written: ${filename} (${abi.length} entries)`);
}

// Ensure output directory exists
mkdirSync(OUT_DIR, { recursive: true });

console.log("Generating ABIs from Foundry artifacts...");

// PokerTable
const pokerTableAbi = loadAbi("PokerTable.sol", "PokerTable");
writeAbiFile("pokerTable.ts", "POKER_TABLE_ABI", pokerTableAbi);

// PlayerRegistry
const playerRegistryAbi = loadAbi("PlayerRegistry.sol", "PlayerRegistry");
writeAbiFile("playerRegistry.ts", "PLAYER_REGISTRY_ABI", playerRegistryAbi);

// PlayerVault
const playerVaultAbi = loadAbi("PlayerVault.sol", "PlayerVault");
writeAbiFile("playerVault.ts", "PLAYER_VAULT_ABI", playerVaultAbi);

// Write index
const indexContent = `// Auto-generated ABI exports
export { POKER_TABLE_ABI } from "./pokerTable.js";
export { PLAYER_REGISTRY_ABI } from "./playerRegistry.js";
export { PLAYER_VAULT_ABI } from "./playerVault.js";
`;
writeFileSync(join(OUT_DIR, "index.ts"), indexContent, "utf-8");
console.log("  Written: index.ts");

console.log("Done.");
