// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPlayerVault.sol";
import "./interfaces/INadfunLens.sol";
import "./interfaces/INadfunRouter.sol";

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
 *
 * Rebalancing constraints (accretive-only):
 * - Buy: q_buy = monIn / tokenOut <= P (buy at or below NAV)
 * - Sell: q_sell = monOut / tokenIn >= P (sell at or above NAV)
 * - Only allowed after HandSettled, at most once per hand
 * - Size capped by configurable bps of A (for buys) or B (for sells)
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

    /// @notice Cumulative realized PnL since vault creation (can be negative)
    int256 public cumulativePnl;

    /// @notice Initial NAV per share at vault creation (baseline for ROI)
    uint256 public initialNavPerShare;

    /// @notice Total number of hands settled
    uint256 public handCount;

    /// @notice Whether the vault has been initialized (for one-time setup)
    bool public initialized;

    // ============ Rebalancing State ============

    /// @notice nad.fun Lens contract for quotes
    address public nadfunLens;

    /// @notice nad.fun Router contract for trades (can be bonding or DEX router)
    address public nadfunRouter;

    /// @notice Last hand ID for which rebalancing was executed
    uint256 public lastRebalancedHandId;

    /// @notice Maximum MON to spend on buy rebalance (basis points of A)
    uint256 public rebalanceMaxMonBps;

    /// @notice Maximum tokens to sell on sell rebalance (basis points of B)
    uint256 public rebalanceMaxTokenBps;

    /// @notice Default transaction deadline offset (seconds)
    uint256 public constant REBALANCE_DEADLINE_OFFSET = 300; // 5 minutes

    /// @notice Basis points denominator
    uint256 public constant BPS_DENOMINATOR = 10000;

    // ============ Randomized Delay State ============

    /// @notice Block number after which rebalancing is allowed for the current hand
    uint256 public rebalanceEligibleBlock;

    /// @notice Maximum delay in blocks for rebalancing (R in the formula: delay = vrfRand % R)
    uint256 public rebalanceDelayMaxBlocks;

    // ============ Rebalancing Events ============

    /**
     * @notice Emitted when treasury buys its own token.
     * @param handId The hand ID that triggered this rebalance
     * @param monSpent Amount of MON spent
     * @param tokensReceived Amount of tokens received
     * @param executionPrice Effective price (monSpent * 1e18 / tokensReceived)
     * @param navPerShareBefore NAV per share before rebalance
     * @param navPerShareAfter NAV per share after rebalance
     */
    event RebalanceBuy(
        uint256 indexed handId,
        uint256 monSpent,
        uint256 tokensReceived,
        uint256 executionPrice,
        uint256 navPerShareBefore,
        uint256 navPerShareAfter
    );

    /**
     * @notice Emitted when treasury sells its own token.
     * @param handId The hand ID that triggered this rebalance
     * @param tokensSold Amount of tokens sold
     * @param monReceived Amount of MON received
     * @param executionPrice Effective price (monReceived * 1e18 / tokensSold)
     * @param navPerShareBefore NAV per share before rebalance
     * @param navPerShareAfter NAV per share after rebalance
     */
    event RebalanceSell(
        uint256 indexed handId,
        uint256 tokensSold,
        uint256 monReceived,
        uint256 executionPrice,
        uint256 navPerShareBefore,
        uint256 navPerShareAfter
    );

    /**
     * @notice Emitted when rebalancing config is updated.
     */
    event RebalanceConfigUpdated(
        address nadfunLens,
        address nadfunRouter,
        uint256 maxMonBps,
        uint256 maxTokenBps
    );

    /**
     * @notice Emitted when rebalance delay window is set after settlement.
     * @param handId The hand ID that triggered the delay
     * @param eligibleBlock Block number after which rebalancing is allowed
     * @param delayBlocks Number of blocks to wait (derived from VRF randomness)
     */
    event RebalanceDelaySet(
        uint256 indexed handId,
        uint256 eligibleBlock,
        uint256 delayBlocks
    );

    /**
     * @notice Emitted when rebalance delay config is updated.
     */
    event RebalanceDelayConfigUpdated(uint256 maxDelayBlocks);

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

    /**
     * @notice Initialize the vault with baseline values.
     * @dev Must be called after initial deposit to set proper baseline NAV.
     *      Can only be called once.
     */
    function initialize() external {
        require(!initialized, "Already initialized");
        initialized = true;

        initialNavPerShare = getNavPerShare();

        emit VaultInitialized(
            agentToken,
            owner,
            getExternalAssets(),
            initialNavPerShare
        );
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
     *      No randomized delay - rebalancing allowed immediately.
     * @param handId The hand ID that was settled
     * @param pnl The profit/loss from the hand (positive = win, negative = loss)
     */
    function onSettlement(uint256 handId, int256 pnl) external override onlyAuthorizedTable {
        _processSettlement(handId, pnl);
        // Immediate eligibility (no delay)
        rebalanceEligibleBlock = block.number;
    }

    /**
     * @notice Called by table to notify vault of settlement with VRF randomness.
     * @dev Updates accounting and sets randomized delay before rebalancing is allowed.
     *      This reduces predictability of when rebalancing will occur.
     * @param handId The hand ID that was settled
     * @param pnl The profit/loss from the hand (positive = win, negative = loss)
     * @param vrfRandomness The VRF randomness from the hand (used to compute delay)
     */
    function onSettlementWithVRF(uint256 handId, int256 pnl, uint256 vrfRandomness) external override onlyAuthorizedTable {
        _processSettlement(handId, pnl);
        _setRebalanceDelay(handId, vrfRandomness);
    }

    /**
     * @notice Internal function to process settlement accounting.
     */
    function _processSettlement(uint256 handId, int256 pnl) internal {
        // Update cumulative PnL and hand count
        cumulativePnl += pnl;
        handCount++;

        lastSnapshotHandId = handId;
        _emitSnapshot(handId);

        emit SettlementReceived(msg.sender, handId, pnl >= 0 ? uint256(pnl) : 0);
    }

    /**
     * @notice Internal function to set randomized rebalance delay.
     * @param handId The hand ID for event emission
     * @param vrfRandomness The VRF randomness to derive delay from
     */
    function _setRebalanceDelay(uint256 handId, uint256 vrfRandomness) internal {
        uint256 delayBlocks = 0;
        if (rebalanceDelayMaxBlocks > 0) {
            // Derive delay from VRF: delay = vrfRandomness % maxDelay
            delayBlocks = vrfRandomness % rebalanceDelayMaxBlocks;
        }
        rebalanceEligibleBlock = block.number + delayBlocks;

        emit RebalanceDelaySet(handId, rebalanceEligibleBlock, delayBlocks);
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

    // ============ Rebalancing Functions ============

    /**
     * @notice Set rebalancing configuration.
     * @param _nadfunLens nad.fun Lens contract address
     * @param _nadfunRouter nad.fun Router contract address
     * @param _maxMonBps Max MON to spend on buy (basis points of A)
     * @param _maxTokenBps Max tokens to sell (basis points of B)
     */
    function setRebalanceConfig(
        address _nadfunLens,
        address _nadfunRouter,
        uint256 _maxMonBps,
        uint256 _maxTokenBps
    ) external onlyOwner {
        require(_maxMonBps <= BPS_DENOMINATOR, "Invalid maxMonBps");
        require(_maxTokenBps <= BPS_DENOMINATOR, "Invalid maxTokenBps");

        nadfunLens = _nadfunLens;
        nadfunRouter = _nadfunRouter;
        rebalanceMaxMonBps = _maxMonBps;
        rebalanceMaxTokenBps = _maxTokenBps;

        emit RebalanceConfigUpdated(_nadfunLens, _nadfunRouter, _maxMonBps, _maxTokenBps);
    }

    /**
     * @notice Set rebalancing delay configuration.
     * @dev Delay is computed as: eligibleBlock = currentBlock + (vrfRand % maxDelayBlocks)
     * @param _maxDelayBlocks Maximum delay in blocks (R in the formula)
     */
    function setRebalanceDelayConfig(uint256 _maxDelayBlocks) external onlyOwner {
        rebalanceDelayMaxBlocks = _maxDelayBlocks;
        emit RebalanceDelayConfigUpdated(_maxDelayBlocks);
    }

    /**
     * @notice Execute a buy rebalance (treasury buys its own token).
     * @dev Buys token using MON. Requires:
     *      - Settlement has occurred (handCount > 0 and lastSnapshotHandId > lastRebalancedHandId)
     *      - Execution price q_buy <= P (accretive constraint)
     *      - Amount within size cap
     * @param monAmount Amount of MON to spend
     * @param minTokenOut Minimum tokens to receive (slippage protection)
     */
    function rebalanceBuy(uint256 monAmount, uint256 minTokenOut) external onlyOwner {
        require(nadfunRouter != address(0), "Router not configured");
        require(agentToken != address(0), "No agent token");
        require(monAmount > 0, "Zero amount");

        // Must have settled at least one hand
        require(handCount > 0, "No settlement yet");
        // Must not have rebalanced this hand already
        require(lastSnapshotHandId > lastRebalancedHandId, "Already rebalanced this hand");
        // Must wait for randomized delay window
        require(block.number >= rebalanceEligibleBlock, "Rebalance delay not passed");

        // Check size cap
        uint256 maxMon = (getExternalAssets() * rebalanceMaxMonBps) / BPS_DENOMINATOR;
        require(monAmount <= maxMon, "Exceeds max buy size");

        // Check available balance (not escrowed)
        uint256 available = getAvailableBalance();
        require(monAmount <= available, "Insufficient available balance");

        // Get NAV per share before
        uint256 navBefore = getNavPerShare();
        require(navBefore > 0, "Zero NAV");

        // Execute buy via router
        uint256 deadline = block.timestamp + REBALANCE_DEADLINE_OFFSET;
        uint256 tokensReceived = INadfunRouter(nadfunRouter).buy{value: monAmount}(
            agentToken,
            minTokenOut,
            deadline,
            address(this)
        );

        require(tokensReceived > 0, "Zero tokens received");

        // Calculate execution price: q_buy = monSpent / tokensReceived (scaled by 1e18)
        uint256 executionPrice = (monAmount * 1e18) / tokensReceived;

        // Accretive constraint: q_buy <= P (buy at or below NAV)
        // This ensures we're buying "cheap" relative to NAV
        require(executionPrice <= navBefore, "Price above NAV (not accretive)");

        // Verify NAV didn't decrease (sanity check)
        uint256 navAfter = getNavPerShare();
        require(navAfter >= navBefore, "NAV decreased (invariant violated)");

        // Mark this hand as rebalanced
        lastRebalancedHandId = lastSnapshotHandId;

        emit RebalanceBuy(
            lastSnapshotHandId,
            monAmount,
            tokensReceived,
            executionPrice,
            navBefore,
            navAfter
        );

        // Emit updated snapshot
        _emitSnapshot(lastSnapshotHandId);
    }

    /**
     * @notice Execute a sell rebalance (treasury sells its own token).
     * @dev Sells token for MON. Requires:
     *      - Settlement has occurred (handCount > 0 and lastSnapshotHandId > lastRebalancedHandId)
     *      - Execution price q_sell >= P (accretive constraint)
     *      - Amount within size cap
     * @param tokenAmount Amount of tokens to sell
     * @param minMonOut Minimum MON to receive (slippage protection)
     */
    function rebalanceSell(uint256 tokenAmount, uint256 minMonOut) external onlyOwner {
        require(nadfunRouter != address(0), "Router not configured");
        require(agentToken != address(0), "No agent token");
        require(tokenAmount > 0, "Zero amount");

        // Must have settled at least one hand
        require(handCount > 0, "No settlement yet");
        // Must not have rebalanced this hand already
        require(lastSnapshotHandId > lastRebalancedHandId, "Already rebalanced this hand");
        // Must wait for randomized delay window
        require(block.number >= rebalanceEligibleBlock, "Rebalance delay not passed");

        // Check size cap
        uint256 treasuryShares = getTreasuryShares();
        uint256 maxTokens = (treasuryShares * rebalanceMaxTokenBps) / BPS_DENOMINATOR;
        require(tokenAmount <= maxTokens, "Exceeds max sell size");
        require(tokenAmount <= treasuryShares, "Exceeds treasury balance");

        // Get NAV per share before
        uint256 navBefore = getNavPerShare();
        require(navBefore > 0, "Zero NAV");

        // Approve router to spend tokens
        _approveToken(agentToken, nadfunRouter, tokenAmount);

        // Execute sell via router
        uint256 deadline = block.timestamp + REBALANCE_DEADLINE_OFFSET;
        uint256 monReceived = INadfunRouter(nadfunRouter).sell(
            agentToken,
            tokenAmount,
            minMonOut,
            deadline,
            address(this)
        );

        require(monReceived > 0, "Zero MON received");

        // Calculate execution price: q_sell = monReceived / tokensSold (scaled by 1e18)
        uint256 executionPrice = (monReceived * 1e18) / tokenAmount;

        // Accretive constraint: q_sell >= P (sell at or above NAV)
        // This ensures we're selling "expensive" relative to NAV
        require(executionPrice >= navBefore, "Price below NAV (not accretive)");

        // Verify NAV didn't decrease (sanity check)
        uint256 navAfter = getNavPerShare();
        require(navAfter >= navBefore, "NAV decreased (invariant violated)");

        // Mark this hand as rebalanced
        lastRebalancedHandId = lastSnapshotHandId;

        emit RebalanceSell(
            lastSnapshotHandId,
            tokenAmount,
            monReceived,
            executionPrice,
            navBefore,
            navAfter
        );

        // Emit updated snapshot
        _emitSnapshot(lastSnapshotHandId);
    }

    /**
     * @notice Get rebalancing eligibility status.
     * @return canRebalance Whether rebalancing is currently allowed
     * @return currentHandId The current hand ID (lastSnapshotHandId)
     * @return lastRebalanced The last hand ID that was rebalanced
     * @return eligibleBlock Block number after which rebalancing is allowed
     * @return blocksRemaining Blocks remaining until eligible (0 if already eligible)
     */
    function getRebalanceStatus() external view returns (
        bool canRebalance,
        uint256 currentHandId,
        uint256 lastRebalanced,
        uint256 eligibleBlock,
        uint256 blocksRemaining
    ) {
        currentHandId = lastSnapshotHandId;
        lastRebalanced = lastRebalancedHandId;
        eligibleBlock = rebalanceEligibleBlock;

        // Calculate blocks remaining
        if (block.number < rebalanceEligibleBlock) {
            blocksRemaining = rebalanceEligibleBlock - block.number;
        } else {
            blocksRemaining = 0;
        }

        // Can rebalance if: settlement happened, not already rebalanced, and delay passed
        canRebalance = handCount > 0
            && lastSnapshotHandId > lastRebalancedHandId
            && block.number >= rebalanceEligibleBlock;
    }

    /**
     * @notice Approve token spending for router.
     * @param token Token to approve
     * @param spender Address to approve
     * @param amount Amount to approve
     */
    function _approveToken(address token, address spender, uint256 amount) internal {
        (bool success, ) = token.call(
            abi.encodeWithSignature("approve(address,uint256)", spender, amount)
        );
        require(success, "Token approval failed");
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

    /**
     * @notice Get cumulative realized PnL since vault creation.
     * @dev Positive = net profit, negative = net loss.
     */
    function getCumulativePnl() external view override returns (int256) {
        return cumulativePnl;
    }

    /**
     * @notice Get the initial NAV per share at vault creation.
     * @dev Used as baseline for ROI calculations. Returns 0 if not initialized.
     */
    function getInitialNavPerShare() external view override returns (uint256) {
        return initialNavPerShare;
    }

    /**
     * @notice Get total number of hands settled by this vault.
     * @dev Used for winrate calculations (wins / handCount).
     */
    function getHandCount() external view override returns (uint256) {
        return handCount;
    }

    /**
     * @notice Get full accounting data for indexer/UI.
     * @dev Combines all accounting fields needed for ROI/MDD computation.
     * @return A External assets
     * @return B Treasury shares
     * @return N Outstanding shares
     * @return P Current NAV per share
     * @return P0 Initial NAV per share (baseline)
     * @return pnl Cumulative PnL
     * @return hands Total hands settled
     */
    function getFullAccountingData() external view returns (
        uint256 A,
        uint256 B,
        uint256 N,
        uint256 P,
        uint256 P0,
        int256 pnl,
        uint256 hands
    ) {
        A = getExternalAssets();
        B = getTreasuryShares();
        N = getOutstandingShares();
        P = getNavPerShare();
        P0 = initialNavPerShare;
        pnl = cumulativePnl;
        hands = handCount;
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
            getNavPerShare(),
            cumulativePnl
        );
    }

    /**
     * @notice Force emit a snapshot (for manual updates).
     */
    function emitSnapshot() external onlyOwner {
        _emitSnapshot(0);
    }
}
