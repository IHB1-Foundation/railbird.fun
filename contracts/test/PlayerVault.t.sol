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

    event VaultSnapshot(
        uint256 indexed handId,
        uint256 externalAssets,
        uint256 treasuryShares,
        uint256 outstandingShares,
        uint256 navPerShare
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

        // Expect VaultSnapshot event
        vm.expectEmit(true, false, false, false);
        emit VaultSnapshot(1, INITIAL_DEPOSIT, 0, 1e18, INITIAL_DEPOSIT);

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
        emit VaultSnapshot(0, INITIAL_DEPOSIT, 0, 1e18, INITIAL_DEPOSIT);

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
}
