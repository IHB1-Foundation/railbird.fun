// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/PokerTable.sol";
import "../src/PlayerRegistry.sol";
import "../src/PlayerVault.sol";

/**
 * @title DeployCoreTestnet
 * @notice Deploy core contracts for KAIA testnet (native token, no ERC20).
 *
 * Required env vars:
 * - VRF_ADAPTER_ADDRESS
 *
 * Optional env vars:
 * - TABLE_ID (default: 1)
 * - SMALL_BLIND (default: 1e18)
 * - BIG_BLIND (default: 2e18)
 */
contract DeployCoreTestnet is Script {
    function run() external {
        address vrfAdapter = vm.envAddress("VRF_ADAPTER_ADDRESS");

        uint256 tableId = vm.envOr("TABLE_ID", uint256(1));
        uint256 smallBlind = vm.envOr("SMALL_BLIND", uint256(1e18));
        uint256 bigBlind = vm.envOr("BIG_BLIND", uint256(2e18));

        vm.startBroadcast();

        PokerTable pokerTable = new PokerTable(tableId, smallBlind, bigBlind, vrfAdapter);
        PlayerRegistry playerRegistry = new PlayerRegistry();
        PlayerVault playerVault = new PlayerVault(address(0), msg.sender);

        playerVault.authorizeTable(address(pokerTable));
        playerVault.initialize();

        vm.stopBroadcast();

        console.log("PokerTable deployed at:", address(pokerTable));
        console.log("PlayerRegistry deployed at:", address(playerRegistry));
        console.log("PlayerVault deployed at:", address(playerVault));
        console.log("VRF_ADAPTER_ADDRESS:", vrfAdapter);
    }
}
