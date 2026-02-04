// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPlayerVault.sol";

/**
 * @title PlayerVault
 * @notice Vault that holds external assets for a poker agent and participates in table settlement.
 * @dev MVP: Holds MON (native token), provides buy-in funding, receives settlements, emits snapshots.
 *
 * Accounting model (from PROJECT.md Section 7):
 * - A = external assets of the vault (MON/WMON balance)
 * - T = total token supply (agent token)
 * - B = vault balance of its own token (treasury shares, NOT an asset)
 * - N = outstanding shares = T - B
 * - P = NAV per share = A / N
 *
 * Key rule: B is NOT an asset. It only reduces N.
 */
contract PlayerVault is IPlayerVault {
    // ============ State Variables ============

    /// @notice The agent token this vault is associated with
    address public agentToken;

    /// @notice Owner of the vault (agent owner)
    address public owner;

    /// @notice Authorized tables that can call onSettlement
    mapping(address => bool) public authorizedTables;

    /// @notice Amount currently escrowed for buy-ins at each table
    mapping(address => uint256) public tableEscrow;

    /// @notice Total amount currently escrowed across all tables
    uint256 public totalEscrow;

    /// @notice Last hand ID for which we emitted a snapshot
    uint256 public lastSnapshotHandId;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorizedTable() {
        require(authorizedTables[msg.sender], "Not authorized table");
        _;
    }

    // ============ Constructor ============

    /**
     * @notice Create a new player vault.
     * @param _agentToken The agent token address (for NAV calculations)
     * @param _owner The owner of this vault (agent owner)
     */
    constructor(address _agentToken, address _owner) {
        require(_owner != address(0), "Invalid owner");
        agentToken = _agentToken;
        owner = _owner;
    }

    // ============ Receive/Fallback ============

    /// @notice Allow vault to receive native MON
    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ============ External Functions ============

    /**
     * @notice Deposit external assets to the vault.
     */
    function deposit() external payable override {
        require(msg.value > 0, "Zero deposit");
        emit Deposited(msg.sender, msg.value);
    }

    /**
     * @notice Withdraw external assets from the vault.
     * @param amount Amount to withdraw
     * @param recipient Address to receive the withdrawal
     */
    function withdraw(uint256 amount, address recipient) external override onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");

        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");

        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");

        emit Withdrawn(recipient, amount);
    }

    /**
     * @notice Fund a buy-in at a poker table.
     * @dev Allocates funds from vault to be used for table buy-in.
     * @param table The poker table address
     * @param amount Amount to allocate for buy-in
     */
    function fundBuyIn(address table, uint256 amount) external override onlyOwner {
        require(table != address(0), "Invalid table");
        require(amount > 0, "Zero amount");

        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");

        tableEscrow[table] += amount;
        totalEscrow += amount;

        emit BuyInFunded(table, amount);
    }

    /**
     * @notice Release escrowed funds back to available balance.
     * @dev Called when buy-in is cancelled or table closes.
     * @param table The poker table address
     * @param amount Amount to release from escrow
     */
    function releaseEscrow(address table, uint256 amount) external onlyOwner {
        require(amount <= tableEscrow[table], "Exceeds escrow");

        tableEscrow[table] -= amount;
        totalEscrow -= amount;
    }

    /**
     * @notice Called by table to notify vault of settlement.
     * @dev Updates accounting and emits VaultSnapshot.
     * @param handId The hand ID that was settled
     * @param pnl The profit/loss from the hand (positive = win, negative = loss)
     */
    function onSettlement(uint256 handId, int256 pnl) external override onlyAuthorizedTable {
        // For now, the actual MON transfer happens separately
        // This callback is for accounting and snapshot emission

        lastSnapshotHandId = handId;
        _emitSnapshot(handId);

        emit SettlementReceived(msg.sender, handId, pnl >= 0 ? uint256(pnl) : 0);
    }

    /**
     * @notice Receive settlement payment from a table.
     * @dev Called when vault wins a hand - receives the pot.
     * @param handId The hand ID for reference
     */
    function receiveSettlement(uint256 handId) external payable {
        require(msg.value > 0, "Zero settlement");

        // If from authorized table, emit settlement event
        if (authorizedTables[msg.sender]) {
            emit SettlementReceived(msg.sender, handId, msg.value);
            _emitSnapshot(handId);
        } else {
            // Treat as regular deposit
            emit Deposited(msg.sender, msg.value);
        }
    }

    // ============ Admin Functions ============

    /**
     * @notice Authorize a table to call onSettlement.
     * @param table The poker table address
     */
    function authorizeTable(address table) external onlyOwner {
        require(table != address(0), "Invalid table");
        authorizedTables[table] = true;
    }

    /**
     * @notice Revoke table authorization.
     * @param table The poker table address
     */
    function revokeTable(address table) external onlyOwner {
        authorizedTables[table] = false;
    }

    /**
     * @notice Transfer vault ownership.
     * @param newOwner The new owner address
     */
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    // ============ View Functions ============

    /**
     * @notice Get current external assets (A).
     * @dev Total balance minus any payables, plus claimable amounts.
     *      For MVP, this is simply the vault's native balance.
     */
    function getExternalAssets() public view override returns (uint256) {
        return address(this).balance;
    }

    /**
     * @notice Get available balance (not escrowed).
     */
    function getAvailableBalance() public view returns (uint256) {
        uint256 total = address(this).balance;
        return total > totalEscrow ? total - totalEscrow : 0;
    }

    /**
     * @notice Get treasury shares (B) - vault's balance of own token.
     * @dev Returns 0 if no agent token is set.
     */
    function getTreasuryShares() public view override returns (uint256) {
        if (agentToken == address(0)) {
            return 0;
        }
        // Query ERC20 balance of vault's own token
        // For MVP, we do a low-level call to avoid importing IERC20
        (bool success, bytes memory data) = agentToken.staticcall(
            abi.encodeWithSignature("balanceOf(address)", address(this))
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /**
     * @notice Get total token supply (T).
     * @dev Returns 0 if no agent token is set.
     */
    function getTotalSupply() public view returns (uint256) {
        if (agentToken == address(0)) {
            return 0;
        }
        (bool success, bytes memory data) = agentToken.staticcall(
            abi.encodeWithSignature("totalSupply()")
        );
        if (success && data.length >= 32) {
            return abi.decode(data, (uint256));
        }
        return 0;
    }

    /**
     * @notice Get outstanding shares (N = T - B).
     */
    function getOutstandingShares() public view override returns (uint256) {
        uint256 totalSupply = getTotalSupply();
        uint256 treasuryShares = getTreasuryShares();

        if (totalSupply == 0) {
            // No token set or zero supply - use 1e18 as virtual outstanding for P calculation
            return 1e18;
        }

        // N = T - B (treasury shares reduce outstanding)
        return totalSupply > treasuryShares ? totalSupply - treasuryShares : 0;
    }

    /**
     * @notice Get NAV per share (P = A / N), scaled by 1e18.
     * @dev Returns the value of one share in terms of external assets.
     */
    function getNavPerShare() public view override returns (uint256) {
        uint256 assets = getExternalAssets();
        uint256 outstanding = getOutstandingShares();

        if (outstanding == 0) {
            // No outstanding shares - undefined NAV
            return 0;
        }

        // P = A / N, scaled by 1e18
        return (assets * 1e18) / outstanding;
    }

    /**
     * @notice Get full accounting snapshot.
     * @return A External assets
     * @return B Treasury shares
     * @return N Outstanding shares
     * @return P NAV per share (scaled by 1e18)
     */
    function getAccountingSnapshot() external view returns (
        uint256 A,
        uint256 B,
        uint256 N,
        uint256 P
    ) {
        A = getExternalAssets();
        B = getTreasuryShares();
        N = getOutstandingShares();
        P = getNavPerShare();
    }

    // ============ Internal Functions ============

    /**
     * @notice Emit a vault snapshot event.
     * @param handId The hand ID (0 for non-hand events)
     */
    function _emitSnapshot(uint256 handId) internal {
        emit VaultSnapshot(
            handId,
            getExternalAssets(),
            getTreasuryShares(),
            getOutstandingShares(),
            getNavPerShare()
        );
    }

    /**
     * @notice Force emit a snapshot (for manual updates).
     */
    function emitSnapshot() external onlyOwner {
        _emitSnapshot(0);
    }
}
