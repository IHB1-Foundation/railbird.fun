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
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);

    function deposit() external payable;
    function withdraw(uint256 amount, address recipient) external;
    function fundBuyIn(address table, uint256 amount) external;
    function onSettlement(uint256 handId, int256 pnl) external;
    function getExternalAssets() external view returns (uint256);
    function getCumulativePnl() external view returns (int256);
    function getHandCount() external view returns (uint256);
}
