// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INadfunRouter
 * @notice Interface for nad.fun Router contract to execute trades.
 * @dev Works for both bonding curve and graduated (DEX) routers.
 */
interface INadfunRouter {
    /**
     * @notice Buy tokens with native MON.
     * @param token The token address to buy
     * @param minTokenOut Minimum tokens to receive (slippage protection)
     * @param deadline Transaction deadline timestamp
     * @param recipient Address to receive tokens
     * @return tokenAmountOut Actual amount of tokens received
     */
    function buy(
        address token,
        uint256 minTokenOut,
        uint256 deadline,
        address recipient
    ) external payable returns (uint256 tokenAmountOut);

    /**
     * @notice Sell tokens for native MON.
     * @param token The token address to sell
     * @param tokenAmountIn Amount of tokens to sell
     * @param minMonOut Minimum MON to receive (slippage protection)
     * @param deadline Transaction deadline timestamp
     * @param recipient Address to receive MON
     * @return monAmountOut Actual amount of MON received
     */
    function sell(
        address token,
        uint256 tokenAmountIn,
        uint256 minMonOut,
        uint256 deadline,
        address recipient
    ) external returns (uint256 monAmountOut);
}
