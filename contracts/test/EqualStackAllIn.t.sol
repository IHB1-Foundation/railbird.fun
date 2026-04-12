// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/table/PokerTableBase.sol";
import "../src/ChipToken.sol";
import "./mocks/MockVRFAdapter.sol";

/**
 * @title EqualStackAllInTest
 * @notice Tests simultaneous all-in with equal stacks (single main pot, no side pots).
 * @dev Covers T-M4-12.
 */
contract EqualStackAllInTest is Test {
    PokerTable     public pokerTable;
    MockVRFAdapter public mockVRF;
    ChipToken      public chipToken;

    address public owner1    = address(0x1);
    address public owner2    = address(0x2);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND   = 20;
    uint256 constant EQUAL_STACK = 200; // minimum buy-in = bigBlind * 10 = 200

    // ─── setUp ────────────────────────────────────────────────────────────────

    function setUp() public {
        mockVRF   = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        // 2-seat table so we can test heads-up cleanly
        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(mockVRF), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes,
            2,           // numSeats = 2
            address(this) // admin / dealer
        );
        pokerTable.setDealer(address(this));

        chipToken.mint(owner1, EQUAL_STACK * 100);
        chipToken.mint(owner2, EQUAL_STACK * 100);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _register(uint8 seatIdx, address owner, address op) internal {
        vm.startPrank(owner);
        chipToken.approve(address(pokerTable), EQUAL_STACK);
        pokerTable.registerSeat(seatIdx, owner, op, EQUAL_STACK);
        vm.stopPrank();
    }

    function _commitAndAdvance() internal {
        uint256 hid = pokerTable.currentHandId();
        for (uint8 i = 0; i < 2; i++) {
            PokerTableBase.Seat memory s = pokerTable.getSeat(i);
            if (s.isActive && pokerTable.holeCommits(hid, i) == bytes32(0)) {
                bytes32 commit = keccak256(abi.encodePacked(hid, i, uint8(i * 2), uint8(i * 2 + 1), bytes32("salt")));
                pokerTable.submitHoleCommit(hid, i, commit);
            }
        }
        pokerTable.advanceToPreflop();
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    /**
     * @notice Equal-stack simultaneous all-in: pot = 2 × stack, no side pots.
     *
     * Hand flow:
     *   - Button=0 (SB in heads-up), seat 1 = BB.
     *   - Both have 100 chips.
     *   - SB/BTN raises all-in (100 total).  SB stack → 0.
     *   - BB calls all-in (80 more to match 100).  BB stack → 0.
     *   - Pot = 200.  Both players all-in.
     *   - Community cards dealt automatically (no betting since ≤1 active non-all-in).
     *   - Showdown; winner receives full 200-chip pot.
     *   - Total chips in play = 200 (conserved).
     */
    function test_EqualStackAllIn_SingleMainPot() public {
        _register(0, owner1, operator1);
        _register(1, owner2, operator2);

        // ── Start hand ──────────────────────────────────────────────────────
        pokerTable.startHand();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_HOLECARDS));

        // Fulfill hole-card VRF
        mockVRF.fulfillLastRequest(12345);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_FOR_HOLECARDS));

        _commitAndAdvance();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.BETTING_PRE));

        // ── Verify stacks after blinds ───────────────────────────────────────
        // Heads-up: button=seat0=SB=10, seat1=BB=20
        PokerTableBase.Seat memory sb = pokerTable.getSeat(0);
        PokerTableBase.Seat memory bb = pokerTable.getSeat(1);
        assertEq(sb.stack, EQUAL_STACK - SMALL_BLIND, "SB stack after posting");
        assertEq(bb.stack, EQUAL_STACK - BIG_BLIND,   "BB stack after posting");

        // ── Pre-flop: SB raises all-in, BB calls all-in ───────────────────────
        // In heads-up, SB/BTN acts first preflop.
        vm.roll(block.number + 1);
        vm.prank(operator1);
        pokerTable.raise(0, EQUAL_STACK); // raise to 100 total → all-in

        // Seat 0 should now be all-in with 0 stack
        sb = pokerTable.getSeat(0);
        assertEq(sb.stack, 0, "SB stack after all-in raise");
        assertTrue(sb.isAllIn, "SB should be all-in");

        // BB calls (all-in for remaining 80)
        vm.roll(block.number + 1);
        vm.prank(operator2);
        pokerTable.call(1);

        bb = pokerTable.getSeat(1);
        assertEq(bb.stack, 0, "BB stack after all-in call");
        assertTrue(bb.isAllIn, "BB should be all-in");

        // ── Pot check ────────────────────────────────────────────────────────
        // Both players put in exactly EQUAL_STACK = 100 each → pot = 200
        (, uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, EQUAL_STACK * 2, "Pot must equal 2x equal stack (no side pot)");

        // ── Community cards (auto-advanced since all-in) ─────────────────────
        // Flop VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_FLOP));
        mockVRF.fulfillLastRequest(99991); // auto-skips BETTING_FLOP

        // Turn VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_TURN));
        mockVRF.fulfillLastRequest(99992);

        // River VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_RIVER));
        mockVRF.fulfillLastRequest(99993);

        // Should reach SHOWDOWN directly
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.SHOWDOWN), "Must reach SHOWDOWN");

        // ── Reveal hole cards ────────────────────────────────────────────────
        uint256 hid = pokerTable.currentHandId();
        pokerTable.revealHoleCards(hid, 0, 0, 1, bytes32("salt"));
        pokerTable.revealHoleCards(hid, 1, 2, 3, bytes32("salt"));

        // ── Settle ────────────────────────────────────────────────────────────
        uint256 seat0Before = pokerTable.getSeat(0).stack;
        uint256 seat1Before = pokerTable.getSeat(1).stack;

        pokerTable.settleShowdown();

        uint256 seat0After = pokerTable.getSeat(0).stack;
        uint256 seat1After = pokerTable.getSeat(1).stack;

        // Exactly one player wins the full pot; the other gets nothing extra.
        // Total chips in table = 200 (conserved).
        assertEq(
            seat0After + seat1After,
            EQUAL_STACK * 2,
            "Total chips conserved after settlement"
        );

        // Winner gets pot; loser gets 0 additional.
        uint256 winnerGain = (seat0After - seat0Before) + (seat1After - seat1Before);
        assertEq(winnerGain, EQUAL_STACK * 2, "Winner receives full pot (200 chips)");

        // Exactly one seat has > 0 chips (no tie in this deterministic card assignment)
        bool onlyOneWinner = (seat0After > 0 && seat1After == 0) || (seat0After == 0 && seat1After > 0);
        assertTrue(onlyOneWinner, "Exactly one winner with 200-chip pot");
    }

    /**
     * @notice All-in scenario reaches SHOWDOWN without any explicit post-flop actions.
     * @dev Verifies that all-in auto-advance through betting rounds works correctly.
     */
    function test_EqualStackAllIn_NoPostflopActionsNeeded() public {
        _register(0, owner1, operator1);
        _register(1, owner2, operator2);

        pokerTable.startHand();
        mockVRF.fulfillLastRequest(12345);
        _commitAndAdvance();

        // Both go all-in preflop
        vm.roll(block.number + 1);
        vm.prank(operator1);
        pokerTable.raise(0, EQUAL_STACK);

        vm.roll(block.number + 1);
        vm.prank(operator2);
        pokerTable.call(1);

        // Should transition to flop VRF without any betting actions
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_FLOP));

        // Auto-advance through community cards (no check/call needed between VRFs)
        mockVRF.fulfillLastRequest(1);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_TURN));

        mockVRF.fulfillLastRequest(2);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.WAITING_VRF_RIVER));

        mockVRF.fulfillLastRequest(3);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTableBase.GameState.SHOWDOWN));
    }
}
