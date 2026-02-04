/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Environment variables for client-side use
  env: {
    // Indexer API
    NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL || "http://localhost:3002",
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:3002",
    NEXT_PUBLIC_OWNERVIEW_URL: process.env.NEXT_PUBLIC_OWNERVIEW_URL || "http://localhost:3001",
    // Chain config
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz",
    // nad.fun contract addresses
    NEXT_PUBLIC_NADFUN_LENS_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS || "0x0000000000000000000000000000000000000000",
    NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000",
    NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS || "0x0000000000000000000000000000000000000000",
    NEXT_PUBLIC_WMON_ADDRESS: process.env.NEXT_PUBLIC_WMON_ADDRESS || "0x0000000000000000000000000000000000000000",
  },
};

export default nextConfig;
