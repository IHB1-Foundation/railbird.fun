// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/PlayerRegistry.sol";
import "../src/PlayerVault.sol";
import "../src/ProductionVRFAdapter.sol";

/**
 * @title DeployHashKey
 * @notice Deploy 2 poker tables + shared infra on HashKey Chain testnet (chain ID 133).
 *
 * Tables:
 *   Table 1 (low-stakes):  SB = 0.1 HSK, BB = 0.2 HSK
 *   Table 2 (high-stakes): SB = 1 HSK,   BB = 2 HSK
 *
 * Required env vars:
 *   VRF_OPERATOR_ADDRESS - operator wallet for ProductionVRFAdapter
 *   KYC_SBT_ADDRESS      - HashKey Chain KYC SBT checker (address(0) to disable)
 *
 * Run:
 *   FOUNDRY_PROFILE=deploy forge script script/DeployHashKey.s.sol \
 *     --rpc-url hashkey-testnet --broadcast --private-key $DEPLOYER_PRIVATE_KEY
 */
contract DeployHashKey is Script {
    function run() external {
        vm.startBroadcast();

        // --- Chip Token ---
        ChipToken chip = new ChipToken("RailbirdChip", "RCHIP");
        console.log("ChipToken:", address(chip));

        // --- VRF Adapter ---
        address vrfOp = vm.envAddress("VRF_OPERATOR_ADDRESS");
        address vrfAdapter = address(new ProductionVRFAdapter(vrfOp));
        console.log("VRF Adapter:", vrfAdapter);

        // --- KYC SBT (address(0) = disabled) ---
        address kycSBT = vm.envOr("KYC_SBT_ADDRESS", address(0));
        if (kycSBT != address(0)) {
            console.log("KYC SBT:", kycSBT);
        } else {
            console.log("KYC SBT: disabled");
        }

        // --- Table 1: low-stakes ---
        PokerTable table1 = new PokerTable(1, 0.1 ether, 0.2 ether, vrfAdapter, address(chip), kycSBT);
        console.log("Table 1 (low):", address(table1));

        // --- Table 2: high-stakes ---
        PokerTable table2 = new PokerTable(2, 1 ether, 2 ether, vrfAdapter, address(chip), kycSBT);
        console.log("Table 2 (high):", address(table2));

        // --- Shared contracts ---
        PlayerRegistry registry = new PlayerRegistry();
        console.log("PlayerRegistry:", address(registry));

        PlayerVault vault = new PlayerVault(msg.sender);
        vault.authorizeTable(address(table1));
        vault.authorizeTable(address(table2));
        vault.initialize();
        console.log("PlayerVault:", address(vault));

        vm.stopBroadcast();

        // --- Summary ---
        console.log("\n=== HashKey Chain Testnet Deployment Summary ===");
        console.log("CHIP_TOKEN_ADDRESS=%s", vm.toString(address(chip)));
        console.log("POKER_TABLE_ADDRESSES=%s,%s", vm.toString(address(table1)), vm.toString(address(table2)));
        console.log("PLAYER_REGISTRY_ADDRESS=%s", vm.toString(address(registry)));
        console.log("PLAYER_VAULT_ADDRESS=%s", vm.toString(address(vault)));
        console.log("VRF_ADAPTER_ADDRESS=%s", vm.toString(vrfAdapter));
    }
}
