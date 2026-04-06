// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPlayerVault.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/INadfunRouter.sol";

/**
 * @title PlayerVault
 * @notice Vault that holds native MON for a poker agent and executes per-hand
 *         NAV-accretive rebalancing via the nad.fun bonding-curve router.
 *
 * Treasury accounting (PROJECT.md §7.1):
 *   A = external assets  = address(this).balance - totalEscrow
 *   T = agent token total supply
 *   B = vault balance of own token (contra-equity, NOT an asset)
 *   N = outstanding shares = T - B
 *   P = NAV per share = A / N  (in wei-per-token-wei, scaled ×1e18 for precision)
 *
 * Rebalancing constraints (PROJECT.md §7.2):
 *   Buy:  q_buy  = monIn  / tokenOut ≤ P  →  monIn  × N ≤ A × tokenOut
 *   Sell: q_sell = monOut / tokenIn  ≥ P  →  monOut × N ≥ A × tokenIn
 *   If either condition is violated the transaction reverts.
 */
contract PlayerVault is IPlayerVault {
    // ─── Constants ────────────────────────────────────────────────────────────

    uint256 private constant MAX_BPS = 10_000;
    uint256 private constant REBALANCE_DEADLINE_BUFFER = 5 minutes;

    // ─── State Variables ──────────────────────────────────────────────────────

    address public owner;
    mapping(address => bool) public authorizedTables;
    mapping(address => uint256) public tableEscrow;
    uint256 public totalEscrow;
    uint256 public lastSnapshotHandId;
    int256 public cumulativePnl;
    uint256 public handCount;
    bool public initialized;
    bool private _entered;

    // Rebalancing config
    address public agentToken;
    address public nadfunRouter;
    /// @notice Max basis points of external assets that may be spent in a single buy.
    uint256 public rebalanceMaxMonBps;
    /// @notice Max basis points of treasury-owned tokens that may be sold in a single sell.
    uint256 public rebalanceMaxTokenBps;
    /// @notice Hand ID for which rebalancing was last executed (at most once per hand).
    uint256 public lastRebalanceHandId;

    // ─── Modifiers ────────────────────────────────────────────────────────────

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorizedTable() {
        require(authorizedTables[msg.sender], "Not authorized table");
        _;
    }

    modifier nonReentrant() {
        require(!_entered, "Reentrant call");
        _entered = true;
        _;
        _entered = false;
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    constructor(address _owner) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
    }

    function initialize() external {
        require(!initialized, "Already initialized");
        initialized = true;
        emit VaultInitialized(owner, getExternalAssets());
    }

    // ─── Receive ──────────────────────────────────────────────────────────────

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ─── External Functions ───────────────────────────────────────────────────

    function deposit() external payable override {
        require(msg.value > 0, "Zero deposit");
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount, address recipient) external override onlyOwner nonReentrant {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(recipient, amount);
    }

    function fundBuyIn(address table, uint256 amount) external override onlyOwner {
        require(table != address(0), "Invalid table");
        require(amount > 0, "Zero amount");
        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");
        tableEscrow[table] += amount;
        totalEscrow += amount;
        emit BuyInFunded(table, amount);
    }

    function releaseEscrow(address table, uint256 amount) external onlyOwner {
        require(amount <= tableEscrow[table], "Exceeds escrow");
        tableEscrow[table] -= amount;
        totalEscrow -= amount;
        emit EscrowReleased(table, amount);
    }

    function onSettlement(uint256 handId, int256 pnl) external override onlyAuthorizedTable {
        cumulativePnl += pnl;
        handCount++;
        lastSnapshotHandId = handId;
        if (pnl >= 0) {
            emit SettlementReceived(msg.sender, handId, uint256(pnl));
        } else {
            emit SettlementLoss(msg.sender, handId, uint256(-pnl));
        }
        emit VaultSnapshot(handId, getExternalAssets(), cumulativePnl);
    }

    function receiveSettlement(uint256 handId) external payable {
        require(msg.value > 0, "Zero settlement");
        if (authorizedTables[msg.sender]) {
            emit SettlementReceived(msg.sender, handId, msg.value);
            emit VaultSnapshot(handId, getExternalAssets(), cumulativePnl);
        } else {
            emit Deposited(msg.sender, msg.value);
        }
    }

    // ─── Rebalancing ──────────────────────────────────────────────────────────

    /**
     * @notice Configure the agent token and nad.fun router for rebalancing.
     * @param _agentToken       ERC-20 agent token address.
     * @param _router           nad.fun bonding-curve router address.
     * @param _maxMonBps        Max buy size in basis points of external assets (0–10000).
     * @param _maxTokenBps      Max sell size in basis points of vault-owned tokens (0–10000).
     */
    function setRebalanceConfig(
        address _agentToken,
        address _router,
        uint256 _maxMonBps,
        uint256 _maxTokenBps
    ) external onlyOwner {
        require(_agentToken != address(0), "Invalid token");
        require(_router != address(0), "Invalid router");
        require(_maxMonBps <= MAX_BPS, "maxMonBps > 100%");
        require(_maxTokenBps <= MAX_BPS, "maxTokenBps > 100%");
        agentToken = _agentToken;
        nadfunRouter = _router;
        rebalanceMaxMonBps = _maxMonBps;
        rebalanceMaxTokenBps = _maxTokenBps;
    }

    /**
     * @notice Execute a NAV-accretive buy of the agent token using external assets.
     *
     * Constraint enforced on-chain:
     *   monIn × N ≤ A × tokenOut   (equivalent to q_buy ≤ P)
     *
     * @param handId      Must equal the most recently settled hand (per-hand policy).
     * @param monIn       Native MON to spend (must satisfy size limit).
     * @param minTokenOut Minimum tokens to accept (slippage guard passed to router).
     */
    function rebalanceBuy(
        uint256 handId,
        uint256 monIn,
        uint256 minTokenOut
    ) external onlyOwner nonReentrant {
        _checkRebalanceEligibility(handId);
        require(monIn > 0, "Zero monIn");

        address token = agentToken;
        address router = nadfunRouter;
        require(token != address(0), "Agent token not set");
        require(router != address(0), "Router not set");

        // Snapshot NAV state before trade.
        uint256 A = getExternalAssets();
        uint256 B = IERC20(token).balanceOf(address(this));
        uint256 T = IERC20(token).totalSupply();
        require(T > B, "No outstanding shares");
        uint256 N = T - B;

        // Enforce size limit: monIn ≤ A × rebalanceMaxMonBps / MAX_BPS.
        require(A > 0, "No external assets");
        require(monIn <= (A * rebalanceMaxMonBps) / MAX_BPS, "Buy exceeds size limit");
        require(monIn <= A, "monIn exceeds available assets");

        // Execute the buy via nad.fun router.
        uint256 tokensBefore = B;
        INadfunBondingRouter(router).buyTokens{value: monIn}(
            token,
            minTokenOut,
            block.timestamp + REBALANCE_DEADLINE_BUFFER
        );
        uint256 tokensAfter = IERC20(token).balanceOf(address(this));
        uint256 tokenOut = tokensAfter - tokensBefore;
        require(tokenOut > 0, "No tokens received");

        // Accretive-only check: monIn × N ≤ A × tokenOut  ↔  q_buy ≤ P.
        require(monIn * N <= A * tokenOut, "Buy would dilute NAV");

        // Mark this hand as rebalanced.
        lastRebalanceHandId = handId;

        // Emit with scaled NAV (×1e18) so callers can interpret as wei-per-token-wei.
        uint256 navBefore = (A * 1e18) / N;
        uint256 A2 = getExternalAssets(); // A − monIn
        uint256 N2 = N - tokenOut;
        uint256 navAfter = N2 > 0 ? (A2 * 1e18) / N2 : 0;
        emit RebalanceBuy(handId, monIn, tokenOut, navBefore, navAfter);
    }

    /**
     * @notice Execute a NAV-accretive sell of treasury-owned agent tokens for external assets.
     *
     * Constraint enforced on-chain:
     *   monOut × N ≥ A × tokenIn   (equivalent to q_sell ≥ P)
     *
     * @param handId     Must equal the most recently settled hand (per-hand policy).
     * @param tokenIn    Amount of agent tokens to sell (must satisfy size limit).
     * @param minMonOut  Minimum MON to accept (slippage guard passed to router).
     */
    function rebalanceSell(
        uint256 handId,
        uint256 tokenIn,
        uint256 minMonOut
    ) external onlyOwner nonReentrant {
        _checkRebalanceEligibility(handId);
        require(tokenIn > 0, "Zero tokenIn");

        address token = agentToken;
        address router = nadfunRouter;
        require(token != address(0), "Agent token not set");
        require(router != address(0), "Router not set");

        // Snapshot NAV state before trade.
        uint256 A = getExternalAssets();
        uint256 B = IERC20(token).balanceOf(address(this));
        uint256 T = IERC20(token).totalSupply();
        require(T > B, "No outstanding shares");
        uint256 N = T - B;

        // Enforce size limit: tokenIn ≤ B × rebalanceMaxTokenBps / MAX_BPS.
        require(B > 0, "No treasury tokens");
        require(tokenIn <= (B * rebalanceMaxTokenBps) / MAX_BPS, "Sell exceeds size limit");
        require(tokenIn <= B, "tokenIn exceeds vault balance");

        // Approve router for exact amount, reset first to handle non-standard tokens.
        IERC20(token).approve(router, 0);
        IERC20(token).approve(router, tokenIn);

        // Execute the sell via nad.fun router.
        uint256 monBefore = address(this).balance;
        INadfunBondingRouter(router).sellTokens(
            token,
            tokenIn,
            minMonOut,
            block.timestamp + REBALANCE_DEADLINE_BUFFER
        );
        uint256 monAfter = address(this).balance;
        require(monAfter > monBefore, "No MON received");
        uint256 monOut = monAfter - monBefore;

        // Accretive-only check: monOut × N ≥ A × tokenIn  ↔  q_sell ≥ P.
        require(monOut * N >= A * tokenIn, "Sell would dilute NAV");

        // Reset approval to zero after use.
        IERC20(token).approve(router, 0);

        // Mark this hand as rebalanced.
        lastRebalanceHandId = handId;

        // Emit with scaled NAV (×1e18).
        uint256 navBefore = (A * 1e18) / N;
        uint256 A2 = getExternalAssets(); // A + monOut
        uint256 N2 = N + tokenIn;
        uint256 navAfter = (A2 * 1e18) / N2;
        emit RebalanceSell(handId, tokenIn, monOut, navBefore, navAfter);
    }

    // ─── Admin Functions ──────────────────────────────────────────────────────

    function authorizeTable(address table) external onlyOwner {
        require(table != address(0), "Invalid table");
        authorizedTables[table] = true;
    }

    function revokeTable(address table) external onlyOwner {
        authorizedTables[table] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    // ─── View Functions ───────────────────────────────────────────────────────

    function getExternalAssets() public view override returns (uint256) {
        return address(this).balance > totalEscrow ? address(this).balance - totalEscrow : 0;
    }

    function getAvailableBalance() public view returns (uint256) {
        uint256 total = address(this).balance;
        return total > totalEscrow ? total - totalEscrow : 0;
    }

    function getCumulativePnl() external view override returns (int256) {
        return cumulativePnl;
    }

    function getHandCount() external view override returns (uint256) {
        return handCount;
    }

    function emitSnapshot() external onlyOwner {
        emit VaultSnapshot(0, getExternalAssets(), cumulativePnl);
    }

    // ─── Internal Helpers ─────────────────────────────────────────────────────

    function _checkRebalanceEligibility(uint256 handId) internal view {
        require(lastSnapshotHandId > 0, "No settled hand yet");
        require(handId == lastSnapshotHandId, "Not current settled hand");
        require(handId != lastRebalanceHandId, "Already rebalanced this hand");
    }
}
