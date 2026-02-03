// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IVRFAdapter
 * @notice Interface for VRF adapter to request randomness for poker table.
 */
interface IVRFAdapter {
    /**
     * @notice Request randomness for a specific purpose.
     * @param tableId The poker table requesting randomness
     * @param handId The hand ID for this request
     * @param purpose The street/purpose (encoded as GameState)
     * @return requestId The ID of the VRF request
     */
    function requestRandomness(
        uint256 tableId,
        uint256 handId,
        uint8 purpose
    ) external returns (uint256 requestId);
}
