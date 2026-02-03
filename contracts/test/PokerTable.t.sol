// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";

contract PokerTableTest is Test {
    PokerTable public pokerTable;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);
    address public vrfAdapter = address(0xABCD);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant BUY_IN = 1000;

    event SeatUpdated(uint8 indexed seatIndex, address owner, address operator, uint256 stack);
    event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat);
    event ActionTaken(uint256 indexed handId, uint8 indexed seatIndex, PokerTable.ActionType action, uint256 amount, uint256 potAfter);
    event PotUpdated(uint256 indexed handId, uint256 pot);
    event BettingRoundComplete(uint256 indexed handId, PokerTable.GameState fromState, PokerTable.GameState toState);
    event VRFRequested(uint256 indexed handId, PokerTable.GameState street);
    event HandSettled(uint256 indexed handId, uint8 winnerSeat, uint256 potAmount);

    function setUp() public {
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, vrfAdapter);
    }

    // ============ Seat Registration Tests ============

    function test_RegisterSeat_Success() public {
        vm.expectEmit(true, false, false, true);
        emit SeatUpdated(0, owner1, operator1, BUY_IN);

        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);

        PokerTable.Seat memory seat = pokerTable.getSeat(0);
        assertEq(seat.owner, owner1);
        assertEq(seat.operator, operator1);
        assertEq(seat.stack, BUY_IN);
    }

    function test_RegisterSeat_OperatorDefaultsToOwner() public {
        pokerTable.registerSeat(0, owner1, address(0), BUY_IN);

        PokerTable.Seat memory seat = pokerTable.getSeat(0);
        assertEq(seat.operator, owner1);
    }

    function test_RegisterSeat_RevertIfSeatTaken() public {
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);

        vm.expectRevert("Seat already taken");
        pokerTable.registerSeat(0, owner2, operator2, BUY_IN);
    }

    function test_RegisterSeat_RevertIfBuyInTooSmall() public {
        vm.expectRevert("Buy-in too small");
        pokerTable.registerSeat(0, owner1, operator1, BIG_BLIND * 5);
    }

    function test_BothSeatsFilled() public {
        assertFalse(pokerTable.bothSeatsFilled());

        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);
        assertFalse(pokerTable.bothSeatsFilled());

        pokerTable.registerSeat(1, owner2, operator2, BUY_IN);
        assertTrue(pokerTable.bothSeatsFilled());
    }

    // ============ Hand Start Tests ============

    function test_StartHand_Success() public {
        _setupBothSeats();

        vm.expectEmit(true, false, false, true);
        emit HandStarted(1, SMALL_BLIND, BIG_BLIND, 0);

        pokerTable.startHand();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
        assertEq(pokerTable.currentHandId(), 1);

        (uint256 handId, uint256 pot, uint256 currentBet, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(handId, 1);
        assertEq(pot, SMALL_BLIND + BIG_BLIND);
        assertEq(currentBet, BIG_BLIND);
        assertEq(actorSeat, 0); // SB acts first in heads-up
    }

    function test_StartHand_BlindsDeducted() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Seat 0 is button/SB, Seat 1 is BB
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);

        assertEq(seat0.stack, BUY_IN - SMALL_BLIND);
        assertEq(seat1.stack, BUY_IN - BIG_BLIND);
    }

    function test_StartHand_RevertIfNotEnoughSeats() public {
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);

        vm.expectRevert("Need both seats filled");
        pokerTable.startHand();
    }

    // ============ Action Tests ============

    function test_Fold_WinsOpponent() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Seat 0 (SB) folds
        vm.prank(operator1);
        vm.roll(block.number + 1);

        vm.expectEmit(true, true, false, true);
        emit ActionTaken(1, 0, PokerTable.ActionType.FOLD, 0, SMALL_BLIND + BIG_BLIND);

        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 1, SMALL_BLIND + BIG_BLIND);

        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Seat 1 wins the pot
        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertEq(seat1.stack, BUY_IN - BIG_BLIND + SMALL_BLIND + BIG_BLIND);
    }

    function test_Call_SBCallsBB() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Seat 0 (SB) calls the BB
        vm.prank(operator1);
        vm.roll(block.number + 1);

        pokerTable.call(0);

        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        assertEq(seat0.currentBet, BIG_BLIND);
        assertEq(seat0.stack, BUY_IN - BIG_BLIND);

        (, uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, BIG_BLIND * 2);
    }

    function test_Check_BBChecksAfterCall() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // BB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // Should trigger betting round completion
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_Check_RevertIfMustCall() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB tries to check but must call or raise
        vm.prank(operator1);
        vm.roll(block.number + 1);

        vm.expectRevert("Cannot check, must call or raise");
        pokerTable.check(0);
    }

    function test_Raise_Success() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB raises to 60
        vm.prank(operator1);
        vm.roll(block.number + 1);

        pokerTable.raise(0, 60);

        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        assertEq(seat0.currentBet, 60);
        assertEq(seat0.stack, BUY_IN - 60);

        (, uint256 pot, uint256 currentBet,,) = pokerTable.getHandInfo();
        assertEq(pot, 60 + BIG_BLIND); // 60 from SB + 20 from BB
        assertEq(currentBet, 60);
    }

    function test_Raise_RevertIfTooSmall() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB tries to min-raise less than BB
        vm.prank(operator1);
        vm.roll(block.number + 1);

        vm.expectRevert("Raise too small");
        pokerTable.raise(0, 30); // Min should be 40 (20 + 20)
    }

    function test_Raise_ReraiseBattle() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB raises to 60
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 60);

        // BB re-raises to 120
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 120);

        (, uint256 pot, uint256 currentBet,,) = pokerTable.getHandInfo();
        assertEq(currentBet, 120);
        assertEq(pot, 60 + 120); // Both committed 60 and 120
    }

    // ============ Authorization Tests ============

    function test_Action_RevertIfNotOperator() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.prank(address(0x999));
        vm.roll(block.number + 1);

        vm.expectRevert("Not operator");
        pokerTable.fold(0);
    }

    function test_Action_RevertIfNotYourTurn() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Seat 1 (BB) tries to act but it's SB's turn
        vm.prank(operator2);
        vm.roll(block.number + 1);

        vm.expectRevert("Not your turn");
        pokerTable.check(1);
    }

    function test_Action_OwnerCanAct() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Owner acts directly (not via operator)
        vm.prank(owner1);
        vm.roll(block.number + 1);

        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
    }

    // ============ Betting Round Completion Tests ============

    function test_BettingRoundComplete_ToVRF() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // BB checks -> round complete
        vm.prank(operator2);
        vm.roll(block.number + 1);

        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);

        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP);

        pokerTable.check(1);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_FulfillVRF_TransitionToFlop() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Complete pre-flop betting
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // VRF fulfillment
        pokerTable.fulfillVRF(PokerTable.GameState.BETTING_FLOP);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));

        // Check that actor is now BB (seat 1) for post-flop
        (,,, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 1); // Non-button acts first post-flop
    }

    function test_FullHandToShowdown() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Pre-flop: SB calls, BB checks
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // Fulfill VRF for flop
        pokerTable.fulfillVRF(PokerTable.GameState.BETTING_FLOP);

        // Flop: BB checks, SB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Fulfill VRF for turn
        pokerTable.fulfillVRF(PokerTable.GameState.BETTING_TURN);

        // Turn: BB checks, SB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Fulfill VRF for river
        pokerTable.fulfillVRF(PokerTable.GameState.BETTING_RIVER);

        // River: BB checks, SB checks -> Showdown
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        // Settle showdown (seat 0 wins for testing)
        pokerTable.settleShowdown(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Seat 0 should have won the pot (40 total)
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        assertEq(seat0.stack, BUY_IN + BIG_BLIND); // Won opponent's blind
    }

    // ============ View Function Tests ============

    function test_GetAmountToCall() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB needs to call BIG_BLIND - SMALL_BLIND
        uint256 toCall = pokerTable.getAmountToCall(0);
        assertEq(toCall, BIG_BLIND - SMALL_BLIND);

        // BB can check (0 to call)
        uint256 bbToCall = pokerTable.getAmountToCall(1);
        assertEq(bbToCall, 0);
    }

    function test_CanCheck() public {
        _setupBothSeats();
        pokerTable.startHand();

        assertFalse(pokerTable.canCheck(0)); // SB cannot check pre-flop
        assertTrue(pokerTable.canCheck(1));  // BB can check
    }

    // ============ Timeout Tests (T-0102) ============

    event ForceTimeout(uint256 indexed handId, uint8 indexed seatIndex, PokerTable.ActionType forcedAction);

    function test_Action_RevertAfterDeadline() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Advance time past the 30-minute deadline
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        // SB tries to act but deadline passed
        vm.prank(operator1);
        vm.expectRevert("Action deadline passed");
        pokerTable.call(0);
    }

    function test_ForceTimeout_RevertIfDeadlineNotPassed() public {
        _setupBothSeats();
        pokerTable.startHand();
        vm.roll(block.number + 1);

        // Try to force timeout before deadline
        vm.expectRevert("Deadline not passed");
        pokerTable.forceTimeout();
    }

    function test_ForceTimeout_AutoFoldWhenMustCall() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB must call (not at currentBet), so should auto-fold
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        // Expect ForceTimeout and HandSettled events
        vm.expectEmit(true, true, false, true);
        emit ForceTimeout(1, 0, PokerTable.ActionType.FOLD);

        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 1, SMALL_BLIND + BIG_BLIND);

        pokerTable.forceTimeout();

        // Game should be settled, seat 1 wins
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertEq(seat1.stack, BUY_IN - BIG_BLIND + SMALL_BLIND + BIG_BLIND);
    }

    function test_ForceTimeout_AutoCheckWhenLegal() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls to match BB
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // Now BB can check - advance time past deadline
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        // Expect ForceTimeout with CHECK
        vm.expectEmit(true, true, false, true);
        emit ForceTimeout(1, 1, PokerTable.ActionType.CHECK);

        // Expect betting round to complete
        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);

        pokerTable.forceTimeout();

        // Should have transitioned to waiting for VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_ForceTimeout_ResetsDeadlineAfterAction() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // Advance time past deadline and force timeout
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);
        pokerTable.forceTimeout();

        // After force timeout that auto-checks, should have completed betting round
        // Now waiting for VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_ForceTimeout_MultipleTimeoutsToShowdown() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Pre-flop: SB calls, BB times out (auto-check)
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);
        pokerTable.forceTimeout(); // BB auto-checks

        // Fulfill VRF for flop
        pokerTable.fulfillVRF(PokerTable.GameState.BETTING_FLOP);

        // Flop: both time out (both auto-check)
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);
        pokerTable.forceTimeout(); // BB (seat 1) auto-checks

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);
        pokerTable.forceTimeout(); // SB (seat 0) auto-checks

        // Should be waiting for VRF for turn
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_TURN));
    }

    function test_ForceTimeout_RevertIfNotInBettingState() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls, BB checks to complete betting round
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // Now waiting for VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        // Force timeout should revert
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        vm.expectRevert("Not in betting state");
        pokerTable.forceTimeout();
    }

    // ============ Helper Functions ============

    function _setupBothSeats() internal {
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);
        pokerTable.registerSeat(1, owner2, operator2, BUY_IN);
    }
}
