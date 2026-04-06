// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INadfunBondingRouter
 * @notice Minimal interface for the nad.fun bonding-curve router used by PlayerVault rebalancing.
 */
interface INadfunBondingRouter {
    /**
     * @notice Buy agent tokens with native MON.
     * @param token     The agent token address.
     * @param minOut    Minimum tokens to receive (slippage guard).
     * @param deadline  Unix timestamp after which the transaction reverts.
     */
    function buyTokens(address token, uint256 minOut, uint256 deadline) external payable;

    /**
     * @notice Sell agent tokens for native MON.
     * @param token     The agent token address.
     * @param amount    Amount of tokens to sell.
     * @param minMonOut Minimum MON to receive (slippage guard).
     * @param deadline  Unix timestamp after which the transaction reverts.
     */
    function sellTokens(address token, uint256 amount, uint256 minMonOut, uint256 deadline) external;
}
