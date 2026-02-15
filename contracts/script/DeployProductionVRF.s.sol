// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Script.sol";
import "../src/ProductionVRFAdapter.sol";

/**
 * @title DeployProductionVRF
 * @notice Deployment script for production VRF adapter.
 * @dev Usage:
 *
 *   # Deploy to testnet:
 *   forge script script/DeployProductionVRF.s.sol \
 *     --rpc-url $RPC_URL \
 *     --broadcast \
 *     --private-key $DEPLOYER_PRIVATE_KEY \
 *     -vvvv
 *
 *   Required env vars:
 *     VRF_OPERATOR_ADDRESS - Address of the backend service that fulfills VRF requests
 *
 *   IMPORTANT: Do NOT use MockVRFAdapter on testnet or mainnet.
 *   This script deploys the production adapter with proper access control.
 */
contract DeployProductionVRF is Script {
    function run() external {
        address vrfOperator = vm.envAddress("VRF_OPERATOR_ADDRESS");
        require(vrfOperator != address(0), "VRF_OPERATOR_ADDRESS must be set");

        vm.startBroadcast();

        ProductionVRFAdapter adapter = new ProductionVRFAdapter(vrfOperator);

        vm.stopBroadcast();

        console.log("ProductionVRFAdapter deployed at:", address(adapter));
        console.log("  Owner:", adapter.owner());
        console.log("  Operator:", adapter.operator());
        console.log("");
        console.log("Set VRF_ADAPTER_ADDRESS=%s in your .env", address(adapter));
    }
}
