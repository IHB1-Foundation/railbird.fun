# Initia MiniEVM Rollup — Provisioning Guide

## Overview

Railbird runs as a **MiniEVM rollup** on the Initia testnet. This gives us:

- A dedicated EVM-compatible execution environment with ~100ms block times.
- Full EVM JSON-RPC compatibility (Foundry, viem, ethers all work out of the box).
- Interwoven security inherited from Initia L1.
- Native InterwovenKit wallet support for users.

## Prerequisites

| Tool             | Install                                          |
| ---------------- | ------------------------------------------------ |
| `initiad`        | https://github.com/initia-labs/initia/releases   |
| MiniEVM binary   | https://github.com/initia-labs/minitia-artifacts |
| `cast` (Foundry) | https://getfoundry.sh                            |
| jq               | `brew install jq`                                |

## Step-by-Step

### 1. Get testnet INIT tokens

Visit https://faucet.testnet.initia.xyz and fund your deployer account.

### 2. Launch the rollup

```bash
source scripts/load-env.sh initia   # loads DEPLOYER_PRIVATE_KEY etc.
bash scripts/initia/launch-minitia.sh
```

The script is interactive — follow the on-screen prompts.  
After launch, update `infra/initia/rollup.json` with the real values.

### 3. Update `.env.initia`

Edit `.env.initia` and set:

```
INITIA_CHAIN_ID=<your-rollup-evm-chain-id>
RPC_URL=<your-rollup-evm-rpc-url>
INITIA_EXPLORER_URL=<your-rollup-explorer-url>
```

### 4. Verify funded account

```bash
cast balance --rpc-url $RPC_URL $DEPLOYER_ADDRESS
# expected: > 0 (non-zero INIT balance for gas)
```

### 5. Deploy contracts

```bash
bash scripts/deploy/initia.sh --simulate   # dry-run
bash scripts/deploy/initia.sh              # broadcast
```

Results are written to `infra/initia/deployments.json`.

## Rollup Metadata

See `infra/initia/rollup.json` for current chain ID, RPC URL, and explorer URL.

## Useful Links

- Initia docs: https://docs.initia.xyz
- MiniEVM artifacts: https://github.com/initia-labs/minitia-artifacts
- Initia testnet explorer: https://scan.testnet.initia.xyz
- Faucet: https://faucet.testnet.initia.xyz
