// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IKYCSBTChecker
 * @notice Optional interface for a KYC / humanity-checking SBT contract.
 * @dev Implementors return true if the account has passed the configured verification gate.
 */
interface IKYCSBTChecker {
    function isHuman(address account) external view returns (bool);
}
