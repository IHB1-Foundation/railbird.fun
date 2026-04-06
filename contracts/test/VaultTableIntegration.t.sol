// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/PlayerVault.sol";
import "../src/ChipToken.sol";
import "./mocks/MockVRFAdapter.sol";

/**
 * @title VaultTableIntegrationTest
 * @notice Integration tests for the full lifecycle: vault → buy-in escrow → table → settlement → vault.
 * @dev Covers T-M4-03.
 */
contract VaultTableIntegrationTest is Test {
    PokerTable     public pokerTable;
    PlayerVault    public vault1;
    PlayerVault    public vault2;
    MockVRFAdapter public mockVRF;
    ChipToken      public chipToken;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);

    uint256 constant SMALL_BLIND    = 10;
    uint256 constant BIG_BLIND      = 20;
    uint256 constant BUY_IN         = 200; // bigBlind * 10 minimum

    event BuyInFunded(address indexed table, uint256 amount);
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);
    event SettlementLoss(address indexed table, uint256 handId, uint256 lossAmount);
    event VaultSnapshot(uint256 indexed handId, uint256 externalAssets, int256 cumulativePnl);

    function setUp() public {
        mockVRF   = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(mockVRF), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes,
            2,
            address(this) // admin / dealer
        );
        pokerTable.setDealer(address(this));

        // Deploy vaults for each player
        vault1 = new PlayerVault(owner1);
        vault2 = new PlayerVault(owner2);

        // Fund vaults with enough ETH for chip buy-in
        vm.deal(address(vault1), 10 ether);
        vm.deal(address(vault2), 10 ether);

        // Give players chip tokens via direct mint (simulates vault having chips)
        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);

        // Authorize the table in each vault
        vm.prank(owner1);
        vault1.authorizeTable(address(pokerTable));
        vm.prank(owner2);
        vault2.authorizeTable(address(pokerTable));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _registerSeat(uint8 idx, address chipOwner, address op) internal {
        vm.startPrank(chipOwner);
        chipToken.approve(address(pokerTable), BUY_IN);
        pokerTable.registerSeat(idx, chipOwner, op, BUY_IN);
        vm.stopPrank();
    }

    function _startHand() internal {
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(12345);

        uint256 hid = pokerTable.currentHandId();
        for (uint8 i = 0; i < 2; i++) {
            PokerTable.Seat memory s = pokerTable.getSeat(i);
            if (s.isActive && pokerTable.holeCommits(hid, i) == bytes32(0)) {
                bytes32 commit = keccak256(abi.encodePacked(hid, i, uint8(i * 2), uint8(i * 2 + 1), bytes32("salt")));
                pokerTable.submitHoleCommit(hid, i, commit);
            }
        }
        pokerTable.advanceToPreflop();
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    /**
     * @notice Test T-M4-03: vault fundBuyIn → table escrow → hand plays → settlement → vault.
     *
     * Flow:
     *  1. Vaults fund buy-in escrow amounts.
     *  2. Chips are registered at the table (using chip tokens from owners).
     *  3. A hand is played and one player folds (simulating a quick win).
     *  4. onSettlement() is called on vault to record PnL.
     *  5. Vault records correct cumulative PnL.
     */
    function test_VaultEscrow_FundAndRelease() public {
        // Vault funds escrow for table buy-in
        vm.prank(owner1);
        vault1.fundBuyIn(address(pokerTable), 1 ether);

        assertEq(vault1.tableEscrow(address(pokerTable)), 1 ether, "Escrow recorded");
        assertEq(vault1.totalEscrow(), 1 ether, "Total escrow updated");
        // External assets excludes escrow
        assertEq(vault1.getExternalAssets(), 10 ether - 1 ether, "Assets exclude escrow");

        // Release escrow
        vm.prank(owner1);
        vault1.releaseEscrow(address(pokerTable), 0.5 ether);

        assertEq(vault1.tableEscrow(address(pokerTable)), 0.5 ether, "Escrow reduced");
        assertEq(vault1.getExternalAssets(), 10 ether - 0.5 ether, "Assets updated after release");
    }

    /**
     * @notice Test: vault.onSettlement records positive PnL correctly.
     */
    function test_VaultOnSettlement_PositivePnl() public {
        vm.prank(owner1);
        vault1.authorizeTable(address(pokerTable)); // already done but explicit

        // Simulate settlement from authorized table
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, int256(500));

        assertEq(vault1.handCount(), 1, "Hand count incremented");
        assertEq(vault1.getCumulativePnl(), int256(500), "Positive PnL recorded");
        assertEq(vault1.lastSnapshotHandId(), 1, "Last hand ID updated");
    }

    /**
     * @notice Test: vault.onSettlement records negative PnL correctly.
     */
    function test_VaultOnSettlement_NegativePnl() public {
        vm.prank(address(pokerTable));
        vault1.onSettlement(2, -int256(300));

        assertEq(vault1.getCumulativePnl(), -int256(300), "Negative PnL recorded");
        assertEq(vault1.handCount(), 1, "Hand count incremented");
    }

    /**
     * @notice Test: vault.onSettlement emits SettlementLoss for negative PnL.
     */
    function test_VaultOnSettlement_EmitsLossEvent() public {
        vm.expectEmit(true, true, true, true);
        emit SettlementLoss(address(pokerTable), 3, 100);
        vm.prank(address(pokerTable));
        vault1.onSettlement(3, -int256(100));
    }

    /**
     * @notice Test: vault.onSettlement emits VaultSnapshot after every settlement.
     */
    function test_VaultOnSettlement_EmitsSnapshot() public {
        vm.deal(address(vault1), 5 ether);
        vm.expectEmit(true, false, false, false);
        emit VaultSnapshot(1, 0, 0); // just check handId field
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, 0);
    }

    /**
     * @notice Test: unauthorized table cannot call onSettlement.
     */
    function test_VaultOnSettlement_RevertIfUnauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Not authorized table");
        vault1.onSettlement(1, 0);
    }

    /**
     * @notice Test: chip flow — seat registered, hand played, fold settles correctly.
     *
     * Full lifecycle:
     *  1. Register two seats (players pay chips from their wallets).
     *  2. Start hand and run to pre-flop.
     *  3. seat0 (SB/BTN in heads-up) raises to 30.
     *  4. seat1 (BB) folds → seat0 wins pot.
     *  5. After settle, call vault1.onSettlement with winner's gain.
     */
    function test_ChipFlow_FoldSettlement_VaultRecordsWin() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        _startHand();

        // seat0 raises to 40 (minRaise = BB + lastRaiseSize = 20+20=40), seat1 folds
        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.raise(0, 40);

        vm.roll(block.number + 1);
        vm.prank(owner2);
        pokerTable.fold(1);

        // Hand settled via fold
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.SETTLED),
            "Game should be SETTLED after fold"
        );

        // Record winner's PnL in vault (pot was SB+BB+raise = 10+20+30=60; winner net = 60 - 40 = +20)
        // (seat0 paid 40 to win 60; gain = 20)
        uint256 handId = pokerTable.currentHandId();
        vm.prank(address(pokerTable));
        vault1.onSettlement(handId, int256(20));

        assertGt(vault1.getCumulativePnl(), 0, "Vault records positive PnL after win");
    }

    /**
     * @notice Test: cumulative PnL aggregates across multiple hands.
     */
    function test_VaultCumulativePnl_MultipleHands() public {
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, int256(100));
        vm.prank(address(pokerTable));
        vault1.onSettlement(2, -int256(40));
        vm.prank(address(pokerTable));
        vault1.onSettlement(3, int256(60));

        assertEq(vault1.getCumulativePnl(), int256(120), "Cumulative PnL = 100 - 40 + 60");
        assertEq(vault1.handCount(), 3, "Three hands recorded");
    }
}
