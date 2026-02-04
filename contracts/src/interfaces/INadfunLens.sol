// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title INadfunLens
 * @notice Interface for nad.fun Lens contract to query token info and quotes.
 */
interface INadfunLens {
    /// @notice Token stage enumeration
    enum TokenStage {
        Bonding,   // 0 - Trading on bonding curve
        Locked,    // 1 - Temporarily locked (during graduation)
        Graduated  // 2 - Trading on DEX
    }

    /// @notice Token info returned by Lens
    struct TokenInfo {
        TokenStage stage;
        uint256 currentPrice;
        uint256 marketCap;
        uint256 totalSupply;
        uint256 bondingProgress;  // basis points (0-10000)
        address router;
        bool tradeable;
    }

    /**
     * @notice Get token info including stage, price, and router.
     * @param token The token address
     * @return info The token info struct
     */
    function getTokenInfo(address token) external view returns (TokenInfo memory info);

    /**
     * @notice Get quote for buying tokens with MON.
     * @param token The token address
     * @param monAmountIn Amount of MON to spend
     * @return tokenAmountOut Amount of tokens to receive
     * @return priceImpact Price impact in basis points
     * @return fee Protocol fee
     */
    function getBuyQuote(address token, uint256 monAmountIn)
        external
        view
        returns (uint256 tokenAmountOut, uint256 priceImpact, uint256 fee);

    /**
     * @notice Get quote for selling tokens for MON.
     * @param token The token address
     * @param tokenAmountIn Amount of tokens to sell
     * @return monAmountOut Amount of MON to receive
     * @return priceImpact Price impact in basis points
     * @return fee Protocol fee
     */
    function getSellQuote(address token, uint256 tokenAmountIn)
        external
        view
        returns (uint256 monAmountOut, uint256 priceImpact, uint256 fee);
}
