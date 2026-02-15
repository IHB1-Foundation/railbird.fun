# Railbird - Submission Summary

## Project Description
Railbird is a Monad-based on-chain poker AI system where each agent is operated like a tokenized strategy profile.

Core product features:
- Wallet-native identity (no email/password accounts)
- Public table spectating with real-time updates
- Owner-only hole-card visibility with strict access control
- In-app nad.fun trading (buy/sell with quote, slippage, and router-stage handling)
- Per-hand treasury rebalancing logic designed to be accretive-only

System components:
- Smart contracts: `PokerTable`, `PlayerRegistry`, `PlayerVault`, `ProductionVRFAdapter`, `RailwayChip`
- Services: `OwnerView` (auth + ACL), `Indexer` (event ingestion + REST/WS)
- Bots: `AgentBot` (actions), `KeeperBot` (liveness/timeouts/settlement helpers)
- Web app: lobby/table/agent/leaderboard/trading pages

## Monad Integration
- Chain: Monad Testnet
- Chain ID: `10143`
- RPC: `https://testnet-rpc.monad.xyz`

Protocol flow on Monad:
- Table state and actions are executed on `PokerTable`
- Agent-to-owner/operator mapping is resolved by `PlayerRegistry`
- Vault and rebalancing state are managed by `PlayerVault`
- Randomness for hand progression uses `ProductionVRFAdapter`
- Off-chain services index events and expose APIs/WebSockets for real-time UI

nad.fun integration approach (as of 2026-02-15):
- Native nad.fun launch flow is not reliably available on Monad testnet.
- For testnet demo and end-to-end validation, we deployed a nad.fun-compatible router/lens pair.
- The app keeps the same quote/trade flow (`buy/sell/getTokenInfo/getInitialBuyAmountOut`) against this compatible interface.

## nad.fun Token Metadata Strategy
- Each player token uses a dedicated token profile:
  - `Railbird Player A` (Tight, aggression `0.15`)
  - `Railbird Player B` (Balanced, aggression `0.35`)
  - `Railbird Player C` (Loose, aggression `0.60`)
  - `Railbird Player D` (Maniac, aggression `0.85`)
- `tokenURI` points to backend-served metadata JSON:
  - `/api/token-metadata/player-a.json`
  - `/api/token-metadata/player-b.json`
  - `/api/token-metadata/player-c.json`
  - `/api/token-metadata/player-d.json`
- Metadata JSON includes style narrative and structured attributes (`Archetype`, `Aggression`, `Risk Profile`, `Play Style`).
- `image` inside metadata points to backend-served SVG logos:
  - `/api/token-assets/player-a.svg`
  - `/api/token-assets/player-b.svg`
  - `/api/token-assets/player-c.svg`
  - `/api/token-assets/player-d.svg`

## Associated Addresses
Environment snapshot source: root `.env` (Monad Testnet deployment)

- `POKER_TABLE_ADDRESS`: `0xC5d4Ad9ce78447501024ED699842d267A9D77a58`
- `PLAYER_REGISTRY_ADDRESS`: `0x2b85AF079eb1a86912b2c79e790759018641fFd4`
- `PLAYER_VAULT_ADDRESS`: `0xf434455eF0Dd722dec4f9caBFB5e67Ea26332C96`
- `VRF_ADAPTER_ADDRESS`: `0xEa22C8FB76b4C26C4cb94c1d7a879abd694a70b0`
- `RCHIP_TOKEN_ADDRESS`: `0x66e817138F285e59109b408a04a5Ca5B3Cb07cdf`
- `NADFUN_LENS_ADDRESS` (compat): `0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8`
- `NADFUN_BONDING_ROUTER_ADDRESS` (compat): `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `NADFUN_DEX_ROUTER_ADDRESS` (compat): `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `WMON_ADDRESS`: `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd`

Launched player tokens and vaults (compat flow):
- `Railbird Player A` token: `0x53afee4f302f2dd8b88d5f211ae9d9fb369578ff`
- `Railbird Player A` vault: `0x395b21d69e95cd4c5072b13fb1f457c1c8d6305e`
- `Railbird Player B` token: `0x9287b7e5dcd97e1328cba37bb5b0b2e00ec0b056`
- `Railbird Player B` vault: `0x928f1921a5e3daefd3220dc79855d3a602a459e8`
- `Railbird Player C` token: `0xcf76ea8e95fb216d8e875af6092047ef3a5d9b80`
- `Railbird Player C` vault: `0xfdaeda9e10d09da49210e4984e69f782d1c3c10e`
- `Railbird Player D` token: `0x0d10d8c5b0cda3636d88a9e8fd7e17b6652c45d8`
- `Railbird Player D` vault: `0x71fd5c29922126a1eaf827dd75cb10e90dd55dba`

## Token Contract Address (Must be live on Nad.Fun)
Submission field:
- `Token Contract Address`: `0x53afee4f302f2dd8b88d5f211ae9d9fb369578ff` (Railbird Player A)

Important:
- This address is a live ERC-20 contract on Monad testnet and registered in `PlayerRegistry`.
- It is launched via our nad.fun-compatible router, not the official nad.fun production listing flow.
- If the reviewer strictly requires official nad.fun listing, replace this with a token that is live on official nad.fun.
- Do not use an EOA wallet address.
- Do not use placeholder addresses.
