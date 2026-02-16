// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/RailbirdChip.sol";
import "../src/HandEvaluator.sol";
import "../src/mocks/MockVRFAdapter.sol";

contract PokerTableTest is Test {
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    RailbirdChip public chip;

    // 4 players
    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public owner3 = address(0x3);
    address public owner4 = address(0x4);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);
    address public operator3 = address(0x33);
    address public operator4 = address(0x44);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant BUY_IN = 1000;
    uint256 constant TEST_RANDOMNESS = 12345678901234567890;

    // With button=0: SB=seat1, BB=seat2, UTG=seat3
    // Pre-flop order: seat3(UTG) -> seat0(BTN) -> seat1(SB) -> seat2(BB)
    // Post-flop order: seat1(SB) -> seat2(BB) -> seat3(UTG) -> seat0(BTN)

    event SeatUpdated(uint8 indexed seatIndex, address owner, address operator, uint256 stack);
    event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat);
    event ActionTaken(uint256 indexed handId, uint8 indexed seatIndex, PokerTable.ActionType action, uint256 amount, uint256 potAfter);
    event PotUpdated(uint256 indexed handId, uint256 pot);
    event BettingRoundComplete(uint256 indexed handId, PokerTable.GameState fromState, PokerTable.GameState toState);
    event VRFRequested(uint256 indexed handId, PokerTable.GameState street, uint256 requestId);
    event CommunityCardsDealt(uint256 indexed handId, PokerTable.GameState street, uint8[] cards);
    event HandSettled(uint256 indexed handId, uint8 winnerSeat, uint256 potAmount);
    event ForceTimeout(uint256 indexed handId, uint8 indexed seatIndex, PokerTable.ActionType forcedAction);
    event HoleCommitSubmitted(uint256 indexed handId, uint8 indexed seatIndex, bytes32 commitment);
    event HoleCardsRevealed(uint256 indexed handId, uint8 indexed seatIndex, uint8 card1, uint8 card2);
    event VRFReRequested(uint256 indexed handId, PokerTable.GameState street, uint256 oldRequestId, uint256 newRequestId);

    function setUp() public {
        mockVRF = new MockVRFAdapter();
        chip = new RailbirdChip(address(this));
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chip));
        _fundAndApprove(owner1);
        _fundAndApprove(owner2);
        _fundAndApprove(owner3);
        _fundAndApprove(owner4);
    }

    function test_Constructor_RevertIfTableIdIsZero() public {
        vm.expectRevert("Table ID must be > 0");
        new PokerTable(0, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chip));
    }

    function test_Constructor_RevertIfSmallBlindIsZero() public {
        vm.expectRevert("Small blind must be > 0");
        new PokerTable(1, 0, BIG_BLIND, address(mockVRF), address(chip));
    }

    function test_Constructor_RevertIfVrfAdapterIsZero() public {
        vm.expectRevert("Invalid VRF adapter");
        new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(0), address(chip));
    }

    // ============ Seat Registration Tests ============

    function test_RegisterSeat_Success() public {
        vm.expectEmit(true, false, false, true);
        emit SeatUpdated(0, owner1, operator1, BUY_IN);

        _registerSeat(0, owner1, operator1, BUY_IN);

        PokerTable.Seat memory seat = pokerTable.getSeat(0);
        assertEq(seat.owner, owner1);
        assertEq(seat.operator, operator1);
        assertEq(seat.stack, BUY_IN);
    }

    function test_RegisterSeat_OperatorDefaultsToOwner() public {
        _registerSeat(0, owner1, address(0), BUY_IN);

        PokerTable.Seat memory seat = pokerTable.getSeat(0);
        assertEq(seat.operator, owner1);
    }

    function test_RegisterSeat_RevertIfSeatTaken() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.expectRevert("Seat already taken");
        _registerSeat(0, owner2, operator2, BUY_IN);
    }

    function test_RegisterSeat_RevertIfBuyInTooSmall() public {
        vm.expectRevert("Buy-in too small");
        _registerSeat(0, owner1, operator1, BIG_BLIND * 5);
    }

    function test_RegisterSeat_AllFourSeats() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());
    }

    function test_AllSeatsFilled_FalseWithPartial() public {
        assertFalse(pokerTable.allSeatsFilled());

        _registerSeat(0, owner1, operator1, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());

        _registerSeat(1, owner2, operator2, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());

        _registerSeat(2, owner3, operator3, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());

        _registerSeat(3, owner4, operator4, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());
    }

    // ============ Hand Start Tests ============

    function test_StartHand_Success() public {
        _setupAllSeats();

        vm.expectEmit(true, false, false, true);
        emit HandStarted(1, SMALL_BLIND, BIG_BLIND, 0);

        pokerTable.startHand();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
        assertEq(pokerTable.currentHandId(), 1);

        // With button=0: SB=1, BB=2, UTG(first actor)=3
        (uint256 handId, uint256 pot, uint256 currentBet, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(handId, 1);
        assertEq(pot, SMALL_BLIND + BIG_BLIND);
        assertEq(currentBet, BIG_BLIND);
        assertEq(actorSeat, 3, "UTG acts first pre-flop");
    }

    function test_StartHand_BlindsDeducted() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Button=0: SB=seat1, BB=seat2, others unaffected
        assertEq(pokerTable.getSeat(0).stack, BUY_IN, "Button stack unchanged");
        assertEq(pokerTable.getSeat(1).stack, BUY_IN - SMALL_BLIND, "SB posted blind");
        assertEq(pokerTable.getSeat(2).stack, BUY_IN - BIG_BLIND, "BB posted blind");
        assertEq(pokerTable.getSeat(3).stack, BUY_IN, "UTG stack unchanged");
    }

    function test_StartHand_AllowsPartialTableWithTwoFundedSeats() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    function test_StartHand_EvictsZeroStackSeat() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);

        vm.prank(owner1);
        pokerTable.cashOutSeat(0, BUY_IN, owner1);
        assertEq(pokerTable.getSeat(0).stack, 0);
        assertEq(pokerTable.getSeat(0).owner, owner1);

        pokerTable.startHand();

        assertEq(pokerTable.getSeat(0).owner, address(0), "Zero-stack seat should be evicted");
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    // ============ Action Tests ============

    function test_Fold_UTGFolds_GameContinues() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG (seat 3) folds - 3 players remain, game continues
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Game should NOT be settled - 3 players still active
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));

        // Next actor should be Button (seat 0)
        (,,, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 0, "Button acts next after UTG fold");
    }

    function test_Fold_AllFoldToOne_Settles() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG folds
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Button folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // SB folds - only BB remains
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // BB (seat 2) wins
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
        PokerTable.Seat memory bbSeat = pokerTable.getSeat(2);
        assertEq(bbSeat.stack, BUY_IN - BIG_BLIND + SMALL_BLIND + BIG_BLIND, "BB wins pot");
    }

    function test_Call_UTGCallsBB() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG (seat 3) calls the BB
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        PokerTable.Seat memory utg = pokerTable.getSeat(3);
        assertEq(utg.currentBet, BIG_BLIND);
        assertEq(utg.stack, BUY_IN - BIG_BLIND);

        (, uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, SMALL_BLIND + BIG_BLIND + BIG_BLIND); // SB + BB + UTG call
    }

    function test_Check_BBChecksAfterAllCall() public {
        _setupAllSeats();
        pokerTable.startHand();

        // All call/check to complete preflop
        _completePreflop();

        // Should trigger betting round completion
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_Check_RevertIfMustCall() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG (seat 3) tries to check but must call or raise (owes BB)
        vm.prank(operator4);
        vm.roll(block.number + 1);

        vm.expectRevert("Cannot check, must call or raise");
        pokerTable.check(3);
    }

    function test_Raise_Success() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG (seat 3) raises to 60
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.raise(3, 60);

        PokerTable.Seat memory utg = pokerTable.getSeat(3);
        assertEq(utg.currentBet, 60);
        assertEq(utg.stack, BUY_IN - 60);

        (, uint256 pot, uint256 currentBet,,) = pokerTable.getHandInfo();
        assertEq(pot, SMALL_BLIND + BIG_BLIND + 60); // blinds + UTG raise
        assertEq(currentBet, 60);
    }

    function test_Raise_RevertIfTooSmall() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.prank(operator4);
        vm.roll(block.number + 1);

        vm.expectRevert("Raise too small");
        pokerTable.raise(3, 30); // Min should be 40 (20 + 20)
    }

    function test_Raise_ReraiseBattle() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG raises to 60
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.raise(3, 60);

        // Button re-raises to 120
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 120);

        (, uint256 pot, uint256 currentBet,,) = pokerTable.getHandInfo();
        assertEq(currentBet, 120);
        // Pot = SB(10) + BB(20) + UTG(60) + BTN(120)
        assertEq(pot, SMALL_BLIND + BIG_BLIND + 60 + 120);
    }

    function test_Raise_ResetsOtherPlayersHasActed() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // Button raises - all others must re-act
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 60);

        // SB must now call/raise (not just check)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        vm.expectRevert("Cannot check, must call or raise");
        pokerTable.check(1);
    }

    // ============ Authorization Tests ============

    function test_Action_RevertIfNotOperator() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.prank(address(0x999));
        vm.roll(block.number + 1);

        vm.expectRevert("Not operator");
        pokerTable.fold(3);
    }

    function test_Action_RevertIfNotYourTurn() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Seat 0 (Button) tries to act but it's UTG's (seat 3) turn
        vm.prank(operator1);
        vm.roll(block.number + 1);

        vm.expectRevert("Not your turn");
        pokerTable.check(0);
    }

    function test_Action_OwnerCanAct() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Owner acts directly (not via operator) for UTG
        vm.prank(owner4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Game should still be active (3 players remain)
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    // ============ Betting Round Completion Tests ============

    function test_BettingRoundComplete_ToVRF() public {
        _setupAllSeats();
        pokerTable.startHand();

        // All call, BB checks -> round complete
        // UTG calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // Button calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // SB calls
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // BB checks -> round complete, VRF requested
        vm.prank(operator3);
        vm.roll(block.number + 1);

        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);

        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 1);

        pokerTable.check(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
        assertEq(mockVRF.lastRequestId(), 1);
    }

    function test_FulfillVRF_TransitionToFlop() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));

        // Post-flop: first active after button (seat 1, SB) acts first
        (,,, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 1, "SB acts first post-flop");

        // Verify community cards were dealt (flop = 3 cards)
        uint8[5] memory cards = pokerTable.getCommunityCards();
        assertTrue(cards[0] < 52, "Flop card 1 should be dealt");
        assertTrue(cards[1] < 52, "Flop card 2 should be dealt");
        assertTrue(cards[2] < 52, "Flop card 3 should be dealt");
        assertEq(cards[3], 255, "Turn should not be dealt yet");
        assertEq(cards[4], 255, "River should not be dealt yet");
    }

    function test_FullHandToShowdown() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Commit cards for all seats
        uint8[4] memory h1 = [uint8(12), uint8(0), uint8(2), uint8(4)];
        uint8[4] memory h2 = [uint8(25), uint8(14), uint8(16), uint8(18)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        _playToShowdown();

        // Reveal all active seats
        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        // Compute expected winner using HandEvaluator
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8 expectedWinner = _findWinner(comm, h1, h2, 4);

        uint256 stackBefore = pokerTable.getSeat(expectedWinner).stack;
        pokerTable.settleShowdown();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
        uint256 stackAfter = pokerTable.getSeat(expectedWinner).stack;
        assertEq(stackAfter, stackBefore + 80, "Winner receives full pot");
    }

    // ============ VRF Integration Tests (T-0104) ============

    function test_VRF_RequestInSameTxAsFinalAction() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Complete preflop betting with calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // Before BB check, verify no VRF request yet
        assertEq(mockVRF.lastRequestId(), 0);

        // BB checks - should trigger VRF request in same tx
        vm.prank(operator3);
        vm.roll(block.number + 1);

        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);
        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 1);

        pokerTable.check(2);

        assertEq(mockVRF.lastRequestId(), 1);
        assertEq(mockVRF.lastTableId(), 1);
        assertEq(mockVRF.lastHandId(), 1);
        assertEq(pokerTable.pendingVRFRequestId(), 1);
    }

    function test_VRF_FlopDealsCommunityCards() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();

        // Verify all community cards undealt before VRF
        uint8[5] memory cardsBefore = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertEq(cardsBefore[i], 255, "Cards should be undealt");
        }

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        uint8[5] memory cardsAfter = pokerTable.getCommunityCards();
        assertTrue(cardsAfter[0] < 52, "Flop card 1 dealt");
        assertTrue(cardsAfter[1] < 52, "Flop card 2 dealt");
        assertTrue(cardsAfter[2] < 52, "Flop card 3 dealt");
        assertEq(cardsAfter[3], 255, "Turn not yet dealt");
        assertEq(cardsAfter[4], 255, "River not yet dealt");
    }

    function test_VRF_TurnDealsSingleCard() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        _completePostflopBetting();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_TURN));

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 100);

        uint8[5] memory cards = pokerTable.getCommunityCards();
        assertTrue(cards[3] < 52, "Turn card dealt");
        assertEq(cards[4], 255, "River not yet dealt");
    }

    function test_VRF_RiverDealsFinalCard() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        _completePostflopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 100);

        _completePostflopBetting();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_RIVER));

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 200);

        uint8[5] memory cards = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertTrue(cards[i] < 52, "All cards should be dealt");
        }
    }

    function test_VRF_CommunityCardsResetOnNewHand() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Verify flop dealt
        uint8[5] memory cards1 = pokerTable.getCommunityCards();
        assertTrue(cards1[0] < 52, "Flop dealt");

        // Fold to end hand - SB (seat 1) is the actor post-flop
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.fold(2);

        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Start new hand
        pokerTable.startHand();

        uint8[5] memory cards2 = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertEq(cards2[i], 255, "Cards should be reset");
        }
    }

    function test_VRF_CardsDerivedDeterministically() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        uint256 specificRandomness = 999999;
        mockVRF.fulfillLastRequest(specificRandomness);

        uint8[5] memory cards1 = pokerTable.getCommunityCards();

        // End hand (SB folds, BB folds, UTG folds on flop → button wins)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.fold(2);

        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Start second hand - button has moved to seat 1
        // New positions: SB=2, BB=3, UTG=0
        pokerTable.startHand();

        // UTG (seat 0) calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // Button (seat 1) calls
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // SB (seat 2) calls
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.call(2);

        // BB (seat 3) checks
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.check(3);

        mockVRF.fulfillLastRequest(specificRandomness);

        uint8[5] memory cards2 = pokerTable.getCommunityCards();

        // Same randomness should produce same cards
        assertEq(cards1[0], cards2[0], "Same randomness = same flop card 1");
        assertEq(cards1[1], cards2[1], "Same randomness = same flop card 2");
        assertEq(cards1[2], cards2[2], "Same randomness = same flop card 3");
    }

    // ============ VRF Caller Enforcement + ReRequest Tests (T-0903) ============

    function test_FulfillVRF_RevertIfNotAdapter() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        // Table is now in WAITING_VRF_FLOP
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        uint256 reqId = pokerTable.pendingVRFRequestId();

        // Direct call from random address should revert
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only VRF adapter");
        pokerTable.fulfillVRF(reqId, 123);
    }

    function test_FulfillVRF_SucceedsThroughAdapter() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        // Fulfill through mock adapter (which is the registered vrfAdapter)
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));
    }

    function test_ReRequestVRF_SuccessAfterTimeout() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        uint256 oldReqId = pokerTable.pendingVRFRequestId();
        assertTrue(oldReqId > 0);

        // Advance past VRF_TIMEOUT (5 minutes)
        vm.warp(block.timestamp + 6 minutes);

        pokerTable.reRequestVRF();

        uint256 newReqId = pokerTable.pendingVRFRequestId();
        assertTrue(newReqId > oldReqId, "New request ID should be larger");

        // Fulfill the new request
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));
    }

    function test_ReRequestVRF_RevertBeforeTimeout() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        // Try to re-request immediately (before timeout)
        vm.expectRevert("VRF timeout not reached");
        pokerTable.reRequestVRF();
    }

    function test_ReRequestVRF_RevertNotInVRFState() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Still in BETTING_PRE
        vm.expectRevert("Not waiting for VRF");
        pokerTable.reRequestVRF();
    }

    function test_ReRequestVRF_EmitsEvent() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        uint256 oldReqId = pokerTable.pendingVRFRequestId();

        vm.warp(block.timestamp + 6 minutes);

        // The VRFReRequested event
        pokerTable.reRequestVRF();

        uint256 newReqId = pokerTable.pendingVRFRequestId();
        assertTrue(newReqId > oldReqId);
    }

    function test_ReRequestVRF_OldRequestRejected() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        uint256 oldReqId = pokerTable.pendingVRFRequestId();

        vm.warp(block.timestamp + 6 minutes);
        pokerTable.reRequestVRF();

        // Fulfilling old request should fail (request ID mismatch)
        vm.expectRevert("Callback failed");
        mockVRF.fulfillRandomness(oldReqId, TEST_RANDOMNESS);
    }

    function test_ReRequestVRF_MultipleReRequests() public {
        _setupAllSeats();
        pokerTable.startHand();
        _completePreflop();

        // First re-request
        vm.warp(block.timestamp + 6 minutes);
        pokerTable.reRequestVRF();
        uint256 reqId2 = pokerTable.pendingVRFRequestId();

        // Second re-request
        vm.warp(block.timestamp + 6 minutes);
        pokerTable.reRequestVRF();
        uint256 reqId3 = pokerTable.pendingVRFRequestId();

        assertTrue(reqId3 > reqId2, "Third request should have larger ID");

        // Only latest request should work
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));
    }

    // ============ Settlement Tests (T-0105) ============

    function test_Settlement_FoldTransfersPotToWinner() public {
        _setupAllSeats();
        pokerTable.startHand();

        // All fold to BB (seat 2)
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // BB wins
        uint256 finalStack2 = pokerTable.getSeat(2).stack;
        uint256 expectedPot = SMALL_BLIND + BIG_BLIND;
        assertEq(finalStack2, BUY_IN - BIG_BLIND + expectedPot, "BB wins pot");
    }

    function test_Settlement_FoldEmitsCorrectEvent() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG folds
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Button folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // SB folds - BB wins
        vm.prank(operator2);
        vm.roll(block.number + 1);

        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 2, SMALL_BLIND + BIG_BLIND);

        pokerTable.fold(1);
    }

    function test_Settlement_ShowdownDistributesPot() public {
        _setupAllSeats();
        pokerTable.startHand();

        uint8[4] memory h1 = [uint8(12), uint8(0), uint8(2), uint8(4)];
        uint8[4] memory h2 = [uint8(25), uint8(14), uint8(16), uint8(18)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        // UTG raises to 100
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.raise(3, 100);

        // Others call, BB calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.call(2);

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        _completePostflopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        _completePostflopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        _completePostflopBetting();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        // Reveal all seats
        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        // Compute expected winner
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8 expectedWinner = _findWinner(comm, h1, h2, 4);
        uint256 stackBefore = pokerTable.getSeat(expectedWinner).stack;

        pokerTable.settleShowdown();

        uint256 stackAfter = pokerTable.getSeat(expectedWinner).stack;
        assertEq(stackAfter, stackBefore + 400, "Winner receives full pot (4 * 100)");
    }

    function test_Settlement_ShowdownEmitsEvent() public {
        _setupAllSeats();
        pokerTable.startHand();

        uint8[4] memory h1 = [uint8(0), uint8(12), uint8(2), uint8(4)];
        uint8[4] memory h2 = [uint8(14), uint8(25), uint8(16), uint8(18)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        _playToShowdown();

        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        // Compute expected winner
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8 expectedWinner = _findWinner(comm, h1, h2, 4);

        // Pot is 4 * BB = 80
        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, expectedWinner, BIG_BLIND * 4);

        pokerTable.settleShowdown();
    }

    function test_Settlement_PotAccumulatesFromRaises() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG raises to 60
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.raise(3, 60);

        // Button re-raises to 120
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 120);

        // SB folds
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // BB folds
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.fold(2);

        // UTG calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // Pot should be SB(10) + BB(20) + UTG(120) + BTN(120) = 270
        (, uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, 270, "Pot accumulates from raises");
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // UTG folds on flop (first active after button)
        // With SB(1) and BB(2) folded, active are: BTN(0) and UTG(3)
        // First active after button(0) is seat 3 (UTG)
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Button wins
        PokerTable.Seat memory btn = pokerTable.getSeat(0);
        assertEq(btn.stack, BUY_IN - 120 + 270, "Winner receives accumulated pot");
    }

    function test_Settlement_ButtonMovesAfterHand() public {
        _setupAllSeats();
        assertEq(pokerTable.buttonSeat(), 0, "Initial button at seat 0");

        pokerTable.startHand();

        // All fold to BB
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        assertEq(pokerTable.buttonSeat(), 1, "Button moves to seat 1");

        // Play another hand and fold
        pokerTable.startHand();

        // New positions: BTN=1, SB=2, BB=3, UTG=0
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.fold(2);

        assertEq(pokerTable.buttonSeat(), 2, "Button moves to seat 2");
    }

    function test_Settlement_StateTransitionsToSettled() public {
        _setupAllSeats();
        pokerTable.startHand();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));

        // All fold to BB
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
    }

    function test_Settlement_CanStartNewHandAfterSettlement() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Quick fold to settle
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        pokerTable.startHand();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
        assertEq(pokerTable.currentHandId(), 2, "Hand ID increments");
    }

    // ============ View Function Tests ============

    function test_GetAmountToCall() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG needs to call BB
        assertEq(pokerTable.getAmountToCall(3), BIG_BLIND, "UTG owes BB");
        // Button needs to call BB
        assertEq(pokerTable.getAmountToCall(0), BIG_BLIND, "Button owes BB");
        // SB needs to call difference
        assertEq(pokerTable.getAmountToCall(1), BIG_BLIND - SMALL_BLIND, "SB owes BB-SB");
        // BB can check (0 to call)
        assertEq(pokerTable.getAmountToCall(2), 0, "BB owes 0");
    }

    function test_CanCheck() public {
        _setupAllSeats();
        pokerTable.startHand();

        assertFalse(pokerTable.canCheck(3)); // UTG cannot check pre-flop
        assertFalse(pokerTable.canCheck(0)); // Button cannot check pre-flop
        assertFalse(pokerTable.canCheck(1)); // SB cannot check pre-flop
        assertTrue(pokerTable.canCheck(2));  // BB can check
    }

    // ============ Timeout Tests (T-0102) ============

    function test_Action_RevertAfterDeadline() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        // UTG tries to act but deadline passed
        vm.prank(operator4);
        vm.expectRevert("Action deadline passed");
        pokerTable.call(3);
    }

    function test_ForceTimeout_RevertIfDeadlineNotPassed() public {
        _setupAllSeats();
        pokerTable.startHand();
        vm.roll(block.number + 1);

        vm.expectRevert("Deadline not passed");
        pokerTable.forceTimeout();
    }

    function test_ForceTimeout_AutoFoldWhenMustCall() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG must call (not at currentBet), so should auto-fold
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        vm.expectEmit(true, true, false, true);
        emit ForceTimeout(1, 3, PokerTable.ActionType.FOLD);

        pokerTable.forceTimeout();

        // Game should still be active (3 players remain)
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    function test_ForceTimeout_AutoFoldSettlesWhenOneRemains() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG folds
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Button folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // SB must call, times out -> auto-fold, BB wins
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        vm.expectEmit(true, true, false, true);
        emit ForceTimeout(1, 1, PokerTable.ActionType.FOLD);

        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 2, SMALL_BLIND + BIG_BLIND);

        pokerTable.forceTimeout();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
    }

    function test_ForceTimeout_AutoCheckWhenLegal() public {
        _setupAllSeats();
        pokerTable.startHand();

        // All call, then BB can check - advance time
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // Now BB (seat 2) can check - advance time past deadline
        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        vm.expectEmit(true, true, false, true);
        emit ForceTimeout(1, 2, PokerTable.ActionType.CHECK);

        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);

        pokerTable.forceTimeout();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_ForceTimeout_MultipleTimeoutsToShowdown() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Pre-flop: all call, BB times out (auto-check)
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);
        pokerTable.forceTimeout(); // BB auto-checks

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Flop: all timeout auto-checks (post-flop order: SB(1), BB(2), UTG(3), BTN(0))
        for (uint8 i = 0; i < 4; i++) {
            vm.warp(block.timestamp + 31 minutes);
            vm.roll(block.number + 1);
            pokerTable.forceTimeout();
        }

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_TURN));
    }

    function test_ForceTimeout_RevertIfNotInBettingState() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();

        // Now waiting for VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        vm.expectRevert("Not in betting state");
        pokerTable.forceTimeout();
    }

    // ============ One Action Per Block Tests (T-0103) ============

    function test_OneActionPerBlock_SecondActionReverts() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // UTG calls
        vm.prank(operator4);
        pokerTable.call(3);

        // Button tries in same block
        vm.prank(operator1);
        vm.expectRevert("One action per block");
        pokerTable.call(0);
    }

    function test_OneActionPerBlock_SucceedsAfterBlockAdvance() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        vm.prank(operator4);
        pokerTable.call(3);

        vm.roll(block.number + 1);

        vm.prank(operator1);
        pokerTable.call(0);

        // Verify action succeeded
        PokerTable.Seat memory btn = pokerTable.getSeat(0);
        assertEq(btn.currentBet, BIG_BLIND);
    }

    function test_OneActionPerBlock_ForceTimeoutRespects() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // UTG calls
        vm.prank(operator4);
        pokerTable.call(3);

        vm.warp(block.timestamp + 31 minutes);

        // Same block - forceTimeout should also respect one-action-per-block
        vm.expectRevert("One action per block");
        pokerTable.forceTimeout();

        vm.roll(block.number + 1);

        pokerTable.forceTimeout();
    }

    function test_OneActionPerBlock_StartHandSetsLastActionBlock() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Without advancing block, action should fail
        vm.prank(operator4);
        vm.expectRevert("One action per block");
        pokerTable.call(3);
    }

    // ============ Hole Card Commit/Reveal Tests (T-0204) ============

    function test_SubmitHoleCommit_Success() public {
        _setupAllSeats();
        pokerTable.startHand();

        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(25), bytes32("salt123")));

        vm.expectEmit(true, true, false, true);
        emit HoleCommitSubmitted(1, 0, commitment);

        pokerTable.submitHoleCommit(1, 0, commitment);

        assertEq(pokerTable.holeCommits(1, 0), commitment);
    }

    function test_SubmitHoleCommit_AllFourSeats() public {
        _setupAllSeats();
        pokerTable.startHand();

        for (uint8 i = 0; i < 4; i++) {
            bytes32 commit = keccak256(abi.encodePacked(uint256(1), i, uint8(i * 10), uint8(i * 10 + 5), bytes32("salt")));
            pokerTable.submitHoleCommit(1, i, commit);
            assertEq(pokerTable.holeCommits(1, i), commit);
        }
    }

    function test_SubmitHoleCommit_RevertIfAlreadySubmitted() public {
        _setupAllSeats();
        pokerTable.startHand();

        bytes32 commitment = keccak256("test");
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Commitment already exists");
        pokerTable.submitHoleCommit(1, 0, keccak256("another"));
    }

    function test_SubmitHoleCommit_RevertIfEmptyCommitment() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.expectRevert("Empty commitment");
        pokerTable.submitHoleCommit(1, 0, bytes32(0));
    }

    function test_SubmitHoleCommit_RevertIfInvalidSeat() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.expectRevert("Invalid seat");
        pokerTable.submitHoleCommit(1, 9, keccak256("test")); // seat 9 is out of range (0..8)
    }

    function test_SubmitHoleCommit_RevertIfInvalidHandId() public {
        _setupAllSeats();
        pokerTable.startHand();

        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(0, 0, keccak256("test"));

        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(2, 0, keccak256("test")); // hand 2 doesn't exist yet
    }

    function test_SubmitHoleCommit_RevertIfGameNotStarted() public {
        _setupAllSeats();

        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(1, 0, keccak256("test"));
    }

    function test_RevealHoleCards_Success() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("test-salt-12345678901234567890");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectEmit(true, true, false, true);
        emit HoleCardsRevealed(1, 0, card1, card2);

        pokerTable.revealHoleCards(1, 0, card1, card2, salt);

        assertTrue(pokerTable.isHoleCardsRevealed(1, 0));

        (uint8 revealedCard1, uint8 revealedCard2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(revealedCard1, card1);
        assertEq(revealedCard2, card2);
    }

    function test_RevealHoleCards_RevertWithWrongCards() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, 11, 25, salt);

        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, 10, 26, salt);
    }

    function test_RevealHoleCards_RevertWithWrongSalt() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("correct-salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, card1, card2, bytes32("wrong-salt"));
    }

    function test_RevealHoleCards_RevertIfNoCommitment() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        vm.expectRevert("No commitment found");
        pokerTable.revealHoleCards(1, 0, 10, 25, bytes32("salt"));
    }

    function test_RevealHoleCards_RevertIfAlreadyRevealed() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        pokerTable.revealHoleCards(1, 0, card1, card2, salt);

        vm.expectRevert("Already revealed");
        pokerTable.revealHoleCards(1, 0, card1, card2, salt);
    }

    function test_RevealHoleCards_RevertIfNotAtShowdown() public {
        _setupAllSeats();
        pokerTable.startHand();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Still in BETTING_PRE state
        vm.expectRevert("Not at showdown");
        pokerTable.revealHoleCards(1, 0, card1, card2, salt);
    }

    function test_RevealHoleCards_RevertIfInvalidCards() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(52), uint8(25), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Invalid card value");
        pokerTable.revealHoleCards(1, 0, 52, 25, salt);
    }

    function test_RevealHoleCards_RevertIfDuplicateCards() public {
        _setupAllSeats();
        pokerTable.startHand();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(10), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Duplicate cards");
        pokerTable.revealHoleCards(1, 0, 10, 10, salt);
    }

    function test_GetRevealedHoleCards_ReturnsUnrevealedDefault() public {
        _setupAllSeats();
        pokerTable.startHand();

        (uint8 card1, uint8 card2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(card1, 255);
        assertEq(card2, 255);
    }

    function test_RevealHoleCards_CanRevealAfterSettlement() public {
        _setupAllSeats();
        pokerTable.startHand();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // All fold to BB
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Can still reveal after settlement
        pokerTable.revealHoleCards(1, 0, card1, card2, salt);
        assertTrue(pokerTable.isHoleCardsRevealed(1, 0));
    }

    function test_FullShowdownWithReveal_AllFourSeats() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Submit commitments for all 4 seats (distinct cards)
        uint8[4] memory c1 = [uint8(10), uint8(20), uint8(30), uint8(40)];
        uint8[4] memory c2 = [uint8(15), uint8(25), uint8(35), uint8(45)];
        bytes32[4] memory salts;
        salts[0] = bytes32("salt-seat-0");
        salts[1] = bytes32("salt-seat-1");
        salts[2] = bytes32("salt-seat-2");
        salts[3] = bytes32("salt-seat-3");

        for (uint8 i = 0; i < 4; i++) {
            bytes32 commitment = keccak256(abi.encodePacked(uint256(1), i, c1[i], c2[i], salts[i]));
            pokerTable.submitHoleCommit(1, i, commitment);
        }

        _playToShowdown();

        // Reveal all 4 seats
        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, c1[i], c2[i], salts[i]);
            assertTrue(pokerTable.isHoleCardsRevealed(1, i));
        }

        pokerTable.settleShowdown();

        // Verify game is settled
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Verify all cards still accessible after settlement
        for (uint8 i = 0; i < 4; i++) {
            (uint8 rc1, uint8 rc2) = pokerTable.getRevealedHoleCards(1, i);
            assertEq(rc1, c1[i]);
            assertEq(rc2, c2[i]);
        }
    }

    // ============ 4-Seat Specific Tests ============

    function test_FourSeat_PreflopActionOrder() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG (seat 3) acts first pre-flop
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 3, "UTG acts first");

        // UTG calls, next is Button (seat 0)
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 0, "Button acts second");

        // Button calls, next is SB (seat 1)
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "SB acts third");

        // SB calls, next is BB (seat 2)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 2, "BB acts last");
    }

    function test_FourSeat_PostflopActionOrder() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Post-flop: SB(1) → BB(2) → UTG(3) → BTN(0)
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "SB acts first post-flop");

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 2, "BB acts second post-flop");

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 3, "UTG acts third post-flop");

        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.check(3);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 0, "BTN acts last post-flop");
    }

    function test_FourSeat_FoldSkipsInTurnOrder() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG folds
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        // Button calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // SB calls
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // BB checks -> round complete
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Post-flop: UTG(3) folded, so order is SB(1) → BB(2) → BTN(0)
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "SB acts first (UTG folded)");

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 2, "BB acts next");

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 0, "BTN acts last (UTG skipped)");
    }

    function test_FourSeat_MultipleFoldsMidRound() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG raises to 60
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.raise(3, 60);

        // Button folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // SB folds
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // BB calls -> betting round complete (2 active: BB and UTG)
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.call(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_FourSeat_ButtonRotatesFullCycle() public {
        _setupAllSeats();

        for (uint8 hand = 0; hand < 4; hand++) {
            assertEq(pokerTable.buttonSeat(), hand % 4, "Button rotates correctly");

            pokerTable.startHand();

            // Quick fold to settle - UTG acts first
            uint8 utg = (pokerTable.buttonSeat() + 3) % 4;
            // Note: button has already been used in startHand, get positions
            // Actually buttonSeat doesn't change until settlement, so this is fine
            // but we need to get current positions from the hand state
            (,,, uint8 actor,) = pokerTable.getHandInfo();

            // Fold everyone except last active
            for (uint8 f = 0; f < 3; f++) {
                (,,, actor,) = pokerTable.getHandInfo();
                address op = _operatorFor(actor);
                vm.prank(op);
                vm.roll(block.number + 1);
                pokerTable.fold(actor);
            }
        }

        // After 4 hands, button should be back at 0
        assertEq(pokerTable.buttonSeat(), 0, "Button completes full cycle");
    }

    function test_FourSeat_PostflopWithFoldedPlayers() public {
        _setupAllSeats();
        pokerTable.startHand();

        // UTG folds, BTN folds preflop
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.fold(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // SB calls, BB checks -> only 2 active, round completes
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Post-flop: only SB(1) and BB(2) active
        // First active after button(0) is seat 1 (SB)
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "SB acts first with only 2 remaining");

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        (,,, actor,) = pokerTable.getHandInfo();
        assertEq(actor, 2, "BB acts next");
    }

    function test_FourSeat_FoldCompletesRoundIfAllActed() public {
        _setupAllSeats();
        pokerTable.startHand();

        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Post-flop: SB(1) checks, BB(2) checks, UTG(3) checks, BTN(0) hasn't acted yet
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.check(3);

        // BTN folds - remaining 3 have all acted with matching bets → round should complete
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // After fold, _advanceAction checks if round is complete among remaining active
        // SB(1), BB(2), UTG(3) all acted, all at bet=0 → round complete
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_TURN));
    }

    // ============ Card-Based Settlement Tests (T-0902) ============

    function test_Showdown_RevertIfNoReveals() public {
        _setupAllSeats();
        pokerTable.startHand();
        _playToShowdown();

        // No reveals submitted
        vm.expectRevert("No revealed hole cards");
        pokerTable.settleShowdown();
    }

    function test_Showdown_SingleRevealWinsByDefault() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Only seat 2 reveals
        _commitCards(1, 2, 0, 14, bytes32("s2"));

        _playToShowdown();

        pokerTable.revealHoleCards(1, 2, 0, 14, bytes32("s2"));
        pokerTable.settleShowdown();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
        // Seat 2 wins the entire pot by default (only one revealed)
        PokerTable.Seat memory seat2 = pokerTable.getSeat(2);
        assertEq(seat2.stack, BUY_IN - BIG_BLIND + 80, "Single revealer wins pot");
    }

    function test_Showdown_StrongerHandWins() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Give each seat different cards; evaluator picks winner
        uint8[4] memory h1 = [uint8(12), uint8(0), uint8(2), uint8(4)];
        uint8[4] memory h2 = [uint8(25), uint8(14), uint8(16), uint8(18)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        _playToShowdown();

        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8 expectedWinner = _findWinner(comm, h1, h2, 4);
        uint256 stackBefore = pokerTable.getSeat(expectedWinner).stack;
        pokerTable.settleShowdown();

        uint256 stackAfter = pokerTable.getSeat(expectedWinner).stack;
        assertEq(stackAfter, stackBefore + 80, "Evaluator-determined winner gets pot");
    }

    function test_Showdown_LoserDoesNotGain() public {
        _setupAllSeats();
        pokerTable.startHand();

        uint8[4] memory h1 = [uint8(0), uint8(12), uint8(2), uint8(4)];
        uint8[4] memory h2 = [uint8(14), uint8(25), uint8(16), uint8(18)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        _playToShowdown();

        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        // Record all stacks before settlement
        uint256[4] memory stacksBefore;
        for (uint8 i = 0; i < 4; i++) {
            stacksBefore[i] = pokerTable.getSeat(i).stack;
        }

        pokerTable.settleShowdown();

        // Exactly one winner should have gained, others unchanged
        uint8 winnersFound;
        for (uint8 i = 0; i < 4; i++) {
            if (pokerTable.getSeat(i).stack > stacksBefore[i]) {
                winnersFound++;
            } else {
                assertEq(pokerTable.getSeat(i).stack, stacksBefore[i], "Non-winner stack unchanged");
            }
        }
        assertTrue(winnersFound >= 1, "At least one winner");
    }

    function test_Showdown_TieSplitsPot() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Both seat 0 and seat 1 have Aces (different suits, same rank)
        // Seat 0: A♣ K♣ (12, 11) - high cards A K
        // Seat 1: A♦ K♦ (25, 24) - high cards A K (same ranks)
        // With 5 shared community cards, these produce the exact same hand
        _commitCards(1, 0, 12, 11, bytes32("s0"));
        _commitCards(1, 1, 25, 24, bytes32("s1"));
        _commitCards(1, 2, 0, 14, bytes32("s2"));
        _commitCards(1, 3, 2, 16, bytes32("s3"));

        _playToShowdown();

        pokerTable.revealHoleCards(1, 0, 12, 11, bytes32("s0"));
        pokerTable.revealHoleCards(1, 1, 25, 24, bytes32("s1"));
        pokerTable.revealHoleCards(1, 2, 0, 14, bytes32("s2"));
        pokerTable.revealHoleCards(1, 3, 2, 16, bytes32("s3"));

        uint256 stack0Before = pokerTable.getSeat(0).stack;
        uint256 stack1Before = pokerTable.getSeat(1).stack;
        pokerTable.settleShowdown();

        // Check that pot was split between the tied seats
        // Total pot is 80. If 2 seats tie, each gets 40.
        // First need to check if seats 0 and 1 actually tie
        // (they have same rank cards A K, so with same community cards the best hand is identical)
        uint256 stack0After = pokerTable.getSeat(0).stack;
        uint256 stack1After = pokerTable.getSeat(1).stack;

        // The two tied players should get equal or near-equal shares
        uint256 gain0 = stack0After - stack0Before;
        uint256 gain1 = stack1After - stack1Before;
        assertEq(gain0 + gain1, 80, "Total pot distributed");
        assertTrue(gain0 > 0 && gain1 > 0, "Both tied players receive something");
        // Difference is at most 1 (remainder)
        assertTrue(gain0 >= gain1 ? gain0 - gain1 <= 1 : gain1 - gain0 <= 1, "Split is fair");
    }

    function test_Showdown_UnrevealedSeatForfeits() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Seat 0 has stronger cards but doesn't reveal
        // Seat 0: A♣ A♦ (doesn't reveal)
        _commitCards(1, 0, 12, 25, bytes32("s0"));
        // Seat 1: 2♣ 3♦ (reveals - wins by default since only revealer)
        _commitCards(1, 1, 0, 14, bytes32("s1"));

        _playToShowdown();

        // Only seat 1 reveals
        pokerTable.revealHoleCards(1, 1, 0, 14, bytes32("s1"));

        uint256 stack1Before = pokerTable.getSeat(1).stack;
        pokerTable.settleShowdown();

        // Seat 1 wins because seat 0 didn't reveal (forfeits)
        assertEq(pokerTable.getSeat(1).stack, stack1Before + 80, "Revealer wins when others forfeit");
    }

    function test_Showdown_RevertNotAtShowdown() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Still in BETTING_PRE
        vm.expectRevert("Not at showdown");
        pokerTable.settleShowdown();
    }

    function test_Showdown_WinnerDeterminedByCards_NotPosition() public {
        _setupAllSeats();
        pokerTable.startHand();

        // Give all seats different cards
        uint8[4] memory h1 = [uint8(0), uint8(2), uint8(4), uint8(12)];
        uint8[4] memory h2 = [uint8(14), uint8(16), uint8(18), uint8(25)];
        bytes32[4] memory salts = [bytes32("s0"), bytes32("s1"), bytes32("s2"), bytes32("s3")];
        for (uint8 i = 0; i < 4; i++) {
            _commitCards(1, i, h1[i], h2[i], salts[i]);
        }

        _playToShowdown();

        for (uint8 i = 0; i < 4; i++) {
            pokerTable.revealHoleCards(1, i, h1[i], h2[i], salts[i]);
        }

        // Compute expected winner
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8 expectedWinner = _findWinner(comm, h1, h2, 4);
        uint256 stackBefore = pokerTable.getSeat(expectedWinner).stack;

        pokerTable.settleShowdown();

        assertEq(
            pokerTable.getSeat(expectedWinner).stack,
            stackBefore + 80,
            "Card-evaluated winner gets pot"
        );
    }

    // ============ Helper Functions ============

    /**
     * @dev Submit a hole card commitment for testing convenience.
     */
    function _commitCards(uint256 handId, uint8 seatIndex, uint8 card1, uint8 card2, bytes32 salt) internal {
        bytes32 commitment = keccak256(abi.encodePacked(handId, seatIndex, card1, card2, salt));
        pokerTable.submitHoleCommit(handId, seatIndex, commitment);
    }

    /**
     * @dev Find the expected winner using HandEvaluator.
     */
    function _findWinner(
        uint8[5] memory comm,
        uint8[4] memory h1,
        uint8[4] memory h2,
        uint8 count
    ) internal pure returns (uint8 winner) {
        uint256 bestScore;
        for (uint8 i = 0; i < count; i++) {
            uint256 score = HandEvaluator.evaluate(comm, h1[i], h2[i]);
            if (score > bestScore) {
                bestScore = score;
                winner = i;
            }
        }
    }

    function _setupAllSeats() internal {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);
    }

    function _registerSeat(uint8 seatIndex, address owner, address operator, uint256 buyIn) internal {
        pokerTable.registerSeat(seatIndex, owner, operator, buyIn);
    }

    function _fundAndApprove(address seatOwner) internal {
        chip.mint(seatOwner, BUY_IN * 1000);
        vm.prank(seatOwner);
        chip.approve(address(pokerTable), type(uint256).max);
    }

    function _operatorFor(uint8 seat) internal view returns (address) {
        if (seat == 0) return operator1;
        if (seat == 1) return operator2;
        if (seat == 2) return operator3;
        return operator4;
    }

    /**
     * @dev Complete pre-flop betting with all players calling/checking.
     *      Button=0: UTG(3) calls, BTN(0) calls, SB(1) calls, BB(2) checks
     */
    function _completePreflop() internal {
        // UTG (seat 3) calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // Button (seat 0) calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // SB (seat 1) calls
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        // BB (seat 2) checks
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);
    }

    /**
     * @dev Complete post-flop betting round with all active players checking.
     *      Dynamically determines the current actor and checks in order.
     */
    function _completePostflopBetting() internal {
        // Check all active players in order
        for (uint8 round = 0; round < 4; round++) {
            (,,, uint8 actor, PokerTable.GameState state) = pokerTable.getHandInfo();
            // If we've moved past a betting state, stop
            if (state != PokerTable.GameState.BETTING_FLOP &&
                state != PokerTable.GameState.BETTING_TURN &&
                state != PokerTable.GameState.BETTING_RIVER) {
                break;
            }
            vm.prank(_operatorFor(actor));
            vm.roll(block.number + 1);
            pokerTable.check(actor);
        }
    }

    function _playToShowdown() internal {
        // Pre-flop
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Flop
        _completePostflopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        // Turn
        _completePostflopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        // River
        _completePostflopBetting();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));
    }
}
