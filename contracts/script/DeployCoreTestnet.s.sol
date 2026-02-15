// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PokerTable.sol";
import "../src/PlayerRegistry.sol";
import "../src/PlayerVault.sol";

/**
 * @title DeployCoreTestnet
 * @notice Deploy core contracts using an existing chip token + VRF adapter.
 *
 * Required env vars:
 * - RCHIP_TOKEN_ADDRESS
 * - VRF_ADAPTER_ADDRESS
 *
 * Optional env vars:
 * - TABLE_ID (default: 1)
 * - SMALL_BLIND (default: 5)
 * - BIG_BLIND (default: 10)
 */
contract DeployCoreTestnet is Script {
    function run() external {
        address chipToken = vm.envAddress("RCHIP_TOKEN_ADDRESS");
        address vrfAdapter = vm.envAddress("VRF_ADAPTER_ADDRESS");

        uint256 tableId = vm.envOr("TABLE_ID", uint256(1));
        uint256 smallBlind = vm.envOr("SMALL_BLIND", uint256(5));
        uint256 bigBlind = vm.envOr("BIG_BLIND", uint256(10));

        vm.startBroadcast();

        PokerTable pokerTable = new PokerTable(tableId, smallBlind, bigBlind, vrfAdapter, chipToken);
        PlayerRegistry playerRegistry = new PlayerRegistry();
        PlayerVault playerVault = new PlayerVault(chipToken, msg.sender);

        playerVault.authorizeTable(address(pokerTable));
        playerVault.initialize();

        vm.stopBroadcast();

        console.log("PokerTable deployed at:", address(pokerTable));
        console.log("PlayerRegistry deployed at:", address(playerRegistry));
        console.log("PlayerVault deployed at:", address(playerVault));
        console.log("RCHIP_TOKEN_ADDRESS:", chipToken);
        console.log("VRF_ADAPTER_ADDRESS:", vrfAdapter);
    }
}

