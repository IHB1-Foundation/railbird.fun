// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/NadfunCompatRouter.sol";
import "../src/NadfunCompatLens.sol";

/**
 * @title DeployNadfunCompat
 * @notice Deploys Nadfun-compatible router/lens for testnet demos.
 *
 * Usage:
 *   cd contracts
 *   forge script script/DeployNadfunCompat.s.sol:DeployNadfunCompat \
 *     --rpc-url $RPC_URL --broadcast --private-key $DEPLOYER_PRIVATE_KEY -vvvv
 */
contract DeployNadfunCompat is Script {
    function run() external {
        // Use env WMON if provided, otherwise default to Monad testnet WMON.
        address wmon = vm.envOr("WMON_ADDRESS", address(0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd));

        vm.startBroadcast();

        NadfunCompatRouter router = new NadfunCompatRouter(wmon, msg.sender);
        NadfunCompatLens lens = new NadfunCompatLens(address(router));

        vm.stopBroadcast();

        console.log("NadfunCompatRouter:", address(router));
        console.log("NadfunCompatLens:", address(lens));
        console.log("WMON:", wmon);
    }
}
