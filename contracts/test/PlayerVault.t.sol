// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerVault.sol";
import "../src/PokerTable.sol";
import "../src/mocks/MockVRFAdapter.sol";

/**
 * @title MockERC20
 * @notice Simple mock ERC20 for testing NAV calculations
 */
contract MockERC20 {
    string public name = "Agent Token";
    string public symbol = "AGENT";
    uint8 public decimals = 18;
    uint256 public totalSupply;
    mapping(address => uint256) public balanceOf;

    function mint(address to, uint256 amount) external {
        balanceOf[to] += amount;
        totalSupply += amount;
    }

    function burn(address from, uint256 amount) external {
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        totalSupply -= amount;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        require(balanceOf[msg.sender] >= amount, "Insufficient balance");
        balanceOf[msg.sender] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PlayerVaultTest is Test {
    PlayerVault public vault;
    MockERC20 public agentToken;
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;

    address public owner = address(0x1);
    address public user = address(0x2);
    address public mockTable = address(0x3);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant INITIAL_DEPOSIT = 10 ether;

    event VaultInitialized(
        address indexed agentToken,
        address indexed owner,
        uint256 initialAssets,
        uint256 initialNavPerShare
    );
    event VaultSnapshot(
        uint256 indexed handId,
        uint256 externalAssets,
        uint256 treasuryShares,
        uint256 outstandingShares,
        uint256 navPerShare,
        int256 cumulativePnl
    );
    event Deposited(address indexed from, uint256 amount);
    event Withdrawn(address indexed to, uint256 amount);
    event BuyInFunded(address indexed table, uint256 amount);
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);

    function setUp() public {
        agentToken = new MockERC20();
        vault = new PlayerVault(address(agentToken), owner);

        // Fund the vault
        vm.deal(address(vault), INITIAL_DEPOSIT);

        // Setup poker table for integration tests
        mockVRF = new MockVRFAdapter();
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF));
    }

    // ============ Constructor Tests ============

    function test_Constructor_Success() public view {
        assertEq(vault.agentToken(), address(agentToken));
        assertEq(vault.owner(), owner);
    }

    function test_Constructor_RevertInvalidOwner() public {
        vm.expectRevert("Invalid owner");
        new PlayerVault(address(agentToken), address(0));
    }

    function test_Constructor_AllowsZeroAgentToken() public {
        PlayerVault v = new PlayerVault(address(0), owner);
        assertEq(v.agentToken(), address(0));
    }

    // ============ Deposit Tests ============

    function test_Deposit_Success() public {
        uint256 amount = 1 ether;

        vm.expectEmit(true, false, false, true);
        emit Deposited(user, amount);

        vm.prank(user);
        vm.deal(user, amount);
        vault.deposit{value: amount}();

        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT + amount);
    }

    function test_Deposit_RevertZeroAmount() public {
        vm.expectRevert("Zero deposit");
        vault.deposit{value: 0}();
    }

    function test_Receive_Success() public {
        uint256 amount = 1 ether;

        vm.deal(user, amount);
        vm.prank(user);

        vm.expectEmit(true, false, false, true);
        emit Deposited(user, amount);

        (bool success,) = address(vault).call{value: amount}("");
        assertTrue(success);

        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT + amount);
    }

    // ============ Withdraw Tests ============

    function test_Withdraw_Success() public {
        uint256 amount = 1 ether;

        vm.prank(owner);
        vm.expectEmit(true, false, false, true);
        emit Withdrawn(user, amount);

        vault.withdraw(amount, user);

        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT - amount);
        assertEq(user.balance, amount);
    }

    function test_Withdraw_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.withdraw(1 ether, user);
    }

    function test_Withdraw_RevertZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("Zero amount");
        vault.withdraw(0, user);
    }

    function test_Withdraw_RevertInvalidRecipient() public {
        vm.prank(owner);
        vm.expectRevert("Invalid recipient");
        vault.withdraw(1 ether, address(0));
    }

    function test_Withdraw_RevertInsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert("Insufficient available balance");
        vault.withdraw(INITIAL_DEPOSIT + 1 ether, user);
    }

    function test_Withdraw_RespectsEscrow() public {
        // Escrow some funds
        vm.prank(owner);
        vault.fundBuyIn(mockTable, 5 ether);

        // Available = 10 - 5 = 5 ether
        // Try to withdraw 6 ether (should fail)
        vm.prank(owner);
        vm.expectRevert("Insufficient available balance");
        vault.withdraw(6 ether, user);

        // Withdraw 5 ether (should succeed)
        vm.prank(owner);
        vault.withdraw(5 ether, user);
        assertEq(user.balance, 5 ether);
    }

    // ============ Buy-in Funding Tests ============

    function test_FundBuyIn_Success() public {
        uint256 amount = 2 ether;

        vm.expectEmit(true, false, false, true);
        emit BuyInFunded(mockTable, amount);

        vm.prank(owner);
        vault.fundBuyIn(mockTable, amount);

        assertEq(vault.tableEscrow(mockTable), amount);
        assertEq(vault.totalEscrow(), amount);
        assertEq(vault.getAvailableBalance(), INITIAL_DEPOSIT - amount);
    }

    function test_FundBuyIn_MultipleTables() public {
        address table2 = address(0x4);

        vm.startPrank(owner);
        vault.fundBuyIn(mockTable, 2 ether);
        vault.fundBuyIn(table2, 3 ether);
        vm.stopPrank();

        assertEq(vault.tableEscrow(mockTable), 2 ether);
        assertEq(vault.tableEscrow(table2), 3 ether);
        assertEq(vault.totalEscrow(), 5 ether);
    }

    function test_FundBuyIn_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.fundBuyIn(mockTable, 1 ether);
    }

    function test_FundBuyIn_RevertZeroAmount() public {
        vm.prank(owner);
        vm.expectRevert("Zero amount");
        vault.fundBuyIn(mockTable, 0);
    }

    function test_FundBuyIn_RevertInvalidTable() public {
        vm.prank(owner);
        vm.expectRevert("Invalid table");
        vault.fundBuyIn(address(0), 1 ether);
    }

    function test_FundBuyIn_RevertInsufficientBalance() public {
        vm.prank(owner);
        vm.expectRevert("Insufficient available balance");
        vault.fundBuyIn(mockTable, INITIAL_DEPOSIT + 1 ether);
    }

    // ============ Escrow Release Tests ============

    function test_ReleaseEscrow_Success() public {
        vm.startPrank(owner);
        vault.fundBuyIn(mockTable, 5 ether);
        vault.releaseEscrow(mockTable, 3 ether);
        vm.stopPrank();

        assertEq(vault.tableEscrow(mockTable), 2 ether);
        assertEq(vault.totalEscrow(), 2 ether);
        assertEq(vault.getAvailableBalance(), INITIAL_DEPOSIT - 2 ether);
    }

    function test_ReleaseEscrow_RevertExceedsEscrow() public {
        vm.startPrank(owner);
        vault.fundBuyIn(mockTable, 2 ether);

        vm.expectRevert("Exceeds escrow");
        vault.releaseEscrow(mockTable, 3 ether);
        vm.stopPrank();
    }

    // ============ Settlement Tests ============

    function test_OnSettlement_Success() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        vm.expectEmit(true, false, false, true);
        emit SettlementReceived(mockTable, 1, 100);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        assertEq(vault.lastSnapshotHandId(), 1);
    }

    function test_OnSettlement_RevertUnauthorized() public {
        vm.prank(mockTable);
        vm.expectRevert("Not authorized table");
        vault.onSettlement(1, 100);
    }

    function test_OnSettlement_EmitsSnapshot() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Expect VaultSnapshot event (with cumulativePnl = 100)
        vm.expectEmit(true, false, false, false);
        emit VaultSnapshot(1, INITIAL_DEPOSIT, 0, 1e18, INITIAL_DEPOSIT, 100);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);
    }

    function test_ReceiveSettlement_FromAuthorizedTable() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        uint256 winnings = 1 ether;
        vm.deal(mockTable, winnings);

        vm.expectEmit(true, false, false, true);
        emit SettlementReceived(mockTable, 5, winnings);

        vm.prank(mockTable);
        vault.receiveSettlement{value: winnings}(5);

        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT + winnings);
    }

    function test_ReceiveSettlement_FromUnauthorized() public {
        uint256 amount = 1 ether;
        vm.deal(user, amount);

        // Should be treated as deposit
        vm.expectEmit(true, false, false, true);
        emit Deposited(user, amount);

        vm.prank(user);
        vault.receiveSettlement{value: amount}(1);

        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT + amount);
    }

    // ============ Table Authorization Tests ============

    function test_AuthorizeTable_Success() public {
        assertFalse(vault.authorizedTables(mockTable));

        vm.prank(owner);
        vault.authorizeTable(mockTable);

        assertTrue(vault.authorizedTables(mockTable));
    }

    function test_AuthorizeTable_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.authorizeTable(mockTable);
    }

    function test_AuthorizeTable_RevertInvalidTable() public {
        vm.prank(owner);
        vm.expectRevert("Invalid table");
        vault.authorizeTable(address(0));
    }

    function test_RevokeTable_Success() public {
        vm.startPrank(owner);
        vault.authorizeTable(mockTable);
        assertTrue(vault.authorizedTables(mockTable));

        vault.revokeTable(mockTable);
        assertFalse(vault.authorizedTables(mockTable));
        vm.stopPrank();
    }

    // ============ Ownership Tests ============

    function test_TransferOwnership_Success() public {
        vm.prank(owner);
        vault.transferOwnership(user);

        assertEq(vault.owner(), user);
    }

    function test_TransferOwnership_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.transferOwnership(user);
    }

    function test_TransferOwnership_RevertInvalidOwner() public {
        vm.prank(owner);
        vm.expectRevert("Invalid new owner");
        vault.transferOwnership(address(0));
    }

    // ============ Accounting Tests (No Token) ============

    function test_GetExternalAssets_NoToken() public view {
        assertEq(vault.getExternalAssets(), INITIAL_DEPOSIT);
    }

    function test_GetTreasuryShares_NoTokenBalance() public view {
        // Vault doesn't hold any agent tokens
        assertEq(vault.getTreasuryShares(), 0);
    }

    function test_GetOutstandingShares_NoToken() public {
        // When no token or zero supply, returns 1e18 as virtual outstanding
        PlayerVault v = new PlayerVault(address(0), owner);
        assertEq(v.getOutstandingShares(), 1e18);
    }

    function test_GetNavPerShare_NoToken() public {
        // With no token, N = 1e18 (virtual), so P = A / 1e18 * 1e18 = A
        assertEq(vault.getNavPerShare(), INITIAL_DEPOSIT);
    }

    // ============ Accounting Tests (With Token) ============

    function test_GetTreasuryShares_WithTokenBalance() public {
        // Mint tokens to vault
        agentToken.mint(address(vault), 1000e18);

        assertEq(vault.getTreasuryShares(), 1000e18);
    }

    function test_GetOutstandingShares_WithToken() public {
        // Mint total supply
        agentToken.mint(user, 10000e18);
        agentToken.mint(address(vault), 2000e18);

        // T = 12000e18, B = 2000e18, N = 10000e18
        assertEq(vault.getTotalSupply(), 12000e18);
        assertEq(vault.getTreasuryShares(), 2000e18);
        assertEq(vault.getOutstandingShares(), 10000e18);
    }

    function test_GetNavPerShare_WithToken() public {
        // Mint tokens
        agentToken.mint(user, 10e18);

        // A = 10 ether, N = 10e18, P = 10e18 / 10e18 * 1e18 = 1e18
        assertEq(vault.getNavPerShare(), 1e18);
    }

    function test_GetNavPerShare_ReflectsBalanceChange() public {
        // Setup: 10e18 outstanding shares, 10 ether assets
        agentToken.mint(user, 10e18);
        assertEq(vault.getNavPerShare(), 1e18); // 1:1

        // Deposit more assets: 20 ether assets, 10e18 shares -> 2e18 per share
        vm.deal(address(vault), 20 ether);
        assertEq(vault.getNavPerShare(), 2e18);
    }

    function test_GetAccountingSnapshot_Full() public {
        // Setup tokens
        agentToken.mint(user, 8e18);
        agentToken.mint(address(vault), 2e18);

        // A = 10 ether, T = 10e18, B = 2e18, N = 8e18
        // P = 10e18 / 8e18 * 1e18 = 1.25e18
        (uint256 A, uint256 B, uint256 N, uint256 P) = vault.getAccountingSnapshot();

        assertEq(A, INITIAL_DEPOSIT);
        assertEq(B, 2e18);
        assertEq(N, 8e18);
        assertEq(P, (INITIAL_DEPOSIT * 1e18) / 8e18);
    }

    // ============ Manual Snapshot Tests ============

    function test_EmitSnapshot_Success() public {
        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit VaultSnapshot(0, INITIAL_DEPOSIT, 0, 1e18, INITIAL_DEPOSIT, 0);

        vault.emitSnapshot();
    }

    function test_EmitSnapshot_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.emitSnapshot();
    }

    // ============ Integration Tests (with PokerTable) ============

    function test_Integration_VaultReceivesSettlement() public {
        // Create vault for player 1
        PlayerVault player1Vault = new PlayerVault(address(0), owner);
        vm.deal(address(player1Vault), 1000);

        // Authorize the poker table
        vm.prank(owner);
        player1Vault.authorizeTable(address(pokerTable));

        // Simulate settlement by sending MON to vault
        vm.deal(address(pokerTable), 100);
        vm.prank(address(pokerTable));
        player1Vault.receiveSettlement{value: 100}(1);

        assertEq(player1Vault.getExternalAssets(), 1100);
    }

    function test_Integration_BalanceReflectsHandOutcome() public {
        // Setup two vaults
        PlayerVault winnerVault = new PlayerVault(address(0), owner);
        PlayerVault loserVault = new PlayerVault(address(0), user);

        vm.deal(address(winnerVault), 1000);
        vm.deal(address(loserVault), 1000);

        // Initial balances
        assertEq(winnerVault.getExternalAssets(), 1000);
        assertEq(loserVault.getExternalAssets(), 1000);

        // Simulate settlement: winner receives 200 (pot)
        vm.prank(owner);
        winnerVault.authorizeTable(address(pokerTable));

        vm.deal(address(pokerTable), 200);
        vm.prank(address(pokerTable));
        winnerVault.receiveSettlement{value: 200}(1);

        // Winner has 1200, loser still has 1000 (loss accounted elsewhere)
        assertEq(winnerVault.getExternalAssets(), 1200);
    }

    // ============ Edge Cases ============

    function test_NavPerShare_ZeroOutstandingShares() public {
        // Mint all tokens to vault (treasury = total supply)
        agentToken.mint(address(vault), 1000e18);

        // N = T - B = 1000e18 - 1000e18 = 0
        // When N = 0, NAV is undefined (returns 0)
        assertEq(vault.getOutstandingShares(), 0);
        assertEq(vault.getNavPerShare(), 0);
    }

    function test_MultipleBuyInsAndReleases() public {
        address table2 = address(0x4);
        address table3 = address(0x5);

        vm.startPrank(owner);

        // Fund multiple tables
        vault.fundBuyIn(mockTable, 1 ether);
        vault.fundBuyIn(table2, 2 ether);
        vault.fundBuyIn(table3, 3 ether);

        assertEq(vault.totalEscrow(), 6 ether);
        assertEq(vault.getAvailableBalance(), 4 ether);

        // Release some
        vault.releaseEscrow(table2, 1 ether);
        assertEq(vault.totalEscrow(), 5 ether);
        assertEq(vault.tableEscrow(table2), 1 ether);

        // Release all from table
        vault.releaseEscrow(mockTable, 1 ether);
        assertEq(vault.tableEscrow(mockTable), 0);
        assertEq(vault.totalEscrow(), 4 ether);

        vm.stopPrank();
    }

    // ============ T-0303: Accounting + Reproducibility Tests ============

    function test_Initialize_EmitsVaultInitialized() public {
        PlayerVault newVault = new PlayerVault(address(agentToken), owner);
        vm.deal(address(newVault), 5 ether);

        // Mint some tokens for proper NAV calculation
        agentToken.mint(user, 10e18);

        vm.expectEmit(true, true, false, true);
        emit VaultInitialized(address(agentToken), owner, 5 ether, 5e17); // 5e18 / 10e18 * 1e18 = 0.5e18

        newVault.initialize();
    }

    function test_Initialize_OnlyOnce() public {
        vault.initialize();

        vm.expectRevert("Already initialized");
        vault.initialize();
    }

    function test_Initialize_SetsBaselineNavPerShare() public {
        // Setup: 10 ether assets, 10e18 outstanding shares = 1e18 NAV per share
        agentToken.mint(user, 10e18);

        vault.initialize();

        assertEq(vault.getInitialNavPerShare(), 1e18);
        assertTrue(vault.initialized());
    }

    function test_CumulativePnl_TracksWins() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Initial PnL = 0
        assertEq(vault.getCumulativePnl(), 0);

        // Win 100
        vm.prank(mockTable);
        vault.onSettlement(1, 100);
        assertEq(vault.getCumulativePnl(), 100);

        // Win 200 more
        vm.prank(mockTable);
        vault.onSettlement(2, 200);
        assertEq(vault.getCumulativePnl(), 300);
    }

    function test_CumulativePnl_TracksLosses() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Lose 50
        vm.prank(mockTable);
        vault.onSettlement(1, -50);
        assertEq(vault.getCumulativePnl(), -50);

        // Lose 100 more
        vm.prank(mockTable);
        vault.onSettlement(2, -100);
        assertEq(vault.getCumulativePnl(), -150);
    }

    function test_CumulativePnl_TracksNetPnl() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Win 200
        vm.prank(mockTable);
        vault.onSettlement(1, 200);

        // Lose 50
        vm.prank(mockTable);
        vault.onSettlement(2, -50);

        // Win 100
        vm.prank(mockTable);
        vault.onSettlement(3, 100);

        // Net = 200 - 50 + 100 = 250
        assertEq(vault.getCumulativePnl(), 250);
    }

    function test_HandCount_Increments() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        assertEq(vault.getHandCount(), 0);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);
        assertEq(vault.getHandCount(), 1);

        vm.prank(mockTable);
        vault.onSettlement(2, -50);
        assertEq(vault.getHandCount(), 2);

        vm.prank(mockTable);
        vault.onSettlement(3, 0);
        assertEq(vault.getHandCount(), 3);
    }

    function test_GetFullAccountingData_ReturnsAllFields() public {
        // Setup tokens
        agentToken.mint(user, 8e18);
        agentToken.mint(address(vault), 2e18);

        // Initialize with baseline
        vault.initialize();

        // Authorize table and record some settlements
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        vm.prank(mockTable);
        vault.onSettlement(2, -30);

        (
            uint256 A,
            uint256 B,
            uint256 N,
            uint256 P,
            uint256 P0,
            int256 pnl,
            uint256 hands
        ) = vault.getFullAccountingData();

        assertEq(A, INITIAL_DEPOSIT);
        assertEq(B, 2e18);
        assertEq(N, 8e18);
        assertEq(P, (INITIAL_DEPOSIT * 1e18) / 8e18);
        assertEq(P0, (INITIAL_DEPOSIT * 1e18) / 8e18); // Initial NAV
        assertEq(pnl, 70); // 100 - 30
        assertEq(hands, 2);
    }

    function test_VaultSnapshot_IncludesCumulativePnl() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Record event with explicit values check
        vm.prank(mockTable);
        vm.recordLogs();
        vault.onSettlement(1, 150);

        Vm.Log[] memory entries = vm.getRecordedLogs();

        // Find VaultSnapshot event
        bool found = false;
        for (uint256 i = 0; i < entries.length; i++) {
            // VaultSnapshot topic0
            if (entries[i].topics.length > 0) {
                // Decode the data (handId is indexed, so in topics[1])
                // Data contains: externalAssets, treasuryShares, outstandingShares, navPerShare, cumulativePnl
                if (entries[i].data.length >= 160) { // 5 * 32 bytes
                    (, , , , int256 recordedPnl) = abi.decode(
                        entries[i].data,
                        (uint256, uint256, uint256, uint256, int256)
                    );
                    if (recordedPnl == 150) {
                        found = true;
                        break;
                    }
                }
            }
        }
        assertTrue(found, "VaultSnapshot should include cumulativePnl");
    }

    /**
     * @notice Demonstrates that an indexer can compute ROI from events.
     * @dev ROI = (P_current - P_initial) / P_initial
     *
     * Scenario:
     * - Initial: 10 ETH assets, 10e18 tokens -> P0 = 1e18
     * - After deposit of 5 ETH: 15 ETH assets -> P = 1.5e18
     * - ROI = (1.5e18 - 1e18) / 1e18 = 0.5 = 50%
     */
    function test_Indexer_CanComputeROI() public {
        // Setup: 10e18 outstanding shares
        agentToken.mint(user, 10e18);

        // Initialize at baseline
        vault.initialize();
        uint256 P0 = vault.getInitialNavPerShare();
        assertEq(P0, 1e18); // 10 ETH / 10e18 tokens = 1e18

        // Simulate profit by adding more assets
        vm.deal(address(vault), 15 ether);

        // Current NAV
        uint256 P = vault.getNavPerShare();
        assertEq(P, 1.5e18); // 15 ETH / 10e18 tokens = 1.5e18

        // Indexer computes ROI
        // ROI = (P - P0) / P0 = (1.5e18 - 1e18) * 1e18 / 1e18 = 0.5e18 (50%)
        int256 roi = int256((P - P0) * 1e18 / P0);
        assertEq(roi, 0.5e18); // 50% ROI
    }

    /**
     * @notice Demonstrates that an indexer can compute MDD from snapshots.
     * @dev MDD = max((P_peak - P_trough) / P_peak) over time
     *
     * Scenario:
     * - P0 = 1e18 (peak)
     * - P1 = 0.8e18 (drawdown 20%)
     * - P2 = 1.2e18 (new peak)
     * - P3 = 0.9e18 (drawdown 25% from P2)
     * - MDD = 25%
     */
    function test_Indexer_CanComputeMDD() public {
        // This test simulates what an indexer would do
        // by tracking P values over time

        agentToken.mint(user, 10e18);
        vault.initialize();

        // Simulate price history by changing vault balance
        uint256 peak = 1e18;
        uint256 maxDrawdown = 0;

        // P0 = 1e18 (10 ETH, 10e18 shares)
        uint256 P0 = vault.getNavPerShare();
        assertEq(P0, 1e18);
        if (P0 > peak) peak = P0;

        // P1 = 0.8e18 (8 ETH, 10e18 shares)
        vm.deal(address(vault), 8 ether);
        uint256 P1 = vault.getNavPerShare();
        assertEq(P1, 0.8e18);
        if (P1 > peak) peak = P1;
        uint256 drawdown1 = (peak - P1) * 1e18 / peak;
        if (drawdown1 > maxDrawdown) maxDrawdown = drawdown1;
        assertEq(drawdown1, 0.2e18); // 20% drawdown

        // P2 = 1.2e18 (12 ETH, 10e18 shares) - new peak
        vm.deal(address(vault), 12 ether);
        uint256 P2 = vault.getNavPerShare();
        assertEq(P2, 1.2e18);
        if (P2 > peak) peak = P2;

        // P3 = 0.9e18 (9 ETH, 10e18 shares)
        vm.deal(address(vault), 9 ether);
        uint256 P3 = vault.getNavPerShare();
        assertEq(P3, 0.9e18);
        if (P3 > peak) peak = P3;
        uint256 drawdown3 = (peak - P3) * 1e18 / peak;
        if (drawdown3 > maxDrawdown) maxDrawdown = drawdown3;
        assertEq(drawdown3, 0.25e18); // 25% drawdown from peak of 1.2e18

        // MDD = 25%
        assertEq(maxDrawdown, 0.25e18);
    }

    /**
     * @notice Verifies event schema completeness for indexer.
     * @dev Indexer needs: A, B, N, P, cumulativePnl from VaultSnapshot
     *      and initialNavPerShare from VaultInitialized.
     */
    function test_EventSchema_CompleteForIndexer() public {
        agentToken.mint(user, 10e18);

        // VaultInitialized should have all required fields
        vm.recordLogs();
        vault.initialize();
        Vm.Log[] memory initLogs = vm.getRecordedLogs();
        assertTrue(initLogs.length >= 1, "VaultInitialized should be emitted");

        // Verify VaultInitialized data can be decoded
        for (uint256 i = 0; i < initLogs.length; i++) {
            if (initLogs[i].topics.length >= 3) {
                // Has indexed agentToken and owner
                (uint256 initAssets, uint256 initNav) = abi.decode(
                    initLogs[i].data,
                    (uint256, uint256)
                );
                assertEq(initAssets, INITIAL_DEPOSIT);
                assertEq(initNav, 1e18);
                break;
            }
        }

        // VaultSnapshot should have all required fields
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        vm.recordLogs();
        vm.prank(mockTable);
        vault.onSettlement(1, 500);

        Vm.Log[] memory snapLogs = vm.getRecordedLogs();
        bool snapshotFound = false;
        for (uint256 i = 0; i < snapLogs.length; i++) {
            if (snapLogs[i].data.length >= 160) {
                (
                    uint256 A,
                    uint256 B,
                    uint256 N,
                    uint256 P,
                    int256 pnl
                ) = abi.decode(
                    snapLogs[i].data,
                    (uint256, uint256, uint256, uint256, int256)
                );
                // Verify all fields are present and sensible
                assertEq(A, INITIAL_DEPOSIT);
                assertEq(B, 0);
                assertEq(N, 10e18);
                assertEq(P, 1e18);
                assertEq(pnl, 500);
                snapshotFound = true;
                break;
            }
        }
        assertTrue(snapshotFound, "VaultSnapshot should be decodable");
    }

    /**
     * @notice Verify winrate can be computed from handCount.
     * @dev Winrate requires tracking wins separately (future enhancement)
     *      but handCount provides denominator.
     */
    function test_HandCount_SupportsWinrateCalculation() public {
        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Simulate 5 hands: 3 wins, 2 losses
        vm.startPrank(mockTable);
        vault.onSettlement(1, 100);  // win
        vault.onSettlement(2, -50);  // loss
        vault.onSettlement(3, 200);  // win
        vault.onSettlement(4, -30);  // loss
        vault.onSettlement(5, 50);   // win
        vm.stopPrank();

        assertEq(vault.getHandCount(), 5);
        // Note: Actual win count tracking would need separate storage
        // For now, indexer can determine wins from positive PnL in settlements
    }
}
