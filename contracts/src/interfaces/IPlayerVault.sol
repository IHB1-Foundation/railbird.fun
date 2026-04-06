// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPlayerVault
 * @notice Interface for player vault that holds native KAIA and participates in table settlement.
 */
interface IPlayerVault {
    event VaultInitialized(address indexed owner, uint256 initialAssets);
    event VaultSnapshot(uint256 indexed handId, uint256 externalAssets, int256 cumulativePnl);
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event BuyInFunded(address indexed table, uint256 amount);
    event EscrowReleased(address indexed table, uint256 amount);
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);
    /// @dev Emitted when a hand settlement results in a loss (negative PnL)
    event SettlementLoss(address indexed table, uint256 handId, uint256 lossAmount);
    /// @dev Emitted when the treasury buys its own token using external assets (NAV-accretive)
    event RebalanceBuy(uint256 indexed handId, uint256 monIn, uint256 tokenOut, uint256 navBefore, uint256 navAfter);
    /// @dev Emitted when the treasury sells its own token for external assets (NAV-accretive)
    event RebalanceSell(uint256 indexed handId, uint256 tokenIn, uint256 monOut, uint256 navBefore, uint256 navAfter);

    function deposit() external payable;
    function withdraw(uint256 amount, address recipient) external;
    function fundBuyIn(address table, uint256 amount) external;
    function onSettlement(uint256 handId, int256 pnl) external;
    function getExternalAssets() external view returns (uint256);
    function getCumulativePnl() external view returns (int256);
    function getHandCount() external view returns (uint256);
}
