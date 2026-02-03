// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVRFAdapter.sol";

/**
 * @title MockVRFAdapter
 * @notice Mock VRF adapter for testing poker table VRF integration.
 * @dev In tests, call fulfillRandomness() to simulate VRF callback.
 */
contract MockVRFAdapter is IVRFAdapter {
    uint256 public nextRequestId = 1;

    // Mapping of requestId to table address
    mapping(uint256 => address) public requestToTable;
    mapping(uint256 => uint256) public requestToHandId;
    mapping(uint256 => uint8) public requestToPurpose;

    // Last request info for testing
    uint256 public lastRequestId;
    address public lastRequester;
    uint256 public lastTableId;
    uint256 public lastHandId;
    uint8 public lastPurpose;

    event RandomnessRequested(
        uint256 indexed requestId,
        address indexed requester,
        uint256 tableId,
        uint256 handId,
        uint8 purpose
    );

    event RandomnessFulfilled(
        uint256 indexed requestId,
        address indexed table,
        uint256 randomness
    );

    /**
     * @notice Request randomness - stores request and emits event.
     */
    function requestRandomness(
        uint256 tableId,
        uint256 handId,
        uint8 purpose
    ) external override returns (uint256 requestId) {
        requestId = nextRequestId++;

        requestToTable[requestId] = msg.sender;
        requestToHandId[requestId] = handId;
        requestToPurpose[requestId] = purpose;

        lastRequestId = requestId;
        lastRequester = msg.sender;
        lastTableId = tableId;
        lastHandId = handId;
        lastPurpose = purpose;

        emit RandomnessRequested(requestId, msg.sender, tableId, handId, purpose);

        return requestId;
    }

    /**
     * @notice Fulfill randomness for a pending request.
     * @dev Called by tests to simulate VRF callback.
     * @param requestId The request to fulfill
     * @param randomness The random value to provide
     */
    function fulfillRandomness(uint256 requestId, uint256 randomness) external {
        address table = requestToTable[requestId];
        require(table != address(0), "Request not found");

        emit RandomnessFulfilled(requestId, table, randomness);

        // Call back to the poker table
        (bool success,) = table.call(
            abi.encodeWithSignature("fulfillVRF(uint256,uint256)", requestId, randomness)
        );
        require(success, "Callback failed");
    }

    /**
     * @notice Convenience function to fulfill the last request.
     */
    function fulfillLastRequest(uint256 randomness) external {
        require(lastRequestId > 0, "No pending request");
        this.fulfillRandomness(lastRequestId, randomness);
    }
}
