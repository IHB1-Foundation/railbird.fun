/**
 * Builds the Interwoven Bridge deeplink URL.
 *
 * Parameters verified against app.initia.xyz/bridge on 2026-04-19:
 *   toChainId  — decimal integer chain ID of the destination rollup
 *   toAddress  — recipient address on the destination chain
 *
 * Note: the previous code used the undefined env var NEXT_PUBLIC_INITIA_CHAIN_ID;
 * the correct var is NEXT_PUBLIC_CHAIN_ID (set by CHAIN_ENV=initia-testnet config).
 */
export function buildBridgeUrl(chainId: string | number, toAddress: string): string {
  const base = "https://app.initia.xyz/bridge";
  const params = new URLSearchParams({
    toChainId: String(chainId),
    toAddress,
  });
  return `${base}?${params.toString()}`;
}

/** Returns the bridge URL for the current rollup config, or null when chain ID is not configured. */
export function getRollupBridgeUrl(toAddress: string): string | null {
  const chainId = process.env.NEXT_PUBLIC_CHAIN_ID;
  if (!chainId) return null;
  return buildBridgeUrl(chainId, toAddress);
}
