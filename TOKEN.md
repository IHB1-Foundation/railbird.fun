# Railbird nad.fun Token Launch Sheet

This file is the single source of truth for launching 4 player tokens for:
- `Railbird Player A`
- `Railbird Player B`
- `Railbird Player C`
- `Railbird Player D`

## 1) Network and Router Snapshot
- `CHAIN_ENV`: `testnet`
- `RPC_URL`: `https://testnet-rpc.monad.xyz`
- `NADFUN_BONDING_ROUTER_ADDRESS` (compat): `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `NADFUN_LENS_ADDRESS` (compat): `0xd2F5843b64329D6A296A4e6BB05BA2a9BD3816F8`
- `NADFUN_DEX_ROUTER_ADDRESS` (compat): `0xa69d9F9B3D64bdD781cB4351E071FBA5DC43018d`
- `WMON_ADDRESS`: `0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd`

## 2) Launch Cost Snapshot (Current)
- `deployFee`: `0 MON` per token (`0 wei`)
- `initialBuy`: default `0 MON` (can be raised)
- `requiredPerAgentMin`: `0 MON + gas`

Status (2026-02-15): launch completed successfully on Monad testnet compat router.

## 3) Pre-Filled Launch Inputs

### Common
- `actionId`: `0`
- `INITIAL_BUY_MON_PER_TOKEN`: `0` (safe default)
- `TOKEN_METADATA_BASE_URL`: `https://be.railbird.fun/api/token-metadata`

### Player A
- `name`: `Railbird Player A`
- `symbol`: `RBPA`
- `owner`: `0x1C4Ae656c9640A9A838a8f289326E35452d113B1`
- `operator`: `0x1C4Ae656c9640A9A838a8f289326E35452d113B1`
- `tokenURI`: `https://be.railbird.fun/api/token-metadata/player-a.json`
- `registryMetaURI`: `railbird://agent/A?codename=RBPA`

### Player B
- `name`: `Railbird Player B`
- `symbol`: `RBPB`
- `owner`: `0xAa256B84D3A87f7782DDC01241960023Acc60392`
- `operator`: `0xAa256B84D3A87f7782DDC01241960023Acc60392`
- `tokenURI`: `https://be.railbird.fun/api/token-metadata/player-b.json`
- `registryMetaURI`: `railbird://agent/B?codename=RBPB`

### Player C
- `name`: `Railbird Player C`
- `symbol`: `RBPC`
- `owner`: `0x63e459AD2b1f78BBf450e541fb16a33578936eb4`
- `operator`: `0x63e459AD2b1f78BBf450e541fb16a33578936eb4`
- `tokenURI`: `https://be.railbird.fun/api/token-metadata/player-c.json`
- `registryMetaURI`: `railbird://agent/C?codename=RBPC`

### Player D
- `name`: `Railbird Player D`
- `symbol`: `RBPD`
- `owner`: `0xDa55846B0fF474e6bc3C6C5383B5604c0fB90c24`
- `operator`: `0xDa55846B0fF474e6bc3C6C5383B5604c0fB90c24`
- `tokenURI`: `https://be.railbird.fun/api/token-metadata/player-d.json`
- `registryMetaURI`: `railbird://agent/D?codename=RBPD`

## 4) Launch Result (Recorded)
- `AGENT_1_TOKEN_ADDRESS`: `0x53afee4f302f2dd8b88d5f211ae9d9fb369578ff`
- `AGENT_1_VAULT_ADDRESS`: `0x395b21d69e95cd4c5072b13fb1f457c1c8d6305e`
- `AGENT_1_OWNER_ADDRESS`: `0x1C4Ae656c9640A9A838a8f289326E35452d113B1`
- `AGENT_2_TOKEN_ADDRESS`: `0x9287b7e5dcd97e1328cba37bb5b0b2e00ec0b056`
- `AGENT_2_VAULT_ADDRESS`: `0x928f1921a5e3daefd3220dc79855d3a602a459e8`
- `AGENT_2_OWNER_ADDRESS`: `0xAa256B84D3A87f7782DDC01241960023Acc60392`
- `AGENT_3_TOKEN_ADDRESS`: `0xcf76ea8e95fb216d8e875af6092047ef3a5d9b80`
- `AGENT_3_VAULT_ADDRESS`: `0xfdaeda9e10d09da49210e4984e69f782d1c3c10e`
- `AGENT_3_OWNER_ADDRESS`: `0x63e459AD2b1f78BBf450e541fb16a33578936eb4`
- `AGENT_4_TOKEN_ADDRESS`: `0x0d10d8c5b0cda3636d88a9e8fd7e17b6652c45d8`
- `AGENT_4_VAULT_ADDRESS`: `0x71fd5c29922126a1eaf827dd75cb10e90dd55dba`
- `AGENT_4_OWNER_ADDRESS`: `0xDa55846B0fF474e6bc3C6C5383B5604c0fB90c24`

## 5) tokenURI FAQ
`tokenURI` is usually a metadata JSON URL, not the image URL itself.

Current backend endpoints:
- `tokenURI` -> `https://be.railbird.fun/api/token-metadata/player-a.json`
- JSON `image` -> `https://be.railbird.fun/api/token-assets/player-a.svg`

Example metadata JSON:
```json
{
  "name": "Railbird Player A",
  "symbol": "RBPA",
  "description": "Disciplined tight profile focused on high-probability spots, bankroll protection, and low-variance play.",
  "image": "https://be.railbird.fun/api/token-assets/player-a.svg",
  "external_url": "https://be.railbird.fun/agent/a",
  "attributes": [
    { "trait_type": "Project", "value": "Railbird" },
    { "trait_type": "Role", "value": "Poker Agent" },
    { "trait_type": "Player", "value": "A" },
    { "trait_type": "Archetype", "value": "Tight" },
    { "trait_type": "Aggression", "value": "0.15" }
  ]
}
```

## 6) Architecture Note
- On Monad testnet, tokens are launched through `NadfunCompatRouter` + `NadfunCompatLens`.
- The app and vault interact through the same interface shape used for nad.fun quoting and execution.
- This enables full testnet demos even when official nad.fun listing flow is unavailable.

## 7) Launch Command
After funding wallets:
```bash
./scripts/launch-nadfun-agents.sh
```

Optional overrides:
```bash
AGENT_1_NAME="Railbird Player A" \
AGENT_1_SYMBOL="RBPA" \
TOKEN_METADATA_BASE_URL="https://be.railbird.fun/api/token-metadata" \
INITIAL_BUY_WEI=0 \
./scripts/launch-nadfun-agents.sh
```

## 8) If You Later Launch on Official nad.fun
Prepare these fields in advance:
- Token name
- Token symbol
- Token description
- Token logo/image URL (or IPFS CID)
- Token metadata URL (`tokenURI`)
- Team/project URL
- Social links (X, Telegram, Discord, website)
- Treasury/owner wallet
- Initial buy budget
- Target chain/environment
- Compliance text/disclaimer used by your project
