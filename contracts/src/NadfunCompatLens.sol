// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/INadfunLens.sol";
import "./interfaces/IERC20.sol";

interface INadfunCompatRouter {
    function getAmountOutWithFee(address token, uint256 amountIn, bool isBuy) external view returns (uint256 amountOut);
    function getAmountInWithFee(address token, uint256 amountOut, bool isBuy) external view returns (uint256 amountIn);
    function availableBuyTokens(address token) external view returns (uint256 availableBuyToken, uint256 requiredMonAmount);
    function getProgress(address token) external view returns (uint256 progress);
    function isGraduated(address token) external view returns (bool);
    function isLocked(address token) external view returns (bool);
    function getInitialBuyAmountOut(uint256 amountIn) external view returns (uint256 amountOut);
    function curve() external view returns (address);
}

/**
 * @title NadfunCompatLens
 * @notice Lens contract exposing both project lens API and nad.fun-like helper methods.
 */
contract NadfunCompatLens is INadfunLens {
    address public immutable router;

    constructor(address _router) {
        require(_router != address(0), "Invalid router");
        router = _router;
    }

    // ===== INadfunLens (project API) =====

    function getTokenInfo(address token) external view override returns (TokenInfo memory info) {
        bool graduated = INadfunCompatRouter(router).isGraduated(token);
        bool locked = INadfunCompatRouter(router).isLocked(token);
        uint256 progress = INadfunCompatRouter(router).getProgress(token);
        uint256 totalSupply = IERC20(token).totalSupply();

        uint256 currentPrice;
        if (totalSupply > 0) {
            // Approximate price as MON needed to buy 1 token.
            currentPrice = INadfunCompatRouter(router).getAmountInWithFee(token, 1e18, true);
        }

        uint256 marketCap = (currentPrice * totalSupply) / 1e18;
        TokenStage stage = graduated ? TokenStage.Graduated : (locked ? TokenStage.Locked : TokenStage.Bonding);

        info = TokenInfo({
            stage: stage,
            currentPrice: currentPrice,
            marketCap: marketCap,
            totalSupply: totalSupply,
            bondingProgress: progress,
            router: router,
            tradeable: !locked
        });
    }

    function getBuyQuote(address token, uint256 monAmountIn)
        external
        view
        override
        returns (uint256 tokenAmountOut, uint256 priceImpact, uint256 fee)
    {
        tokenAmountOut = INadfunCompatRouter(router).getAmountOutWithFee(token, monAmountIn, true);
        priceImpact = 0; // Simplified testnet model.
        fee = 0; // Protocol fee is embedded in router quote.
    }

    function getSellQuote(address token, uint256 tokenAmountIn)
        external
        view
        override
        returns (uint256 monAmountOut, uint256 priceImpact, uint256 fee)
    {
        monAmountOut = INadfunCompatRouter(router).getAmountOutWithFee(token, tokenAmountIn, false);
        priceImpact = 0;
        fee = 0;
    }

    // ===== nad.fun-like lens helpers =====

    function getAmountOut(address token, uint256 amountIn, bool isBuy)
        external
        view
        returns (address routerAddress, uint256 amountOut)
    {
        amountOut = INadfunCompatRouter(router).getAmountOutWithFee(token, amountIn, isBuy);
        routerAddress = router;
    }

    function getAmountIn(address token, uint256 amountOut, bool isBuy)
        external
        view
        returns (address routerAddress, uint256 amountIn)
    {
        amountIn = INadfunCompatRouter(router).getAmountInWithFee(token, amountOut, isBuy);
        routerAddress = router;
    }

    function availableBuyTokens(address token) external view returns (uint256 availableBuyToken, uint256 requiredMonAmount) {
        return INadfunCompatRouter(router).availableBuyTokens(token);
    }

    function getInitialBuyAmountOut(uint256 amountIn) external view returns (uint256 amountOut) {
        return INadfunCompatRouter(router).getInitialBuyAmountOut(amountIn);
    }

    function getProgress(address token) external view returns (uint256 progress) {
        return INadfunCompatRouter(router).getProgress(token);
    }

    function isGraduated(address token) external view returns (bool graduated) {
        return INadfunCompatRouter(router).isGraduated(token);
    }

    function isLocked(address token) external view returns (bool locked) {
        return INadfunCompatRouter(router).isLocked(token);
    }
}

