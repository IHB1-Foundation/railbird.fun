/**
 * Common environment variable parsing utilities shared across all bots and services.
 *
 * These replace per-package duplicates in keeper, agent, and vrf-operator entry points.
 */

import type { Address } from "./types.js";

/** Validated 32-byte private key as 0x-prefixed hex string. */
export type Hex = `0x${string}`;

/**
 * Read and validate a private key from an environment variable.
 * Throws with a descriptive message if the variable is missing or malformed.
 */
export function validatePrivateKey(envName: string): Hex {
  const raw = process.env[envName] ?? "";
  if (!raw) {
    throw new Error(
      `${envName} is empty. Set a valid 32-byte hex private key.`
    );
  }
  const stripped = raw.startsWith("0x") ? raw.slice(2) : raw;
  if (!/^[0-9a-fA-F]+$/.test(stripped) || stripped.length !== 64) {
    throw new Error(
      `${envName} is invalid: must be a 32-byte hex string (64 hex chars, optionally 0x-prefixed). Got length ${stripped.length}.`
    );
  }
  return `0x${stripped}` as Hex;
}

/**
 * Parse comma-separated table addresses from an environment variable.
 * Falls back to POKER_TABLE_ADDRESS (single) when the multi-address variable is absent.
 * @param envName   Primary env var name (defaults to "POKER_TABLE_ADDRESSES")
 * @param fallback  Single-address fallback env var name (defaults to "POKER_TABLE_ADDRESS")
 */
export function parseTableAddresses(
  envName = "POKER_TABLE_ADDRESSES",
  fallback = "POKER_TABLE_ADDRESS"
): Address[] {
  const multi = process.env[envName];
  if (multi) {
    const addresses = multi
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean) as Address[];
    if (addresses.length === 0) {
      throw new Error(
        `${envName} is set but contains no valid addresses`
      );
    }
    return addresses;
  }
  const single = process.env[fallback];
  if (single) {
    return [single.trim() as Address];
  }
  throw new Error(
    `Missing required environment variable: ${envName} (or ${fallback})`
  );
}

/**
 * Parse a positive integer from an environment variable, returning a fallback if absent or invalid.
 */
export function parsePositiveInt(envName: string, fallback: number): number {
  const raw = process.env[envName];
  if (!raw) return fallback;
  const value = Number.parseInt(raw, 10);
  if (Number.isNaN(value) || value < 0) return fallback;
  return value;
}

/**
 * Return an environment variable's value, or a fallback string if absent.
 */
export function optionalEnv(name: string, fallback: string): string {
  return process.env[name] || fallback;
}
