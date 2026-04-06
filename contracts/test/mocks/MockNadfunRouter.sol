// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IERC20.sol";

/**
 * @dev Mock nad.fun bonding-curve router for testing PlayerVault rebalancing.
 *
 * Configurable exchange rate: tokensPerMon (default 2 — 1 MON = 2 tokens).
 * Can be set to simulate bad rates for negative-NAV tests.
 */
contract MockNadfunRouter {
    /// @dev tokens received per wei of MON (scaled 1e18)
    uint256 public tokensPerMonScaled = 2e18; // default: 1 MON → 2 tokens

    /// @dev MON received per token wei (scaled 1e18)
    uint256 public monPerTokenScaled = 0.5e18; // default: 2 tokens → 1 MON

    function setRates(uint256 _tokensPerMonScaled, uint256 _monPerTokenScaled) external {
        tokensPerMonScaled = _tokensPerMonScaled;
        monPerTokenScaled = _monPerTokenScaled;
    }

    receive() external payable {}

    function buyTokens(address token, uint256 minTokensOut, uint256 /*deadline*/) external payable {
        uint256 tokensOut = (msg.value * tokensPerMonScaled) / 1e18;
        require(tokensOut >= minTokensOut, "MockRouter: slippage");
        // Transfer tokens from this contract to caller
        IERC20(token).transfer(msg.sender, tokensOut);
    }

    function sellTokens(address token, uint256 tokenAmount, uint256 minMonOut, uint256 /*deadline*/) external {
        uint256 monOut = (tokenAmount * monPerTokenScaled) / 1e18;
        require(monOut >= minMonOut, "MockRouter: slippage");
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        (bool ok, ) = msg.sender.call{value: monOut}("");
        require(ok, "MockRouter: ETH transfer failed");
    }
}
