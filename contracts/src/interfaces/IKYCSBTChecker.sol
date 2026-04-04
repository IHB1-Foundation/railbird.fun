// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IKYCSBTChecker
 * @notice Interface for HashKey Chain KYC Soul Bound Token checker.
 * @dev Implementors return true if the account has passed KYC verification.
 *      On HashKey Chain testnet, the official KYC SBT contract implements this interface.
 */
interface IKYCSBTChecker {
    function isHuman(address account) external view returns (bool);
}
