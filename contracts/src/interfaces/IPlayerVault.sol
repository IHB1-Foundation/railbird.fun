// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title IPlayerVault
 * @notice Interface for player vault that holds external assets and participates in table settlement.
 *
 * ============ EVENT SCHEMA FOR INDEXERS ============
 *
 * This contract emits events that enable indexers to compute:
 * - ROI (Return on Investment): (P_current - P_initial) / P_initial
 * - MDD (Maximum Drawdown): max((P_peak - P_trough) / P_peak) over time
 * - Cumulative PnL: Sum of all realized gains/losses
 * - Time-windowed metrics: Use block.timestamp from transaction receipts
 *
 * Key events:
 * - VaultInitialized: Emitted once at vault creation, marks baseline P for ROI
 * - VaultSnapshot: Emitted after each settlement, contains full accounting state
 *
 * Indexer algorithm for ROI:
 *   1. Store initialNavPerShare from VaultInitialized event
 *   2. On each VaultSnapshot, compute ROI = (navPerShare - initial) / initial
 *
 * Indexer algorithm for MDD:
 *   1. Track peakNav (highest navPerShare seen)
 *   2. On each VaultSnapshot:
 *      - If navPerShare > peakNav: update peakNav
 *      - Compute drawdown = (peakNav - navPerShare) / peakNav
 *      - Track maxDrawdown = max(maxDrawdown, drawdown)
 *
 * All values use 1e18 scaling for precision.
 * ===================================================
 */
interface IPlayerVault {
    /**
     * @notice Emitted once when the vault is initialized.
     * @dev This marks the baseline for ROI calculations.
     * @param agentToken The associated agent token address
     * @param owner The initial owner of the vault
     * @param initialAssets Starting external assets
     * @param initialNavPerShare Starting NAV per share (baseline for ROI)
     */
    event VaultInitialized(
        address indexed agentToken,
        address indexed owner,
        uint256 initialAssets,
        uint256 initialNavPerShare
    );

    /**
     * @notice Emitted after each settlement or significant balance change.
     * @dev Indexers should store all snapshots for MDD/ROI time series.
     * @param handId The hand ID that triggered this snapshot (0 for non-hand events)
     * @param externalAssets (A) Total external assets held by the vault
     * @param treasuryShares (B) Vault's balance of its own token
     * @param outstandingShares (N) Total supply minus treasury shares (T - B)
     * @param navPerShare (P) NAV per share = A / N (scaled by 1e18)
     * @param cumulativePnl Cumulative realized PnL since vault creation (can be negative via int256)
     */
    event VaultSnapshot(
        uint256 indexed handId,
        uint256 externalAssets,
        uint256 treasuryShares,
        uint256 outstandingShares,
        uint256 navPerShare,
        int256 cumulativePnl
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

    /**
     * @notice Get cumulative realized PnL since vault creation.
     * @dev Positive = net profit, negative = net loss.
     */
    function getCumulativePnl() external view returns (int256);

    /**
     * @notice Get the initial NAV per share at vault creation.
     * @dev Used as baseline for ROI calculations.
     */
    function getInitialNavPerShare() external view returns (uint256);

    /**
     * @notice Get total number of hands settled by this vault.
     * @dev Used for winrate calculations.
     */
    function getHandCount() external view returns (uint256);
}
