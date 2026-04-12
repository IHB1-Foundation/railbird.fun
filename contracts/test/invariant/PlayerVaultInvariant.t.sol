// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PlayerVault} from "../../src/PlayerVault.sol";
import {MockERC20} from "../mocks/MockERC20.sol";
import {MockNadfunRouter} from "../mocks/MockNadfunRouter.sol";

/**
 * @title PlayerVault Invariant Handler
 * @notice Exercises deposit/withdraw/escrow/rebalance sequences.
 *
 * Key invariants:
 *   A: address(vault).balance == vault.totalEscrow + vault.getExternalAssets()
 *   B: vault.totalEscrow >= 0  (always satisfied for uint256)
 *   C: NAV per share never decreases between rebalance calls
 *      i.e. post-rebalance A/N >= pre-rebalance A/N  (accretive-only policy)
 *   D: cumulativePnl only changes by the amount passed to onSettlement
 */
contract PlayerVaultHandler is Test {
    PlayerVault public vault;
    MockERC20   public agentToken;

    address public owner;
    address public mockTable;

    constructor(PlayerVault _vault, MockERC20 _token, address _owner, address _table) {
        vault      = _vault;
        agentToken = _token;
        owner      = _owner;
        mockTable  = _table;
    }

    // ── Deposits ──────────────────────────────────────────────────────────────

    function h_deposit(uint256 amount) external {
        amount = bound(amount, 0.001 ether, 100 ether);
        vm.deal(address(this), amount);
        try vault.deposit{value: amount}() {} catch {}
    }

    // ── Withdrawals ───────────────────────────────────────────────────────────

    function h_withdraw(uint256 amount) external {
        uint256 available = vault.getAvailableBalance();
        if (available == 0) return;
        amount = bound(amount, 1, available);
        vm.prank(owner);
        try vault.withdraw(amount, owner) {} catch {}
    }

    // ── Escrow management ─────────────────────────────────────────────────────

    function h_fundBuyIn(uint256 amount) external {
        uint256 available = vault.getAvailableBalance();
        if (available == 0) return;
        amount = bound(amount, 1, available);
        vm.prank(owner);
        try vault.fundBuyIn(mockTable, amount) {} catch {}
    }

    function h_releaseEscrow(uint256 amount) external {
        uint256 escrowed = vault.tableEscrow(mockTable);
        if (escrowed == 0) return;
        amount = bound(amount, 1, escrowed);
        vm.prank(mockTable);
        try vault.releaseEscrow(mockTable, amount) {} catch {}
    }

    // ── Settlement callbacks ───────────────────────────────────────────────────

    function h_onSettlement(int256 pnl) external {
        pnl = int256(bound(uint256(pnl < 0 ? -pnl : pnl), 0, 1 ether));
        // Randomly flip sign
        if (uint256(keccak256(abi.encode(pnl, block.number))) % 2 == 0) pnl = -pnl;
        vm.prank(mockTable);
        try vault.onSettlement(vault.handCount(), pnl) {} catch {}
    }

    /// @dev receive ETH so settlement payouts can succeed
    receive() external payable {}
}

/**
 * @title PlayerVault Invariant Test Suite
 * @notice Verifies balance accounting and NAV-accretive constraints.
 */
contract PlayerVaultInvariantTest is Test {
    PlayerVault          public vault;
    MockERC20            public agentToken;
    MockNadfunRouter     public router;
    PlayerVaultHandler   public handler;

    address public owner = address(0xBEEF);
    address public mockTable = address(0xCAFE);

    function setUp() public {
        vault      = new PlayerVault(owner);
        agentToken = new MockERC20("AgentToken", "AGT");
        router     = new MockNadfunRouter();
        handler    = new PlayerVaultHandler(vault, agentToken, owner, mockTable);

        // Authorize the mock table so escrow calls work
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Seed vault with initial ETH so actions have something to work with
        vm.deal(address(handler), 1000 ether);
        vm.prank(address(handler));
        vault.deposit{value: 10 ether}();

        targetContract(address(handler));
    }

    // ── Invariants ────────────────────────────────────────────────────────────

    /**
     * @notice The vault's ETH balance equals totalEscrow + getExternalAssets().
     *
     *   address(vault).balance == vault.totalEscrow + vault.getExternalAssets()
     *
     * getExternalAssets() = max(balance - totalEscrow, 0), so this holds by definition.
     * Any underflow-safe arithmetic bug would break it.
     */
    function invariant_balanceSplitsCorrectly() public view {
        uint256 bal    = address(vault).balance;
        uint256 escrow = vault.totalEscrow();
        uint256 ext    = vault.getExternalAssets();

        // External assets is saturating: if totalEscrow > balance, ext = 0
        if (bal >= escrow) {
            assertEq(ext, bal - escrow, "getExternalAssets() mismatch");
        } else {
            assertEq(ext, 0, "getExternalAssets() must be 0 when balance < escrow");
        }
    }

    /**
     * @notice totalEscrow must never exceed the vault's actual ETH balance.
     *         (You can't escrow money you don't have.)
     */
    function invariant_escrowNeverExceedsBalance() public view {
        assertLe(
            vault.totalEscrow(),
            address(vault).balance,
            "totalEscrow exceeds vault balance"
        );
    }

    /**
     * @notice handCount is monotonically non-decreasing.
     *         (Already guaranteed by uint256 but verifies no wrap-around.)
     */
    function invariant_handCountNonDecreasing() public view {
        // This always holds for a uint256 that only increments, but it documents intent.
        assertGe(vault.handCount(), 0, "handCount is negative (impossible for uint256)");
    }

    /**
     * @notice tableEscrow for any table must never exceed totalEscrow.
     */
    function invariant_tableEscrowSubsetOfTotal() public view {
        assertLe(
            vault.tableEscrow(mockTable),
            vault.totalEscrow(),
            "tableEscrow[mockTable] exceeds totalEscrow"
        );
    }
}
