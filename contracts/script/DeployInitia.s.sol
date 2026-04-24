// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/PlayerRegistry.sol";
import "../src/PlayerVault.sol";
import "../src/ProductionVRFAdapter.sol";
import "../src/SideBetPool.sol";

// ChainlinkVRFAdapter is NOT used on Initia — ProductionVRFAdapter handles randomness.
// See docs/initia/vrf.md for the off-chain commit-reveal trust model.

/**
 * @title DeployInitia
 * @notice Deploy Railbird on a MiniEVM rollup on Initia testnet.
 *
 * Deployment notes:
 *   - KYC_SBT_ADDRESS defaults to address(0) — no KYC gate on Initia.
 *   - Chain ID is the Railbird MiniEVM rollup provisioned for this environment.
 *   - Native currency is INIT.
 *
 * Tables:
 *   Table 1 (low-stakes):  SB = 0.1 INIT, BB = 0.2 INIT
 *   Table 2 (high-stakes): SB = 1 INIT,   BB = 2 INIT
 *
 * Required env vars:
 *   VRF_OPERATOR_ADDRESS - off-chain VRF operator wallet
 *   DEALER_ADDRESS       - OwnerView service wallet (for hole card commit/reveal)
 *
 * Optional env vars:
 *   KYC_SBT_ADDRESS      - leave unset (defaults to 0x0, KYC gate disabled)
 *
 * Dry-run (simulate):
 *   FOUNDRY_PROFILE=deploy forge script script/DeployInitia.s.sol \
 *     --rpc-url initia-testnet
 *
 * Broadcast:
 *   FOUNDRY_PROFILE=deploy forge script script/DeployInitia.s.sol \
 *     --rpc-url initia-testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 *
 * Or use the wrapper:
 *   bash scripts/deploy/initia.sh [--simulate]
 */
contract DeployInitia is Script {
    function run() external {
        vm.startBroadcast();

        // --- Chip Token ---
        ChipToken chip = new ChipToken("RailbirdChip", "RCHIP");
        console.log("ChipToken:", address(chip));

        // --- VRF Adapter (off-chain operator + on-chain commit-reveal) ---
        address vrfOp = vm.envAddress("VRF_OPERATOR_ADDRESS");
        address vrfAdapter = address(new ProductionVRFAdapter(vrfOp));
        console.log("VRF Adapter:", vrfAdapter);

        // --- KYC SBT: disabled on Initia (no equivalent contract) ---
        // Pass address(0) explicitly so the guard is skipped in PokerTable.registerSeat().
        address kycSBT = vm.envOr("KYC_SBT_ADDRESS", address(0));
        console.log("KYC SBT: disabled (address(0))");
        require(kycSBT == address(0), "DeployInitia: KYC_SBT_ADDRESS must be unset on Initia");

        // --- Dealer address (OwnerView service wallet) ---
        address dealerAddr = vm.envAddress("DEALER_ADDRESS");
        console.log("Dealer:", dealerAddr);

        // --- Table 1: low-stakes ---
        PokerTable table1 = new PokerTable(
            1,
            0.1 ether,
            0.2 ether,
            vrfAdapter,
            address(chip),
            kycSBT,
            30 minutes,
            5 minutes,
            10 minutes,
            9,
            dealerAddr
        );
        console.log("Table 1 (low-stakes):", address(table1));

        // --- Table 2: high-stakes ---
        PokerTable table2 = new PokerTable(
            2,
            1 ether,
            2 ether,
            vrfAdapter,
            address(chip),
            kycSBT,
            30 minutes,
            5 minutes,
            10 minutes,
            9,
            dealerAddr
        );
        console.log("Table 2 (high-stakes):", address(table2));

        // --- Shared contracts ---
        PlayerRegistry registry = new PlayerRegistry();
        console.log("PlayerRegistry:", address(registry));

        PlayerVault vault = new PlayerVault(msg.sender);
        vault.authorizeTable(address(table1));
        vault.authorizeTable(address(table2));
        vault.initialize();
        console.log("PlayerVault:", address(vault));

        // --- SideBetPool ---
        SideBetPool sideBetPool = new SideBetPool();
        console.log("SideBetPool:", address(sideBetPool));

        vm.stopBroadcast();

        // --- Deployment Summary (copy to infra/initia/deployments.json) ---
        console.log("\n=== Initia MiniEVM Rollup Deployment Summary ===");
        console.log("CHIP_TOKEN_ADDRESS=%s", vm.toString(address(chip)));
        console.log(
            "POKER_TABLE_ADDRESSES=%s,%s",
            vm.toString(address(table1)),
            vm.toString(address(table2))
        );
        console.log("PLAYER_REGISTRY_ADDRESS=%s", vm.toString(address(registry)));
        console.log("PLAYER_VAULT_ADDRESS=%s", vm.toString(address(vault)));
        console.log("VRF_ADAPTER_ADDRESS=%s", vm.toString(vrfAdapter));
        console.log("SIDE_BET_POOL_ADDRESS=%s", vm.toString(address(sideBetPool)));
    }
}
