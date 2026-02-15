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
    NEXT_PUBLIC_NADFUN_LENS_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS || "0xB056d79CA5257589692699a46623F901a3BB76f1",
    NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS || "0x865054F0F6A288adaAc30261731361EA7E908003",
    NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS || "0x5D4a4f430cA3B1b2dB86B9cFE48a5316800F5fb2",
    NEXT_PUBLIC_WMON_ADDRESS: process.env.NEXT_PUBLIC_WMON_ADDRESS || "0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd",
  },
};

export default nextConfig;
