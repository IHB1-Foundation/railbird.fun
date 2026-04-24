// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../../src/interfaces/IERC20.sol";

/**
 * @dev Mock DEX router for testing PlayerVault rebalancing.
 *      buyRate  = tokens returned per 1 ether of msg.value  (tokensOut = msg.value * buyRate / 1e18)
 *      sellRate = wei returned per 1 token-unit             (monOut    = tokenAmount * sellRate)
 *
 *      setRates(buyRate, sellRate) sets both at once.
 */
contract MockDexRouter {
    uint256 public buyRate;   // tokens per ETH (scaled 1e18)
    uint256 public sellRate;  // wei per token unit

    function setRates(uint256 _buyRate, uint256 _sellRate) external {
        buyRate = _buyRate;
        sellRate = _sellRate;
    }

    function setBuyRate(uint256 _rate) external { buyRate = _rate; }
    function setSellRate(uint256 _rate) external { sellRate = _rate; }

    function buyTokens(address token, uint256 /*minTokensOut*/, uint256 /*deadline*/) external payable {
        uint256 tokensOut = (msg.value * buyRate) / 1 ether;
        IERC20(token).transfer(msg.sender, tokensOut);
    }

    function sellTokens(address token, uint256 tokenAmount, uint256 /*minOut*/, uint256 /*deadline*/) external {
        IERC20(token).transferFrom(msg.sender, address(this), tokenAmount);
        uint256 ethOut = (tokenAmount * sellRate) / 1 ether;
        (bool ok, ) = msg.sender.call{value: ethOut}("");
        require(ok, "ETH transfer failed");
    }

    receive() external payable {}
}
