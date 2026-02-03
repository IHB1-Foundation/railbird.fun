// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/mocks/MockVRFAdapter.sol";

contract PokerTableTest is Test {
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant BUY_IN = 1000;
    uint256 constant TEST_RANDOMNESS = 12345678901234567890;

    event SeatUpdated(uint8 indexed seatIndex, address owner, address operator, uint256 stack);
    event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat);
    event ActionTaken(uint256 indexed handId, uint8 indexed seatIndex, PokerTable.ActionType action, uint256 amount, uint256 potAfter);
    event PotUpdated(uint256 indexed handId, uint256 pot);
    event BettingRoundComplete(uint256 indexed handId, PokerTable.GameState fromState, PokerTable.GameState toState);
    event VRFRequested(uint256 indexed handId, PokerTable.GameState street, uint256 requestId);
    event CommunityCardsDealt(uint256 indexed handId, PokerTable.GameState street, uint8[] cards);
    event HandSettled(uint256 indexed handId, uint8 winnerSeat, uint256 potAmount);

    function setUp() public {
        mockVRF = new MockVRFAdapter();
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF));
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

        // VRF request includes requestId (will be 1 from MockVRFAdapter)
        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 1);

        pokerTable.check(1);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        // Verify VRF adapter received the request
        assertEq(mockVRF.lastRequestId(), 1);
        assertEq(mockVRF.lastHandId(), 1);
        assertEq(mockVRF.lastPurpose(), uint8(PokerTable.GameState.WAITING_VRF_FLOP));
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

        // VRF fulfillment via mock adapter
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));

        // Check that actor is now BB (seat 1) for post-flop
        (,,, uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 1); // Non-button acts first post-flop

        // Verify community cards were dealt (flop = 3 cards)
        uint8[5] memory cards = pokerTable.getCommunityCards();
        assertTrue(cards[0] < 52, "Flop card 1 should be dealt");
        assertTrue(cards[1] < 52, "Flop card 2 should be dealt");
        assertTrue(cards[2] < 52, "Flop card 3 should be dealt");
        assertEq(cards[3], 255, "Turn should not be dealt yet");
        assertEq(cards[4], 255, "River should not be dealt yet");
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
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Flop: BB checks, SB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Fulfill VRF for turn
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        // Turn: BB checks, SB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Fulfill VRF for river
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        // River: BB checks, SB checks -> Showdown
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        // Verify all community cards were dealt
        uint8[5] memory cards = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertTrue(cards[i] < 52, "All community cards should be dealt");
        }

        // Settle showdown (seat 0 wins for testing)
        pokerTable.settleShowdown(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Seat 0 should have won the pot (40 total)
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        assertEq(seat0.stack, BUY_IN + BIG_BLIND); // Won opponent's blind
    }

    // ============ VRF Integration Tests (T-0104) ============

    function test_VRF_RequestInSameTxAsFinalAction() public {
        _setupBothSeats();
        pokerTable.startHand();

        // SB calls
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        // Before BB check, verify no VRF request yet
        assertEq(mockVRF.lastRequestId(), 0);

        // BB checks - should trigger VRF request in same tx
        vm.prank(operator2);
        vm.roll(block.number + 1);

        // Expect both events in same transaction
        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);
        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 1);

        pokerTable.check(1);

        // Verify VRF request was made
        assertEq(mockVRF.lastRequestId(), 1);
        assertEq(mockVRF.lastTableId(), 1);
        assertEq(mockVRF.lastHandId(), 1);
        assertEq(pokerTable.pendingVRFRequestId(), 1);
    }

    function test_VRF_FlopDealsCommunityCards() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Complete pre-flop
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // Verify all community cards undealt before VRF
        uint8[5] memory cardsBefore = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertEq(cardsBefore[i], 255, "Cards should be undealt");
        }

        // Fulfill VRF
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Verify flop cards are dealt
        uint8[5] memory cardsAfter = pokerTable.getCommunityCards();
        assertTrue(cardsAfter[0] < 52, "Flop card 1 dealt");
        assertTrue(cardsAfter[1] < 52, "Flop card 2 dealt");
        assertTrue(cardsAfter[2] < 52, "Flop card 3 dealt");
        assertEq(cardsAfter[3], 255, "Turn not yet dealt");
        assertEq(cardsAfter[4], 255, "River not yet dealt");
    }

    function test_VRF_TurnDealsSingleCard() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Get to flop
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Complete flop betting
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Verify VRF requested for turn
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_TURN));

        // Fulfill VRF for turn
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 100);

        // Verify turn card is dealt
        uint8[5] memory cards = pokerTable.getCommunityCards();
        assertTrue(cards[3] < 52, "Turn card dealt");
        assertEq(cards[4], 255, "River not yet dealt");
    }

    function test_VRF_RiverDealsFinalCard() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Get through flop and turn
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        _completeFlopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 100);

        // Complete turn betting
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Verify VRF requested for river
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_RIVER));

        // Fulfill VRF for river
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 200);

        // Verify all cards are dealt
        uint8[5] memory cards = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertTrue(cards[i] < 52, "All cards should be dealt");
        }
    }

    function test_VRF_CommunityCardsResetOnNewHand() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Complete a hand
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Verify flop dealt
        uint8[5] memory cards1 = pokerTable.getCommunityCards();
        assertTrue(cards1[0] < 52, "Flop dealt");

        // Fold to end hand
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Start new hand
        pokerTable.startHand();

        // Verify community cards reset
        uint8[5] memory cards2 = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertEq(cards2[i], 255, "Cards should be reset");
        }
    }

    function test_VRF_CardsDerivedDeterministically() public {
        _setupBothSeats();
        pokerTable.startHand();

        _completePreflop();

        // Fulfill with specific randomness
        uint256 specificRandomness = 999999;
        mockVRF.fulfillLastRequest(specificRandomness);

        uint8[5] memory cards1 = pokerTable.getCommunityCards();

        // End hand (BB folds on flop)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Start second hand - button has moved
        pokerTable.startHand();

        // Complete preflop (button is now seat 1, so seat 1 is SB and acts first)
        vm.prank(operator2);  // seat 1 is now SB
        vm.roll(block.number + 1);
        pokerTable.call(1);

        vm.prank(operator1);  // seat 0 is now BB
        vm.roll(block.number + 1);
        pokerTable.check(0);

        mockVRF.fulfillLastRequest(specificRandomness);

        uint8[5] memory cards2 = pokerTable.getCommunityCards();

        // Same randomness should produce same cards
        assertEq(cards1[0], cards2[0], "Same randomness = same flop card 1");
        assertEq(cards1[1], cards2[1], "Same randomness = same flop card 2");
        assertEq(cards1[2], cards2[2], "Same randomness = same flop card 3");
    }

    // ============ Settlement Tests (T-0105) ============

    function test_Settlement_FoldTransfersPotToWinner() public {
        _setupBothSeats();
        pokerTable.startHand();

        // After startHand: seat0 (SB) has stack = BUY_IN - SB, seat1 (BB) has stack = BUY_IN - BB
        // Pot = SB + BB
        uint256 stackAfterBlinds0 = pokerTable.getSeat(0).stack;
        uint256 stackAfterBlinds1 = pokerTable.getSeat(1).stack;
        assertEq(stackAfterBlinds0, BUY_IN - SMALL_BLIND, "SB posted blind");
        assertEq(stackAfterBlinds1, BUY_IN - BIG_BLIND, "BB posted blind");

        // SB (seat 0) folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Verify winner (seat 1) received the pot
        uint256 finalStack1 = pokerTable.getSeat(1).stack;
        uint256 expectedPot = SMALL_BLIND + BIG_BLIND;
        // Winner had (BUY_IN - BB) and receives full pot
        assertEq(finalStack1, BUY_IN - BIG_BLIND + expectedPot, "Winner receives pot");

        // Verify loser's stack unchanged after fold (already lost blind)
        uint256 finalStack0 = pokerTable.getSeat(0).stack;
        assertEq(finalStack0, BUY_IN - SMALL_BLIND, "Loser stack after fold");
    }

    function test_Settlement_FoldEmitsCorrectEvent() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.prank(operator1);
        vm.roll(block.number + 1);

        // Expect HandSettled with correct parameters
        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 1, SMALL_BLIND + BIG_BLIND);

        pokerTable.fold(0);
    }

    function test_Settlement_ShowdownDistributesPot() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Play to showdown with some raises
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 100); // SB raises to 100

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1); // BB calls 100

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Check through remaining streets
        _checkBothPlayers();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        _checkBothPlayers();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        _checkBothPlayers();

        // At showdown
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        uint256 stackBefore = pokerTable.getSeat(0).stack;

        // Settle - seat 0 wins
        pokerTable.settleShowdown(0);

        // Pot was 200 (100 from each player)
        uint256 stackAfter = pokerTable.getSeat(0).stack;
        assertEq(stackAfter, stackBefore + 200, "Winner receives full pot");
    }

    function test_Settlement_ShowdownEmitsEvent() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Quick path to showdown
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        _completeFlopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        _checkBothPlayers();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        _checkBothPlayers();

        // Expect HandSettled event
        vm.expectEmit(true, false, false, true);
        emit HandSettled(1, 1, BIG_BLIND * 2);

        pokerTable.settleShowdown(1);
    }

    function test_Settlement_PotAccumulatesFromRaises() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Multiple raises
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.raise(0, 60); // SB raises to 60

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 120); // BB re-raises to 120

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0); // SB calls 120 - betting round complete, VRF requested

        // Pot should be 240 (120 * 2), state should be WAITING_VRF_FLOP
        (, uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, 240, "Pot accumulates from raises");
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        // Fulfill VRF to go to flop
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // BB folds on flop (BB acts first post-flop)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Winner gets full pot
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        assertEq(seat0.stack, BUY_IN - 120 + 240, "Winner receives accumulated pot");
    }

    function test_Settlement_ButtonMovesAfterHand() public {
        _setupBothSeats();
        assertEq(pokerTable.buttonSeat(), 0, "Initial button at seat 0");

        pokerTable.startHand();

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(pokerTable.buttonSeat(), 1, "Button moves to seat 1 after hand");

        // Start another hand and fold
        pokerTable.startHand();

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        assertEq(pokerTable.buttonSeat(), 0, "Button moves back to seat 0");
    }

    function test_Settlement_StateTransitionsToSettled() public {
        _setupBothSeats();
        pokerTable.startHand();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
    }

    function test_Settlement_CanStartNewHandAfterSettlement() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Can start a new hand
        pokerTable.startHand();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
        assertEq(pokerTable.currentHandId(), 2, "Hand ID increments");
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
    event HoleCommitSubmitted(uint256 indexed handId, uint8 indexed seatIndex, bytes32 commitment);
    event HoleCardsRevealed(uint256 indexed handId, uint8 indexed seatIndex, uint8 card1, uint8 card2);

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
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

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

    // ============ One Action Per Block Tests (T-0103) ============

    function test_OneActionPerBlock_SecondActionReverts() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Advance one block so first action can proceed
        vm.roll(block.number + 1);

        // First action (SB calls) - should succeed
        vm.prank(operator1);
        pokerTable.call(0);

        // Second action in SAME block - should revert
        // Note: turn passes to BB (seat 1) after call
        vm.prank(operator2);
        vm.expectRevert("One action per block");
        pokerTable.check(1);
    }

    function test_OneActionPerBlock_FoldThenActionReverts() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Start a second hand to test fold scenario
        // First complete a hand
        vm.roll(block.number + 1);
        vm.prank(operator1);
        pokerTable.fold(0);

        // Start second hand (button moves to seat 1)
        pokerTable.startHand();

        // Advance one block
        vm.roll(block.number + 1);

        // Seat 1 is now SB, folds
        vm.prank(operator2);
        pokerTable.fold(1);

        // Game is settled, start another hand
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // Now test: first action succeeds
        vm.prank(operator1);
        pokerTable.call(0);

        // Second action in same block reverts (even after call when BB should act)
        vm.prank(operator2);
        vm.expectRevert("One action per block");
        pokerTable.check(1);
    }

    function test_OneActionPerBlock_RaiseThenActionReverts() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // SB raises
        vm.prank(operator1);
        pokerTable.raise(0, 60);

        // BB tries to respond in same block - should revert
        vm.prank(operator2);
        vm.expectRevert("One action per block");
        pokerTable.call(1);
    }

    function test_OneActionPerBlock_SucceedsAfterBlockAdvance() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // First action succeeds
        vm.prank(operator1);
        pokerTable.call(0);

        // Advance block
        vm.roll(block.number + 1);

        // Second action now succeeds
        vm.prank(operator2);
        pokerTable.check(1);

        // Should have completed betting round
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_OneActionPerBlock_ForceTimeoutRespects() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.roll(block.number + 1);

        // SB calls
        vm.prank(operator1);
        pokerTable.call(0);

        // Advance time past deadline
        vm.warp(block.timestamp + 31 minutes);

        // Same block - forceTimeout should also respect one-action-per-block
        vm.expectRevert("One action per block");
        pokerTable.forceTimeout();

        // Advance block
        vm.roll(block.number + 1);

        // Now forceTimeout succeeds
        pokerTable.forceTimeout();
    }

    function test_OneActionPerBlock_StartHandSetsLastActionBlock() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Without advancing block, action should fail
        vm.prank(operator1);
        vm.expectRevert("One action per block");
        pokerTable.call(0);
    }

    // ============ Hole Card Commit/Reveal Tests (T-0204) ============

    function test_SubmitHoleCommit_Success() public {
        _setupBothSeats();
        pokerTable.startHand();

        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(25), bytes32("salt123")));

        vm.expectEmit(true, true, false, true);
        emit HoleCommitSubmitted(1, 0, commitment);

        pokerTable.submitHoleCommit(1, 0, commitment);

        assertEq(pokerTable.holeCommits(1, 0), commitment);
    }

    function test_SubmitHoleCommit_BothSeats() public {
        _setupBothSeats();
        pokerTable.startHand();

        bytes32 commit0 = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(25), bytes32("salt0")));
        bytes32 commit1 = keccak256(abi.encodePacked(uint256(1), uint8(1), uint8(30), uint8(40), bytes32("salt1")));

        pokerTable.submitHoleCommit(1, 0, commit0);
        pokerTable.submitHoleCommit(1, 1, commit1);

        assertEq(pokerTable.holeCommits(1, 0), commit0);
        assertEq(pokerTable.holeCommits(1, 1), commit1);
    }

    function test_SubmitHoleCommit_RevertIfAlreadySubmitted() public {
        _setupBothSeats();
        pokerTable.startHand();

        bytes32 commitment = keccak256("test");
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Commitment already exists");
        pokerTable.submitHoleCommit(1, 0, keccak256("another"));
    }

    function test_SubmitHoleCommit_RevertIfEmptyCommitment() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.expectRevert("Empty commitment");
        pokerTable.submitHoleCommit(1, 0, bytes32(0));
    }

    function test_SubmitHoleCommit_RevertIfInvalidSeat() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.expectRevert("Invalid seat");
        pokerTable.submitHoleCommit(1, 2, keccak256("test"));
    }

    function test_SubmitHoleCommit_RevertIfInvalidHandId() public {
        _setupBothSeats();
        pokerTable.startHand();

        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(0, 0, keccak256("test"));

        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(2, 0, keccak256("test")); // hand 2 doesn't exist yet
    }

    function test_SubmitHoleCommit_RevertIfGameNotStarted() public {
        _setupBothSeats();
        // Don't start hand - state is WAITING_FOR_SEATS
        // Actually after setupBothSeats we're still in WAITING_FOR_SEATS

        // Hand ID 0 is invalid, and hand 1 doesn't exist yet
        vm.expectRevert("Invalid hand ID");
        pokerTable.submitHoleCommit(1, 0, keccak256("test"));
    }

    function test_RevealHoleCards_Success() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Play to showdown
        _playToShowdown();

        // Submit commitment
        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("test-salt-12345678901234567890");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Reveal should succeed
        vm.expectEmit(true, true, false, true);
        emit HoleCardsRevealed(1, 0, card1, card2);

        pokerTable.revealHoleCards(1, 0, card1, card2, salt);

        assertTrue(pokerTable.isHoleCardsRevealed(1, 0));

        (uint8 revealedCard1, uint8 revealedCard2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(revealedCard1, card1);
        assertEq(revealedCard2, card2);
    }

    function test_RevealHoleCards_RevertWithWrongCards() public {
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Try to reveal with wrong cards
        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, 11, 25, salt); // wrong card1

        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, 10, 26, salt); // wrong card2
    }

    function test_RevealHoleCards_RevertWithWrongSalt() public {
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("correct-salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Try to reveal with wrong salt
        vm.expectRevert("Invalid reveal");
        pokerTable.revealHoleCards(1, 0, card1, card2, bytes32("wrong-salt"));
    }

    function test_RevealHoleCards_RevertIfNoCommitment() public {
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        // Try to reveal without commitment
        vm.expectRevert("No commitment found");
        pokerTable.revealHoleCards(1, 0, 10, 25, bytes32("salt"));
    }

    function test_RevealHoleCards_RevertIfAlreadyRevealed() public {
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        pokerTable.revealHoleCards(1, 0, card1, card2, salt);

        // Try to reveal again
        vm.expectRevert("Already revealed");
        pokerTable.revealHoleCards(1, 0, card1, card2, salt);
    }

    function test_RevealHoleCards_RevertIfNotAtShowdown() public {
        _setupBothSeats();
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
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(52), uint8(25), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Card value 52 is invalid (must be 0-51)
        vm.expectRevert("Invalid card value");
        pokerTable.revealHoleCards(1, 0, 52, 25, salt);
    }

    function test_RevealHoleCards_RevertIfDuplicateCards() public {
        _setupBothSeats();
        pokerTable.startHand();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(10), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Same card twice is invalid
        vm.expectRevert("Duplicate cards");
        pokerTable.revealHoleCards(1, 0, 10, 10, salt);
    }

    function test_GetRevealedHoleCards_ReturnsUnrevealedDefault() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Without revealing, should return (255, 255)
        (uint8 card1, uint8 card2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(card1, 255);
        assertEq(card2, 255);
    }

    function test_RevealHoleCards_CanRevealAfterSettlement() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Submit commitment
        uint8 card1 = 10;
        uint8 card2 = 25;
        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), card1, card2, salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        // Fold to settle hand
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // State should be SETTLED
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Can still reveal after settlement
        pokerTable.revealHoleCards(1, 0, card1, card2, salt);

        assertTrue(pokerTable.isHoleCardsRevealed(1, 0));
    }

    function test_FullShowdownWithReveal() public {
        _setupBothSeats();
        pokerTable.startHand();

        // Submit commitments for both seats
        uint8 s0_card1 = 10;
        uint8 s0_card2 = 25;
        bytes32 s0_salt = bytes32("salt-seat-0");
        bytes32 s0_commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), s0_card1, s0_card2, s0_salt));
        pokerTable.submitHoleCommit(1, 0, s0_commitment);

        uint8 s1_card1 = 30;
        uint8 s1_card2 = 45;
        bytes32 s1_salt = bytes32("salt-seat-1");
        bytes32 s1_commitment = keccak256(abi.encodePacked(uint256(1), uint8(1), s1_card1, s1_card2, s1_salt));
        pokerTable.submitHoleCommit(1, 1, s1_commitment);

        // Play to showdown
        _playToShowdown();

        // Reveal both seats
        pokerTable.revealHoleCards(1, 0, s0_card1, s0_card2, s0_salt);
        pokerTable.revealHoleCards(1, 1, s1_card1, s1_card2, s1_salt);

        // Verify both revealed
        assertTrue(pokerTable.isHoleCardsRevealed(1, 0));
        assertTrue(pokerTable.isHoleCardsRevealed(1, 1));

        // Settle showdown
        pokerTable.settleShowdown(0);

        // Verify cards are accessible after settlement
        (uint8 r0c1, uint8 r0c2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(r0c1, s0_card1);
        assertEq(r0c2, s0_card2);

        (uint8 r1c1, uint8 r1c2) = pokerTable.getRevealedHoleCards(1, 1);
        assertEq(r1c1, s1_card1);
        assertEq(r1c2, s1_card2);
    }

    // ============ Helper Functions ============

    function _setupBothSeats() internal {
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);
        pokerTable.registerSeat(1, owner2, operator2, BUY_IN);
    }

    function _completePreflop() internal {
        // SB calls, BB checks
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);
    }

    function _completeFlopBetting() internal {
        // BB checks, SB checks
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);
    }

    function _checkBothPlayers() internal {
        // Get current actor and check both in correct order
        (,,, uint8 actor,) = pokerTable.getHandInfo();

        if (actor == 1) {
            vm.prank(operator2);
            vm.roll(block.number + 1);
            pokerTable.check(1);

            vm.prank(operator1);
            vm.roll(block.number + 1);
            pokerTable.check(0);
        } else {
            vm.prank(operator1);
            vm.roll(block.number + 1);
            pokerTable.check(0);

            vm.prank(operator2);
            vm.roll(block.number + 1);
            pokerTable.check(1);
        }
    }

    function _playToShowdown() internal {
        // Pre-flop: SB calls, BB checks
        _completePreflop();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        // Flop: both check
        _completeFlopBetting();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);

        // Turn: both check
        _checkBothPlayers();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        // River: both check -> Showdown
        _checkBothPlayers();

        // Should now be at showdown
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));
    }
}
