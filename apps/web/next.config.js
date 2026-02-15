/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: "standalone",
  // Environment variables for client-side use
  env: {
    // Indexer API
    NEXT_PUBLIC_INDEXER_URL: process.env.NEXT_PUBLIC_INDEXER_URL || "https://indexer.railbird.fun",
    NEXT_PUBLIC_OWNERVIEW_URL: process.env.NEXT_PUBLIC_OWNERVIEW_URL || "https://ownerview.railbird.fun",
    // Chain config
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://testnet-rpc.monad.xyz",
    // nad.fun contract addresses
    NEXT_PUBLIC_NADFUN_LENS_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS || "0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8",
    NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS || "0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d",
    NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS || "0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d",
    NEXT_PUBLIC_WMON_ADDRESS: process.env.NEXT_PUBLIC_WMON_ADDRESS || "0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd",
  },
};

export default nextConfig;
