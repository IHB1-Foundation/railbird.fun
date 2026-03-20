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
    NEXT_PUBLIC_RPC_URL: process.env.NEXT_PUBLIC_RPC_URL || "https://public-en-kairos.node.kaia.io",
    // nad.fun contract addresses
    NEXT_PUBLIC_NADFUN_LENS_ADDRESS: process.env.NEXT_PUBLIC_NADFUN_LENS_ADDRESS || "0xff457F28decB5c7B9fC9BB5Bc6d6c0da50BA902D",
    NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS:
      process.env.NEXT_PUBLIC_NADFUN_BONDING_ROUTER_ADDRESS || "0xd8ab63E839b81306e05D70F63ca07c1C5233805B",
    NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS:
      process.env.NEXT_PUBLIC_NADFUN_DEX_ROUTER_ADDRESS || "0xd8ab63E839b81306e05D70F63ca07c1C5233805B",
    NEXT_PUBLIC_WMON_ADDRESS: process.env.NEXT_PUBLIC_WMON_ADDRESS || "0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd",
  },
};

export default nextConfig;
