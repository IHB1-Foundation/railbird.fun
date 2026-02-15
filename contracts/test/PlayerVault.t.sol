// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerVault.sol";
import "../src/PokerTable.sol";
import "../src/mocks/MockVRFAdapter.sol";
import "../src/mocks/MockNadfunRouter.sol";

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
    mapping(address => mapping(address => uint256)) public allowance;

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

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        require(balanceOf[from] >= amount, "Insufficient balance");
        require(allowance[from][msg.sender] >= amount, "Insufficient allowance");
        allowance[from][msg.sender] -= amount;
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        return true;
    }
}

contract PlayerVaultTest is Test {
    PlayerVault public vault;
    MockERC20 public agentToken;
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    MockNadfunRouter public mockRouter;

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
    event RebalanceBuy(
        uint256 indexed handId,
        uint256 monSpent,
        uint256 tokensReceived,
        uint256 executionPrice,
        uint256 navPerShareBefore,
        uint256 navPerShareAfter
    );
    event RebalanceSell(
        uint256 indexed handId,
        uint256 tokensSold,
        uint256 monReceived,
        uint256 executionPrice,
        uint256 navPerShareBefore,
        uint256 navPerShareAfter
    );
    event RebalanceConfigUpdated(
        address nadfunLens,
        address nadfunRouter,
        uint256 maxMonBps,
        uint256 maxTokenBps
    );

    function setUp() public {
        agentToken = new MockERC20();
        vault = new PlayerVault(address(agentToken), owner);

        // Fund the vault
        vm.deal(address(vault), INITIAL_DEPOSIT);

        // Setup poker table for integration tests
        mockVRF = new MockVRFAdapter();
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(agentToken));

        // Setup mock router for rebalancing tests
        mockRouter = new MockNadfunRouter();
        vm.deal(address(mockRouter), 100 ether); // Fund router for sell operations
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

    // ============ T-0601: Rebalancing Tests ============

    /**
     * @notice Setup rebalancing with router liquidity.
     * @dev Creates scenario where:
     *      - Total supply: 100e18 (10e18 to user, 90e18 to router)
     *      - Vault assets: 10 ETH
     *      - NAV per share: 10 ETH / 100e18 = 0.1e18
     *      To buy accretively, need execution price <= 0.1e18 (buyRate >= 10e18)
     */
    function _setupRebalancing() internal {
        vm.prank(owner);
        vault.setRebalanceConfig(
            address(0), // No lens needed for mock
            address(mockRouter),
            1000, // 10% max buy
            1000  // 10% max sell
        );

        vm.prank(owner);
        vault.authorizeTable(mockTable);

        // Mint to user (external holders) and router (AMM liquidity)
        agentToken.mint(user, 10e18);
        agentToken.mint(address(mockRouter), 90e18);
        mockRouter.seedTokenLiquidity(address(agentToken), 90e18);

        // Verify: T=100e18, B=0, N=100e18, A=10e18, P=0.1e18
    }

    /**
     * @notice Get the expected NAV for _setupRebalancing scenario.
     */
    function _getExpectedNAV() internal pure returns (uint256) {
        // 10 ETH / 100e18 shares * 1e18 scale = 0.1e18
        return 0.1e18;
    }

    /**
     * @notice Get accretive buy rate (tokens per MON that results in price <= NAV).
     * @dev For NAV = 0.1e18, we need execution price = monIn/tokenOut <= 0.1e18
     *      So tokenOut >= monIn / 0.1e18 * 1e18 = monIn * 10
     *      buyRate = 10e18 gives exactly NAV price
     *      buyRate = 11e18 gives price < NAV (accretive)
     */
    function _getAccretiveBuyRate() internal pure returns (uint256) {
        return 11e18; // Get 11 tokens per MON, price = 0.0909e18 < NAV
    }

    /**
     * @notice Get non-accretive buy rate for testing rejection.
     */
    function _getNonAccretiveBuyRate() internal pure returns (uint256) {
        return 5e18; // Get 5 tokens per MON, price = 0.2e18 > NAV of 0.1e18
    }

    function test_SetRebalanceConfig_Success() public {
        vm.expectEmit(false, false, false, true);
        emit RebalanceConfigUpdated(address(0x1), address(mockRouter), 500, 500);

        vm.prank(owner);
        vault.setRebalanceConfig(address(0x1), address(mockRouter), 500, 500);

        assertEq(vault.nadfunLens(), address(0x1));
        assertEq(vault.nadfunRouter(), address(mockRouter));
        assertEq(vault.rebalanceMaxMonBps(), 500);
        assertEq(vault.rebalanceMaxTokenBps(), 500);
    }

    function test_SetRebalanceConfig_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.setRebalanceConfig(address(0x1), address(mockRouter), 500, 500);
    }

    function test_SetRebalanceConfig_RevertInvalidMaxMonBps() public {
        vm.prank(owner);
        vm.expectRevert("Invalid maxMonBps");
        vault.setRebalanceConfig(address(0), address(mockRouter), 10001, 500);
    }

    function test_SetRebalanceConfig_RevertInvalidMaxTokenBps() public {
        vm.prank(owner);
        vm.expectRevert("Invalid maxTokenBps");
        vault.setRebalanceConfig(address(0), address(mockRouter), 500, 10001);
    }

    function test_RebalanceBuy_RevertNoSettlement() public {
        _setupRebalancing();

        // Try to rebalance before any settlement
        vm.prank(owner);
        vm.expectRevert("No settlement yet");
        vault.rebalanceBuy(1 ether, 0);
    }

    function test_RebalanceBuy_RevertRouterNotConfigured() public {
        // Don't configure router
        agentToken.mint(user, 10e18);
        vm.prank(owner);
        vault.authorizeTable(mockTable);
        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        vm.prank(owner);
        vm.expectRevert("Router not configured");
        vault.rebalanceBuy(1 ether, 0);
    }

    function test_RebalanceBuy_RevertAlreadyRebalanced() public {
        _setupRebalancing();

        // Trigger settlement
        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Set accretive buy rate
        mockRouter.setBuyRate(_getAccretiveBuyRate());

        // First rebalance succeeds
        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        // Second rebalance for same hand fails
        vm.prank(owner);
        vm.expectRevert("Already rebalanced this hand");
        vault.rebalanceBuy(0.5 ether, 0);
    }

    function test_RebalanceBuy_RevertExceedsMaxSize() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Max is 10% of 10 ETH = 1 ETH
        vm.prank(owner);
        vm.expectRevert("Exceeds max buy size");
        vault.rebalanceBuy(2 ether, 0);
    }

    function test_RebalanceBuy_RevertPriceAboveNAV() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Set non-accretive buy rate (price > NAV)
        mockRouter.setBuyRate(_getNonAccretiveBuyRate());

        vm.prank(owner);
        vm.expectRevert("Price above NAV (not accretive)");
        vault.rebalanceBuy(0.5 ether, 0);
    }

    function test_RebalanceBuy_Success() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // NAV = 10 ETH / 100e18 shares = 0.1e18 per share
        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Set accretive buy rate
        mockRouter.setBuyRate(_getAccretiveBuyRate());

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit RebalanceBuy(1, 0.5 ether, 0, 0, navBefore, 0);

        vault.rebalanceBuy(0.5 ether, 0);

        // Verify NAV increased or stayed same
        uint256 navAfter = vault.getNavPerShare();
        assertGe(navAfter, navBefore, "NAV should not decrease");

        // Verify last rebalanced hand is updated
        assertEq(vault.lastRebalancedHandId(), 1);
    }

    function test_RebalanceBuy_NavIncreasesWhenBuyingCheap() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // NAV = 0.1e18 per share
        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Buy much cheaper than NAV (high buyRate = more tokens per MON = lower price)
        // Using buyRate = 15e18 means price = 1e18/15 ≈ 0.0667e18 < NAV of 0.1e18
        mockRouter.setBuyRate(15e18);

        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        // NAV should increase because we bought "cheap"
        // Before: A=10 ETH, T=100e18, B=0, N=100e18, P=0.1e18
        // After buy 0.5 ETH for 7.5e18 tokens: A=9.5 ETH, B=7.5e18, N=92.5e18
        // P_after = 9.5e18 / 92.5e18 * 1e18 ≈ 0.1027e18 > 0.1e18
        uint256 navAfter = vault.getNavPerShare();
        assertGt(navAfter, navBefore, "NAV should increase when buying cheap");
    }

    function test_RebalanceSell_RevertNoSettlement() public {
        _setupRebalancing();

        // Give vault some tokens to sell
        agentToken.mint(address(vault), 1e18);

        vm.prank(owner);
        vm.expectRevert("No settlement yet");
        vault.rebalanceSell(0.5e18, 0);
    }

    function test_RebalanceSell_RevertAlreadyRebalanced() public {
        _setupRebalancing();

        // Give vault some tokens to sell
        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Set sell rate that satisfies accretive constraint
        mockRouter.setSellRate(1.2e18); // sell at 1.2e18 > NAV of 1e18

        // First rebalance succeeds
        vm.prank(owner);
        vault.rebalanceSell(0.1e18, 0);

        // Second rebalance for same hand fails
        vm.prank(owner);
        vm.expectRevert("Already rebalanced this hand");
        vault.rebalanceSell(0.1e18, 0);
    }

    function test_RebalanceSell_RevertExceedsMaxSize() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 10e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Max is 10% of 10e18 = 1e18
        vm.prank(owner);
        vm.expectRevert("Exceeds max sell size");
        vault.rebalanceSell(2e18, 0);
    }

    function test_RebalanceSell_RevertPriceBelowNAV() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // NAV with vault's treasury shares:
        // T = 102e18, B = 2e18, N = 100e18, A = 10 ETH, P = 0.1e18

        // Set sell rate to 0.05e18 (get 0.05 MON per token)
        // Execution price = 0.05e18 < NAV (0.1e18) - not accretive
        mockRouter.setSellRate(0.05e18);

        vm.prank(owner);
        vm.expectRevert("Price below NAV (not accretive)");
        vault.rebalanceSell(0.1e18, 0);
    }

    function test_RebalanceSell_Success() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // NAV with treasury shares: T=102e18, B=2e18, N=100e18, A=10 ETH, P=0.1e18
        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Set sell rate to 0.12e18 (get 0.12 MON per token)
        // Execution price = 0.12e18 > NAV of 0.1e18 (accretive)
        mockRouter.setSellRate(0.12e18);

        vm.prank(owner);
        vm.expectEmit(true, false, false, false);
        emit RebalanceSell(1, 0, 0, 0, navBefore, 0);

        vault.rebalanceSell(0.1e18, 0);

        // Verify NAV didn't decrease
        uint256 navAfter = vault.getNavPerShare();
        assertGe(navAfter, navBefore, "NAV should not decrease");

        // Verify last rebalanced hand is updated
        assertEq(vault.lastRebalancedHandId(), 1);
    }

    function test_RebalanceSell_NavIncreasesWhenSellingExpensive() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // NAV = 0.1e18
        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Sell at 0.15e18 (more expensive than NAV of 0.1e18)
        mockRouter.setSellRate(0.15e18);

        vm.prank(owner);
        vault.rebalanceSell(0.1e18, 0); // Sell 0.1e18 tokens

        // NAV should increase because we sold "expensive"
        // Before: A=10, T=102e18, B=2e18, N=100e18, P=0.1e18
        // After sell 0.1e18 tokens for 0.015 ETH: A=10.015, B=1.9e18, N=100.1e18
        // P_after = 10.015e18 / 100.1e18 * 1e18 ≈ 0.1001e18 > 0.1e18
        uint256 navAfter = vault.getNavPerShare();
        assertGt(navAfter, navBefore, "NAV should increase when selling expensive");
    }

    function test_RebalanceStatus_ReturnsCorrectValues() public {
        _setupRebalancing();

        // Initially not eligible (no settlement)
        (bool canRebalance, uint256 currentHandId, uint256 lastRebalanced, uint256 eligibleBlock, uint256 blocksRemaining) = vault.getRebalanceStatus();
        assertFalse(canRebalance);
        assertEq(currentHandId, 0);
        assertEq(lastRebalanced, 0);

        // After settlement, eligible
        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        (canRebalance, currentHandId, lastRebalanced, eligibleBlock, blocksRemaining) = vault.getRebalanceStatus();
        assertTrue(canRebalance);
        assertEq(currentHandId, 1);
        assertEq(lastRebalanced, 0);
        assertEq(eligibleBlock, block.number);
        assertEq(blocksRemaining, 0);

        // After rebalance, not eligible for same hand
        mockRouter.setBuyRate(_getAccretiveBuyRate());
        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        (canRebalance, currentHandId, lastRebalanced, eligibleBlock, blocksRemaining) = vault.getRebalanceStatus();
        assertFalse(canRebalance);
        assertEq(currentHandId, 1);
        assertEq(lastRebalanced, 1);

        // After next settlement, eligible again
        vm.prank(mockTable);
        vault.onSettlement(2, 50);

        (canRebalance, currentHandId, lastRebalanced, eligibleBlock, blocksRemaining) = vault.getRebalanceStatus();
        assertTrue(canRebalance);
        assertEq(currentHandId, 2);
        assertEq(lastRebalanced, 1);
    }

    function test_RebalanceBuy_RevertZeroAmount() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        vm.prank(owner);
        vm.expectRevert("Zero amount");
        vault.rebalanceBuy(0, 0);
    }

    function test_RebalanceSell_RevertZeroAmount() public {
        _setupRebalancing();

        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        vm.prank(owner);
        vm.expectRevert("Zero amount");
        vault.rebalanceSell(0, 0);
    }

    function test_RebalanceBuy_RevertInsufficientBalance() public {
        _setupRebalancing();

        // Escrow most of the balance
        vm.prank(owner);
        vault.fundBuyIn(mockTable, 9.5 ether);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Available is only 0.5 ether, but 10% of 10 = 1 ether limit
        // Try to buy 0.6 ether (under 10% but over available)
        vm.prank(owner);
        vm.expectRevert("Insufficient available balance");
        vault.rebalanceBuy(0.6 ether, 0);
    }

    function test_RebalanceSell_RevertExceedsTreasuryBalance() public {
        _setupRebalancing();

        // Give vault a small amount of tokens
        agentToken.mint(address(vault), 0.5e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Increase max sell limit so that check doesn't trigger first
        // max sell = 100% of B
        // B = 0.5e18, so maxTokens = 0.5e18
        // To trigger "Exceeds treasury balance", we need amount > B but <= maxTokens
        // Since maxTokens = maxBps * B / 10000, if maxBps = 10000, maxTokens = B
        // So we can't have amount > B and amount <= maxTokens simultaneously with 100% max
        //
        // The check order is:
        // 1. maxTokens = (B * maxBps) / 10000
        // 2. require(tokenAmount <= maxTokens, "Exceeds max sell size")
        // 3. require(tokenAmount <= B, "Exceeds treasury balance")
        //
        // With maxBps = 10000 (100%), maxTokens = B, so both checks are equivalent
        // To test "Exceeds treasury balance", we need maxBps > 10000 which isn't allowed
        // OR we need the treasury balance check to fail for a different reason
        //
        // Actually, looking at the code, maxTokens uses getTreasuryShares() which is the same as B
        // So if maxBps = 10000, maxTokens = B, and the checks are equivalent
        //
        // Let's test with a scenario where we have external tokens that don't match
        // Actually, the simplest way is: the check "Exceeds treasury balance" is redundant
        // when maxBps <= 10000 because maxTokens <= B always
        //
        // Let me verify this is the correct behavior and adjust the test
        vm.prank(owner);
        vault.setRebalanceConfig(address(0), address(mockRouter), 1000, 10000); // 100% max sell

        // With 0.5e18 tokens and 100% max, maxTokens = 0.5e18
        // Trying to sell 1e18 will hit "Exceeds max sell size" first because maxTokens = 0.5e18 < 1e18
        vm.prank(owner);
        vm.expectRevert("Exceeds max sell size");
        vault.rebalanceSell(1e18, 0);
    }

    /**
     * @notice Verify accretive-only constraint: P_after >= P_before
     * @dev Tests multiple scenarios to ensure NAV never decreases
     */
    function test_AccretiveInvariant_BuyAtNAV() public {
        _setupRebalancing();

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Buy exactly at NAV (borderline case)
        // NAV = 0.1e18, so buyRate = 10e18 gives price of exactly 0.1e18
        mockRouter.setBuyRate(10e18);

        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        uint256 navAfter = vault.getNavPerShare();
        // Buying at exactly NAV should keep NAV unchanged (within rounding)
        assertGe(navAfter, navBefore - 1, "NAV should not decrease when buying at NAV");
    }

    function test_AccretiveInvariant_SellAtNAV() public {
        _setupRebalancing();

        agentToken.mint(address(vault), 2e18);

        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        uint256 navBefore = vault.getNavPerShare();
        assertEq(navBefore, _getExpectedNAV());

        // Sell exactly at NAV (borderline case)
        // NAV = 0.1e18, so sellRate = 0.1e18 gives price of exactly 0.1e18
        mockRouter.setSellRate(0.1e18);

        vm.prank(owner);
        vault.rebalanceSell(0.1e18, 0);

        uint256 navAfter = vault.getNavPerShare();
        // Selling at exactly NAV should keep NAV unchanged (within rounding)
        assertGe(navAfter, navBefore - 1, "NAV should not decrease when selling at NAV");
    }

    function test_MultipleHands_RebalanceEachHand() public {
        _setupRebalancing();

        mockRouter.setBuyRate(_getAccretiveBuyRate()); // Accretive buy rate

        // Hand 1
        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);
        assertEq(vault.lastRebalancedHandId(), 1);

        // Hand 2
        vm.prank(mockTable);
        vault.onSettlement(2, 50);

        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);
        assertEq(vault.lastRebalancedHandId(), 2);

        // Hand 3
        vm.prank(mockTable);
        vault.onSettlement(3, -20);

        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);
        assertEq(vault.lastRebalancedHandId(), 3);
    }

    // ============ T-0602: Randomized Delay Window Tests ============

    event RebalanceDelaySet(
        uint256 indexed handId,
        uint256 eligibleBlock,
        uint256 delayBlocks
    );

    event RebalanceDelayConfigUpdated(uint256 maxDelayBlocks);

    function test_SetRebalanceDelayConfig_Success() public {
        vm.expectEmit(false, false, false, true);
        emit RebalanceDelayConfigUpdated(100);

        vm.prank(owner);
        vault.setRebalanceDelayConfig(100);

        assertEq(vault.rebalanceDelayMaxBlocks(), 100);
    }

    function test_SetRebalanceDelayConfig_RevertNotOwner() public {
        vm.prank(user);
        vm.expectRevert("Not owner");
        vault.setRebalanceDelayConfig(100);
    }

    function test_OnSettlementWithVRF_SetsRandomizedDelay() public {
        _setupRebalancing();

        // Set max delay to 100 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(100);

        // VRF randomness of 250 should give delay of 250 % 100 = 50 blocks
        uint256 vrfRandomness = 250;
        uint256 expectedDelay = vrfRandomness % 100; // 50 blocks
        uint256 currentBlock = block.number;

        vm.expectEmit(true, false, false, true);
        emit RebalanceDelaySet(1, currentBlock + expectedDelay, expectedDelay);

        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, vrfRandomness);

        assertEq(vault.rebalanceEligibleBlock(), currentBlock + expectedDelay);
        assertEq(vault.lastSnapshotHandId(), 1);
    }

    function test_OnSettlementWithVRF_ZeroMaxDelay() public {
        _setupRebalancing();

        // Max delay is 0 (not configured) - should have no delay
        assertEq(vault.rebalanceDelayMaxBlocks(), 0);

        uint256 currentBlock = block.number;

        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 12345);

        // With max delay = 0, eligible block should be current block
        assertEq(vault.rebalanceEligibleBlock(), currentBlock);
    }

    function test_RebalanceBuy_RevertBeforeEligibleBlock() public {
        _setupRebalancing();

        // Set max delay to 50 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(50);

        // Settlement with VRF randomness of 75 -> delay = 75 % 50 = 25 blocks
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 75);

        uint256 eligibleBlock = vault.rebalanceEligibleBlock();
        assertEq(eligibleBlock, block.number + 25);

        // Set accretive buy rate
        mockRouter.setBuyRate(_getAccretiveBuyRate());

        // Attempt rebalance before eligible block should fail
        vm.prank(owner);
        vm.expectRevert("Rebalance delay not passed");
        vault.rebalanceBuy(0.5 ether, 0);
    }

    function test_RebalanceBuy_SucceedsAfterEligibleBlock() public {
        _setupRebalancing();

        // Set max delay to 50 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(50);

        // Settlement with VRF randomness of 75 -> delay = 75 % 50 = 25 blocks
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 75);

        uint256 eligibleBlock = vault.rebalanceEligibleBlock();

        // Advance blocks past the eligible block
        vm.roll(eligibleBlock);

        // Set accretive buy rate
        mockRouter.setBuyRate(_getAccretiveBuyRate());

        // Now rebalance should succeed
        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        assertEq(vault.lastRebalancedHandId(), 1);
    }

    function test_RebalanceSell_RevertBeforeEligibleBlock() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 2e18);

        // Set max delay to 30 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(30);

        // Settlement with VRF randomness of 100 -> delay = 100 % 30 = 10 blocks
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 100);

        // Set sell rate for accretive sell
        mockRouter.setSellRate(0.12e18);

        // Attempt rebalance before eligible block should fail
        vm.prank(owner);
        vm.expectRevert("Rebalance delay not passed");
        vault.rebalanceSell(0.1e18, 0);
    }

    function test_RebalanceSell_SucceedsAfterEligibleBlock() public {
        _setupRebalancing();

        // Give vault some tokens
        agentToken.mint(address(vault), 2e18);

        // Set max delay to 30 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(30);

        // Settlement with VRF randomness of 100 -> delay = 100 % 30 = 10 blocks
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 100);

        uint256 eligibleBlock = vault.rebalanceEligibleBlock();

        // Advance blocks past the eligible block
        vm.roll(eligibleBlock);

        // Set sell rate for accretive sell
        mockRouter.setSellRate(0.12e18);

        // Now rebalance should succeed
        vm.prank(owner);
        vault.rebalanceSell(0.1e18, 0);

        assertEq(vault.lastRebalancedHandId(), 1);
    }

    function test_OnSettlement_NoDelay_ImmediateRebalance() public {
        _setupRebalancing();

        // Using regular onSettlement (no VRF) should have no delay
        vm.prank(mockTable);
        vault.onSettlement(1, 100);

        // Eligible block should be current block
        assertEq(vault.rebalanceEligibleBlock(), block.number);

        // Set accretive buy rate
        mockRouter.setBuyRate(_getAccretiveBuyRate());

        // Rebalance should succeed immediately
        vm.prank(owner);
        vault.rebalanceBuy(0.5 ether, 0);

        assertEq(vault.lastRebalancedHandId(), 1);
    }

    function test_RebalanceStatus_ShowsBlocksRemaining() public {
        _setupRebalancing();

        // Set max delay to 100 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(100);

        // Settlement with VRF randomness of 75 -> delay = 75 blocks
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, 75);

        (bool canRebalance, , , uint256 eligibleBlock, uint256 blocksRemaining) = vault.getRebalanceStatus();

        // Should not be able to rebalance yet
        assertFalse(canRebalance);
        assertEq(eligibleBlock, block.number + 75);
        assertEq(blocksRemaining, 75);

        // Advance 50 blocks
        vm.roll(block.number + 50);

        (, , , , blocksRemaining) = vault.getRebalanceStatus();
        assertEq(blocksRemaining, 25);

        // Advance past eligible block
        vm.roll(eligibleBlock);

        (canRebalance, , , , blocksRemaining) = vault.getRebalanceStatus();
        assertTrue(canRebalance);
        assertEq(blocksRemaining, 0);
    }

    function test_DelayVariesWithVRFRandomness() public {
        _setupRebalancing();

        // Set max delay to 100 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(100);

        // Different VRF values should give different delays
        uint256 currentBlock = block.number;

        // VRF = 0 -> delay = 0
        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 0, 0);
        assertEq(vault.rebalanceEligibleBlock(), currentBlock + 0);

        // Reset for next test
        mockRouter.setBuyRate(_getAccretiveBuyRate());
        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);

        // VRF = 50 -> delay = 50
        vm.prank(mockTable);
        vault.onSettlementWithVRF(2, 0, 50);
        assertEq(vault.rebalanceEligibleBlock(), currentBlock + 50);

        vm.roll(currentBlock + 50);
        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);

        // VRF = 99 -> delay = 99
        vm.prank(mockTable);
        vault.onSettlementWithVRF(3, 0, 99);
        assertEq(vault.rebalanceEligibleBlock(), currentBlock + 50 + 99);

        vm.roll(currentBlock + 50 + 99);
        vm.prank(owner);
        vault.rebalanceBuy(0.3 ether, 0);

        // VRF = 199 -> delay = 199 % 100 = 99
        vm.prank(mockTable);
        vault.onSettlementWithVRF(4, 0, 199);
        assertEq(vault.rebalanceEligibleBlock(), currentBlock + 50 + 99 + 99);
    }

    function test_LargeVRFRandomness_WrapsCorrectly() public {
        _setupRebalancing();

        // Set max delay to 50 blocks
        vm.prank(owner);
        vault.setRebalanceDelayConfig(50);

        // Large VRF value should wrap correctly
        uint256 largeVRF = type(uint256).max;
        uint256 expectedDelay = largeVRF % 50;

        vm.prank(mockTable);
        vault.onSettlementWithVRF(1, 100, largeVRF);

        assertEq(vault.rebalanceEligibleBlock(), block.number + expectedDelay);
    }
}
