// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/PlayerRegistry.sol";
import "../src/PlayerVault.sol";
import "../src/ProductionVRFAdapter.sol";

/**
 * @title DeployKaiaTestnet
 * @notice Deploy 2 poker tables + shared infra on KAIA Kairos testnet.
 *
 * Tables:
 *   Table 1 (low-stakes):  SB = 0.1 KAIA, BB = 0.2 KAIA
 *   Table 2 (high-stakes): SB = 1 KAIA,   BB = 2 KAIA
 *
 * Required env vars:
 *   VRF_OPERATOR_ADDRESS - operator wallet for ProductionVRFAdapter
 *
 * Optional env vars:
 *   VRF_ADAPTER_ADDRESS  - reuse existing adapter (skip deploy)
 */
contract DeployKaiaTestnet is Script {
    function run() external {
        vm.startBroadcast();

        // --- Chip Token ---
        ChipToken chip = new ChipToken("RailbirdChip", "RCHIP");
        console.log("ChipToken:", address(chip));

        // --- VRF Adapter ---
        address vrfAdapter;
        address vrfOp = vm.envAddress("VRF_OPERATOR_ADDRESS");
        vrfAdapter = address(new ProductionVRFAdapter(vrfOp));
        console.log("VRF Adapter:", vrfAdapter);

        // --- Table 1: low-stakes ---
        PokerTable table1 = new PokerTable(1, 0.1 ether, 0.2 ether, vrfAdapter, address(chip), address(0));
        console.log("Table 1 (low):", address(table1));

        // --- Table 2: high-stakes ---
        PokerTable table2 = new PokerTable(2, 1 ether, 2 ether, vrfAdapter, address(chip), address(0));
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
        console.log("\n=== KAIA Testnet Deployment Summary ===");
        console.log("CHIP_TOKEN_ADDRESS=%s", vm.toString(address(chip)));
        console.log("POKER_TABLE_ADDRESSES=%s,%s", vm.toString(address(table1)), vm.toString(address(table2)));
        console.log("PLAYER_REGISTRY_ADDRESS=%s", vm.toString(address(registry)));
        console.log("PLAYER_VAULT_ADDRESS=%s", vm.toString(address(vault)));
        console.log("VRF_ADAPTER_ADDRESS=%s", vm.toString(vrfAdapter));
    }
}
