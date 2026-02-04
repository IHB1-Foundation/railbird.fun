// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/INadfunRouter.sol";

/**
 * @title MockNadfunRouter
 * @notice Mock nad.fun Router for testing rebalancing logic.
 * @dev Configurable to test different price scenarios.
 *      Simulates market liquidity by transferring tokens (not minting) on buy,
 *      and burning tokens on sell. This models a DEX/AMM where total supply
 *      doesn't change when trading.
 */
contract MockNadfunRouter is INadfunRouter {
    // Configurable exchange rates
    uint256 public buyRate;  // tokens per MON (scaled by 1e18)
    uint256 public sellRate; // MON per token (scaled by 1e18)

    // Track calls for verification
    uint256 public lastBuyMonAmount;
    uint256 public lastSellTokenAmount;

    // Allow failing trades for testing
    bool public shouldFailBuy;
    bool public shouldFailSell;

    // Token liquidity held by router for buy operations
    mapping(address => uint256) public tokenLiquidity;

    constructor() {
        // Default: 1:1 rate (1 MON = 1 token at 1e18 scale)
        buyRate = 1e18;
        sellRate = 1e18;
    }

    /**
     * @notice Set the buy exchange rate.
     * @param rate Tokens received per MON spent (scaled by 1e18)
     */
    function setBuyRate(uint256 rate) external {
        buyRate = rate;
    }

    /**
     * @notice Set the sell exchange rate.
     * @param rate MON received per token sold (scaled by 1e18)
     */
    function setSellRate(uint256 rate) external {
        sellRate = rate;
    }

    /**
     * @notice Configure whether buy should fail.
     */
    function setShouldFailBuy(bool _fail) external {
        shouldFailBuy = _fail;
    }

    /**
     * @notice Configure whether sell should fail.
     */
    function setShouldFailSell(bool _fail) external {
        shouldFailSell = _fail;
    }

    /**
     * @notice Add token liquidity to the router for buy operations.
     * @dev Call this before testing buy operations.
     */
    function addTokenLiquidity(address token, uint256 amount) external {
        // Transfer tokens from caller to router
        (bool success,) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), amount)
        );
        require(success, "MockRouter: transfer failed");
        tokenLiquidity[token] += amount;
    }

    /**
     * @notice Seed token liquidity directly (for test setup where tokens are minted to router).
     * @dev Just tracks the amount, assumes tokens are already transferred/minted to router.
     */
    function seedTokenLiquidity(address token, uint256 amount) external {
        tokenLiquidity[token] += amount;
    }

    /**
     * @notice Mock buy implementation.
     * @dev Transfers tokens from router's liquidity to recipient (doesn't mint).
     */
    function buy(
        address token,
        uint256 minTokenOut,
        uint256 deadline,
        address recipient
    ) external payable override returns (uint256 tokenAmountOut) {
        require(!shouldFailBuy, "MockRouter: buy failed");
        require(msg.value > 0, "MockRouter: zero value");
        require(block.timestamp <= deadline, "MockRouter: deadline passed");

        lastBuyMonAmount = msg.value;

        // Calculate tokens to transfer: tokenOut = monIn * buyRate / 1e18
        tokenAmountOut = (msg.value * buyRate) / 1e18;
        require(tokenAmountOut >= minTokenOut, "MockRouter: insufficient output");
        require(tokenLiquidity[token] >= tokenAmountOut, "MockRouter: insufficient liquidity");

        // Update liquidity tracking
        tokenLiquidity[token] -= tokenAmountOut;

        // Transfer tokens from router to recipient (not minting)
        (bool success,) = token.call(
            abi.encodeWithSignature("transfer(address,uint256)", recipient, tokenAmountOut)
        );
        require(success, "MockRouter: transfer failed");

        return tokenAmountOut;
    }

    /**
     * @notice Mock sell implementation.
     * @dev Burns tokens from sender, sends MON to recipient.
     */
    function sell(
        address token,
        uint256 tokenAmountIn,
        uint256 minMonOut,
        uint256 deadline,
        address recipient
    ) external override returns (uint256 monAmountOut) {
        require(!shouldFailSell, "MockRouter: sell failed");
        require(tokenAmountIn > 0, "MockRouter: zero amount");
        require(block.timestamp <= deadline, "MockRouter: deadline passed");

        lastSellTokenAmount = tokenAmountIn;

        // Calculate MON to return: monOut = tokenIn * sellRate / 1e18
        monAmountOut = (tokenAmountIn * sellRate) / 1e18;
        require(monAmountOut >= minMonOut, "MockRouter: insufficient output");

        // Transfer tokens from sender to router (add to liquidity)
        (bool success,) = token.call(
            abi.encodeWithSignature("transferFrom(address,address,uint256)", msg.sender, address(this), tokenAmountIn)
        );
        require(success, "MockRouter: transferFrom failed");
        tokenLiquidity[token] += tokenAmountIn;

        // Send MON to recipient
        (success,) = recipient.call{value: monAmountOut}("");
        require(success, "MockRouter: MON transfer failed");

        return monAmountOut;
    }

    /**
     * @notice Allow contract to receive MON for sell operations.
     */
    receive() external payable {}

    /**
     * @notice Fund the router with MON for sell payouts.
     */
    function fund() external payable {}
}
