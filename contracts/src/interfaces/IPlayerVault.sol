// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPlayerVault
 * @notice Interface for player vault that holds external assets and participates in table settlement.
 */
interface IPlayerVault {
    /**
     * @notice Emitted after each settlement or significant balance change.
     * @param handId The hand ID that triggered this snapshot (0 for non-hand events)
     * @param externalAssets (A) Total external assets held by the vault
     * @param treasuryShares (B) Vault's balance of its own token
     * @param outstandingShares (N) Total supply minus treasury shares (T - B)
     * @param navPerShare (P) NAV per share = A / N (scaled by 1e18)
     */
    event VaultSnapshot(
        uint256 indexed handId,
        uint256 externalAssets,
        uint256 treasuryShares,
        uint256 outstandingShares,
        uint256 navPerShare
    );

    /**
     * @notice Emitted when assets are deposited to the vault.
     */
    event Deposited(address indexed from, uint256 amount);

    /**
     * @notice Emitted when assets are withdrawn from the vault.
     */
    event Withdrawn(address indexed to, uint256 amount);

    /**
     * @notice Emitted when vault funds a buy-in at a table.
     */
    event BuyInFunded(address indexed table, uint256 amount);

    /**
     * @notice Emitted when vault receives settlement from a table.
     */
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);

    /**
     * @notice Deposit external assets to the vault.
     */
    function deposit() external payable;

    /**
     * @notice Withdraw external assets from the vault.
     * @param amount Amount to withdraw
     * @param recipient Address to receive the withdrawal
     */
    function withdraw(uint256 amount, address recipient) external;

    /**
     * @notice Fund a buy-in at a poker table.
     * @param table The poker table address
     * @param amount Amount to allocate for buy-in
     */
    function fundBuyIn(address table, uint256 amount) external;

    /**
     * @notice Called by table to notify vault of settlement.
     * @param handId The hand ID that was settled
     * @param pnl The profit/loss from the hand (positive = win, negative = loss)
     */
    function onSettlement(uint256 handId, int256 pnl) external;

    /**
     * @notice Get current external assets (A).
     */
    function getExternalAssets() external view returns (uint256);

    /**
     * @notice Get treasury shares (B) - vault's balance of own token.
     */
    function getTreasuryShares() external view returns (uint256);

    /**
     * @notice Get outstanding shares (N = T - B).
     */
    function getOutstandingShares() external view returns (uint256);

    /**
     * @notice Get NAV per share (P = A / N), scaled by 1e18.
     */
    function getNavPerShare() external view returns (uint256);
}
