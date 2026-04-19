/**
 * Feature flags for Initia-specific functionality.
 * All NEXT_PUBLIC_ENABLE_* reads flow through this module so defaults are explicit.
 */

/** Resolve .init usernames in leaderboard, seat panels, and agent pages. */
export const ENABLE_INIT_USERNAMES = process.env.NEXT_PUBLIC_ENABLE_INIT_USERNAMES !== "false";

/** Auto-sign session UX (InterwovenKit) — 30-min session eliminates per-action popups. */
export const ENABLE_AUTOSIGN =
  process.env.NEXT_PUBLIC_CHAIN_ENV === "initia-testnet" &&
  process.env.NEXT_PUBLIC_ENABLE_AUTOSIGN !== "false";

/** In-app nad.fun / DEX trading widget. Disabled on Initia until a DEX is live. */
export const ENABLE_TRADING_WIDGET = process.env.NEXT_PUBLIC_ENABLE_TRADING_WIDGET === "true";
