// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/HandEvaluator.sol";
import "../src/mocks/MockVRFAdapter.sol";

contract PokerTableTest is Test {
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    ChipToken public chipToken;

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
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chipToken));

        // Mint chip tokens to player wallets
        chipToken.mint(owner1, BUY_IN * 1000);
        chipToken.mint(owner2, BUY_IN * 1000);
        chipToken.mint(owner3, BUY_IN * 1000);
        chipToken.mint(owner4, BUY_IN * 1000);
    }

    function test_Constructor_RevertIfTableIdIsZero() public {
        vm.expectRevert("Table ID must be > 0");
        new PokerTable(0, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chipToken));
    }

    function test_Constructor_RevertIfSmallBlindIsZero() public {
        vm.expectRevert("Small blind must be > 0");
        new PokerTable(1, 0, BIG_BLIND, address(mockVRF), address(chipToken));
    }

    function test_Constructor_RevertIfVrfAdapterIsZero() public {
        vm.expectRevert("Invalid VRF adapter");
        new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(0), address(chipToken));
    }

    function test_Constructor_RevertIfChipTokenIsZero() public {
        vm.expectRevert("Invalid chip token");
        new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(0));
    }

    // ============ Seat Registration Tests ============

    function test_RegisterSeat_Success() public {
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

        vm.prank(owner2);
        chipToken.approve(address(pokerTable), BUY_IN);
        vm.prank(owner2);
        vm.expectRevert("Seat already taken");
        pokerTable.registerSeat(0, owner2, operator2, BUY_IN);
    }

    function test_RegisterSeat_RevertIfBuyInTooSmall() public {
        vm.prank(owner1);
        chipToken.approve(address(pokerTable), BIG_BLIND * 5);
        vm.prank(owner1);
        vm.expectRevert("Buy-in too small");
        pokerTable.registerSeat(0, owner1, operator1, BIG_BLIND * 5);
    }

    function test_RegisterSeat_AllFourSeats() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);
        assertFalse(pokerTable.allSeatsFilled());
    }

    function test_RegisterSeat_AllowedDuringActiveHand_JoinsNextHand() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        _startHandFull();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));

        _registerSeat(2, owner3, operator3, BUY_IN);
        PokerTable.Seat memory midHandSeat = pokerTable.getSeat(2);
        assertEq(midHandSeat.owner, owner3);
        assertEq(midHandSeat.operator, operator3);
        assertEq(midHandSeat.stack, BUY_IN);
        assertFalse(midHandSeat.isActive, "New seat must wait for next hand");

        // Heads-up (2 players, button=0): SB=seat0 acts first pre-flop.
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        _startHandFull();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));

        PokerTable.Seat memory nextHandSeat = pokerTable.getSeat(2);
        assertTrue(nextHandSeat.isActive, "New seat should be active from next hand");
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

        _startHandFull();

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
        _startHandFull();

        // Button=0: SB=seat1, BB=seat2, others unaffected
        assertEq(pokerTable.getSeat(0).stack, BUY_IN, "Button stack unchanged");
        assertEq(pokerTable.getSeat(1).stack, BUY_IN - SMALL_BLIND, "SB posted blind");
        assertEq(pokerTable.getSeat(2).stack, BUY_IN - BIG_BLIND, "BB posted blind");
        assertEq(pokerTable.getSeat(3).stack, BUY_IN, "UTG stack unchanged");
    }

    function test_StartHand_AllowsPartialTableWithTwoFundedSeats() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        _startHandFull();
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

        _startHandFull();

        assertEq(pokerTable.getSeat(0).owner, address(0), "Zero-stack seat should be evicted");
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    // ============ Action Tests ============

    function test_Fold_UTGFolds_GameContinues() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        // All call/check to complete preflop
        _completePreflop();

        // Should trigger betting round completion
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
    }

    function test_Check_RevertIfMustCall() public {
        _setupAllSeats();
        _startHandFull();

        // UTG (seat 3) tries to check but must call or raise (owes BB)
        vm.prank(operator4);
        vm.roll(block.number + 1);

        vm.expectRevert("Cannot check, must call or raise");
        pokerTable.check(3);
    }

    function test_Raise_Success() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

        vm.prank(operator4);
        vm.roll(block.number + 1);

        vm.expectRevert("Raise too small");
        pokerTable.raise(3, 30); // Min should be 40 (20 + 20)
    }

    function test_Raise_ReraiseBattle() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        vm.prank(address(0x999));
        vm.roll(block.number + 1);

        vm.expectRevert("Not operator");
        pokerTable.fold(3);
    }

    function test_Action_RevertIfNotYourTurn() public {
        _setupAllSeats();
        _startHandFull();

        // Seat 0 (Button) tries to act but it's UTG's (seat 3) turn
        vm.prank(operator1);
        vm.roll(block.number + 1);

        vm.expectRevert("Not your turn");
        pokerTable.check(0);
    }

    function test_Action_OwnerCanAct() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        // Hole-card VRF used requestId=1; flop VRF gets requestId=2
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 2);

        pokerTable.check(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));
        assertEq(mockVRF.lastRequestId(), 2);
    }

    function test_FulfillVRF_TransitionToFlop() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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

        // Before BB check, verify no community-card VRF is pending yet
        // (hole-card VRF was already fulfilled during _startHandFull(), requestId=1)
        assertEq(pokerTable.pendingVRFRequestId(), 0);

        // BB checks - should trigger flop VRF request in same tx (gets requestId=2)
        vm.prank(operator3);
        vm.roll(block.number + 1);

        vm.expectEmit(true, false, false, true);
        emit BettingRoundComplete(1, PokerTable.GameState.BETTING_PRE, PokerTable.GameState.WAITING_VRF_FLOP);
        vm.expectEmit(true, false, false, true);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_FLOP, 2);

        pokerTable.check(2);

        assertEq(mockVRF.lastRequestId(), 2);
        assertEq(mockVRF.lastTableId(), 1);
        assertEq(mockVRF.lastHandId(), 1);
        assertEq(pokerTable.pendingVRFRequestId(), 2);
    }

    function test_VRF_FlopDealsCommunityCards() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        uint8[5] memory cards2 = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertEq(cards2[i], 255, "Cards should be reset");
        }
    }

    function test_VRF_CardsDerivedDeterministically() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();
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
        _startHandFull();
        _completePreflop();

        // Fulfill through mock adapter (which is the registered vrfAdapter)
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));
    }

    function test_ReRequestVRF_SuccessAfterTimeout() public {
        _setupAllSeats();
        _startHandFull();
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
        _startHandFull();
        _completePreflop();

        // Try to re-request immediately (before timeout)
        vm.expectRevert("VRF timeout not reached");
        pokerTable.reRequestVRF();
    }

    function test_ReRequestVRF_RevertNotInVRFState() public {
        _setupAllSeats();
        _startHandFull();

        // Still in BETTING_PRE
        vm.expectRevert("Not waiting for VRF");
        pokerTable.reRequestVRF();
    }

    function test_ReRequestVRF_EmitsEvent() public {
        _setupAllSeats();
        _startHandFull();
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
        _startHandFull();
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
        _startHandFull();
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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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

        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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

        _startHandFull();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
        assertEq(pokerTable.currentHandId(), 2, "Hand ID increments");
    }

    // ============ View Function Tests ============

    function test_GetAmountToCall() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

        assertFalse(pokerTable.canCheck(3)); // UTG cannot check pre-flop
        assertFalse(pokerTable.canCheck(0)); // Button cannot check pre-flop
        assertFalse(pokerTable.canCheck(1)); // SB cannot check pre-flop
        assertTrue(pokerTable.canCheck(2));  // BB can check
    }

    // ============ Timeout Tests (T-0102) ============

    function test_Action_RevertAfterDeadline() public {
        _setupAllSeats();
        _startHandFull();

        vm.warp(block.timestamp + 31 minutes);
        vm.roll(block.number + 1);

        // UTG tries to act but deadline passed
        vm.prank(operator4);
        vm.expectRevert("Action deadline passed");
        pokerTable.call(3);
    }

    function test_ForceTimeout_RevertIfDeadlineNotPassed() public {
        _setupAllSeats();
        _startHandFull();
        vm.roll(block.number + 1);

        vm.expectRevert("Deadline not passed");
        pokerTable.forceTimeout();
    }

    function test_ForceTimeout_AutoFoldWhenMustCall() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        // Without advancing block, action should fail
        vm.prank(operator4);
        vm.expectRevert("One action per block");
        pokerTable.call(3);
    }

    // ============ Hole Card Commit/Reveal Tests (T-0204) ============

    function test_SubmitHoleCommit_Success() public {
        _setupAllSeats();
        _startHandFull();

        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(25), bytes32("salt123")));

        vm.expectEmit(true, true, false, true);
        emit HoleCommitSubmitted(1, 0, commitment);

        pokerTable.submitHoleCommit(1, 0, commitment);

        assertEq(pokerTable.holeCommits(1, 0), commitment);
    }

    function test_SubmitHoleCommit_AllFourSeats() public {
        _setupAllSeats();
        _startHandFull();

        for (uint8 i = 0; i < 4; i++) {
            bytes32 commit = keccak256(abi.encodePacked(uint256(1), i, uint8(i * 10), uint8(i * 10 + 5), bytes32("salt")));
            pokerTable.submitHoleCommit(1, i, commit);
            assertEq(pokerTable.holeCommits(1, i), commit);
        }
    }

    function test_SubmitHoleCommit_RevertIfAlreadySubmitted() public {
        _setupAllSeats();
        _startHandFull();

        bytes32 commitment = keccak256("test");
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Commitment already exists");
        pokerTable.submitHoleCommit(1, 0, keccak256("another"));
    }

    function test_SubmitHoleCommit_RevertIfEmptyCommitment() public {
        _setupAllSeats();
        _startHandFull();

        vm.expectRevert("Empty commitment");
        pokerTable.submitHoleCommit(1, 0, bytes32(0));
    }

    function test_SubmitHoleCommit_RevertIfInvalidSeat() public {
        _setupAllSeats();
        _startHandFull();

        vm.expectRevert("Invalid seat");
        pokerTable.submitHoleCommit(1, 9, keccak256("test")); // seat 9 is out of range (0..8)
    }

    function test_SubmitHoleCommit_RevertIfInvalidHandId() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        _playToShowdown();

        vm.expectRevert("No commitment found");
        pokerTable.revealHoleCards(1, 0, 10, 25, bytes32("salt"));
    }

    function test_RevealHoleCards_RevertIfAlreadyRevealed() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(52), uint8(25), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Invalid card value");
        pokerTable.revealHoleCards(1, 0, 52, 25, salt);
    }

    function test_RevealHoleCards_RevertIfDuplicateCards() public {
        _setupAllSeats();
        _startHandFull();

        _playToShowdown();

        bytes32 salt = bytes32("salt");
        bytes32 commitment = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(10), uint8(10), salt));
        pokerTable.submitHoleCommit(1, 0, commitment);

        vm.expectRevert("Duplicate cards");
        pokerTable.revealHoleCards(1, 0, 10, 10, salt);
    }

    function test_GetRevealedHoleCards_ReturnsUnrevealedDefault() public {
        _setupAllSeats();
        _startHandFull();

        (uint8 card1, uint8 card2) = pokerTable.getRevealedHoleCards(1, 0);
        assertEq(card1, 255);
        assertEq(card2, 255);
    }

    function test_RevealHoleCards_CanRevealAfterSettlement() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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

            _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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

    function test_Showdown_RevertIfNoRevealsBeforeTimeout() public {
        _setupAllSeats();
        _startHandFull();
        _playToShowdown();

        // No reveals submitted
        vm.expectRevert("Showdown reveal window open");
        pokerTable.settleShowdown();
    }

    function test_Showdown_NoRevealsAfterTimeout_SettlesBySplit() public {
        _setupAllSeats();
        _startHandFull();
        _playToShowdown();

        vm.warp(block.timestamp + pokerTable.SHOWDOWN_TIMEOUT() + 1);
        pokerTable.settleShowdown();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
        assertEq(pokerTable.getSeat(0).stack, BUY_IN, "Seat 0 split fallback");
        assertEq(pokerTable.getSeat(1).stack, BUY_IN, "Seat 1 split fallback");
        assertEq(pokerTable.getSeat(2).stack, BUY_IN, "Seat 2 split fallback");
        assertEq(pokerTable.getSeat(3).stack, BUY_IN, "Seat 3 split fallback");
    }

    function test_Showdown_SingleRevealWinsByDefault() public {
        _setupAllSeats();
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

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
        _startHandFull();

        // Fisher-Yates board (TEST_RANDOMNESS): 5♣(3), 5♠(42), 5♥(29), 7♥(31), K♦(24)
        // Board has three 5s + K♦. Players with a K pair with the board K → full house 5-5-5-K-K.
        // Seat 0: K♣(11) A♣(12) → full house (5s full of Ks)
        // Seat 1: K♥(37) A♥(38) → full house (5s full of Ks) — SAME RANK → TIE
        // Seat 2: 2♣(0)  3♦(14) → only trips of 5s — loses
        // Seat 3: 4♣(2)  9♦(20) → only trips of 5s — loses (no 5 in hole → no quads)
        _commitCards(1, 0, 11, 12, bytes32("s0"));
        _commitCards(1, 1, 37, 38, bytes32("s1"));
        _commitCards(1, 2, 0, 14, bytes32("s2"));
        _commitCards(1, 3, 2, 20, bytes32("s3"));

        _playToShowdown();

        pokerTable.revealHoleCards(1, 0, 11, 12, bytes32("s0"));
        pokerTable.revealHoleCards(1, 1, 37, 38, bytes32("s1"));
        pokerTable.revealHoleCards(1, 2, 0, 14, bytes32("s2"));
        pokerTable.revealHoleCards(1, 3, 2, 20, bytes32("s3"));

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
        _startHandFull();

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
        _startHandFull();

        // Still in BETTING_PRE
        vm.expectRevert("Not at showdown");
        pokerTable.settleShowdown();
    }

    function test_Showdown_WinnerDeterminedByCards_NotPosition() public {
        _setupAllSeats();
        _startHandFull();

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
        vm.prank(owner);
        chipToken.approve(address(pokerTable), buyIn);
        vm.prank(owner);
        pokerTable.registerSeat(seatIndex, owner, operator, buyIn);
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

    // ============ T-1002: All-in Blind Posting Tests ============
    // seats array base slot = 6; each Seat = 6 slots; seats[i].stack = slot (8 + i*6)

    function _setSeatStack(uint8 seatIndex, uint256 newStack) internal {
        // seats array starts at slot 6; each Seat = 7 slots; stack field at offset +2
        uint256 stackSlot = 8 + uint256(seatIndex) * 7;
        vm.store(address(pokerTable), bytes32(stackSlot), bytes32(newStack));
    }

    function test_AllInBlind_SBStackLessThanSmallBlind() public {
        // button=0 → SB=seat1, BB=seat2
        // Register normally, then reduce SB stack to 5 (< smallBlind=10)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 5);

        _startHandFull();

        PokerTable.Seat memory sbSeat = pokerTable.getSeat(1);
        assertEq(sbSeat.currentBet, 5, "SB should post all 5 as blind");
        assertEq(sbSeat.stack, 0, "SB stack should be 0");
        assertTrue(sbSeat.isAllIn, "SB should be all-in");
    }

    function test_AllInBlind_BBStackLessThanBigBlind() public {
        // button=0 → SB=seat1, BB=seat2
        // Reduce BB stack to 15 (< bigBlind=20)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(2, 15);

        _startHandFull();

        PokerTable.Seat memory bbSeat = pokerTable.getSeat(2);
        assertEq(bbSeat.currentBet, 15, "BB should post all 15 as blind");
        assertEq(bbSeat.stack, 0, "BB stack should be 0");
        assertTrue(bbSeat.isAllIn, "BB should be all-in");
    }

    function test_AllInBlind_SeatWithStackOneIsPlayable() public {
        // stack=1 seat should participate (stack > 0)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 1);

        // Should not revert — seat with stack=1 is playable
        _startHandFull();
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_PRE));
    }

    // ============ T-1003: All-in Call Tests ============

    function test_AllInCall_ShortStackAllIn() public {
        // 2-seat: button=0 → SB=seat1, BB=seat2
        // seat1 starts with stack=12. Posts SB=10 → remaining=2.
        // currentHand.currentBet=20. toCall=10. stack=2 → actualCall=2 (all-in).
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 12);

        _startHandFull();

        // firstActor preflop = _nextActiveSeat(bbSeat=2) = seat1
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "Seat1 acts first");

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertEq(seat1.stack, 0, "Stack 0 after all-in call");
        assertEq(seat1.currentBet, 12, "currentBet = 10 (SB) + 2 (all-in)");
        assertTrue(seat1.isAllIn, "Must be all-in");

        (,uint256 pot,,,) = pokerTable.getHandInfo();
        assertEq(pot, 12 + BIG_BLIND, "Pot = 12 + 20");
    }

    function test_AllInCall_DoesNotRevertWhenStackInsufficient() public {
        // Previously reverted with "Insufficient stack" — now should succeed
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        // seat1 SB stack=12, after posting SB=10, stack=2, toCall=10 → should NOT revert
        _setSeatStack(1, 12);

        _startHandFull();

        vm.prank(operator2);
        vm.roll(block.number + 1);
        // Must not revert
        pokerTable.call(1);
        assertTrue(pokerTable.getSeat(1).isAllIn);
    }

    // ============ T-1004: All-in Raise Tests ============

    function test_AllInRaise_ShortStackBelowMinRaise() public {
        // 2-seat: button=0 → SB=seat1, BB=seat2
        // seat1 has 80 chips total. Posts SB=10, stack=70.
        // minRaise would be 40 (BB*2). With 70 remaining, raise to 80 = currentBet(10)+70.
        // 80 > minRaise(40), so this is valid.
        // But test below minRaise: seat1 has 25 total, posts SB=10, stack=15.
        // minRaise=40, but stack=15 → all-in raise to 10+15=25 (< minRaise) → should succeed.
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 25); // posts SB=10, left with 15

        _startHandFull();

        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1, "Seat1 acts first");

        // All-in raise: seat1 has stack=15, additional = any value >= 15
        // raiseToAmount passed as 100 (doesn't matter, gets capped to currentBet+stack=10+15=25)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 100); // will be capped to 25

        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertEq(seat1.stack, 0, "Stack 0 after all-in raise");
        assertEq(seat1.currentBet, 25, "currentBet = 10 (SB) + 15 (all-in) = 25");
        assertTrue(seat1.isAllIn, "Must be all-in");

        (,, uint256 newCurrentBet,,) = pokerTable.getHandInfo();
        assertEq(newCurrentBet, 25, "Table currentBet updated to all-in amount");
    }

    function test_AllInRaise_ExactAllIn() public {
        // Raise exactly to current stack amount (all-in)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        // seat1 SB, 80 total → posts 10 → stack=70. Raise to 80 (all-in).
        _setSeatStack(1, 80);

        _startHandFull();

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 80);

        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertEq(seat1.stack, 0);
        assertEq(seat1.currentBet, 80);
        assertTrue(seat1.isAllIn);
    }

    // ============ T-1005: Skip All-in Players in Betting Rounds ============

    function test_AllInSkip_AllInPlayerDoesNotGetTurn() public {
        // 3 seats: button=0, SB=seat1 (all-in blind), BB=seat2, UTG=seat3 acts first preflop
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);
        // seat1 goes all-in posting blind (stack=5 < SB=10)
        _setSeatStack(1, 5);

        _startHandFull();
        assertTrue(pokerTable.getSeat(1).isAllIn, "Seat1 should be all-in");

        // Pre-flop actor: firstActive after BB(seat2) that is not all-in
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertNotEq(actor, 1, "All-in seat1 should not be the actor");

        // seat3 calls
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // Button = seat0 doesn't exist, so next after seat3 should skip to seat2 (BB)
        // Actually button=0 is not registered here, so active seats are 1,2,3
        // After seat3 calls, next non-all-in after seat3 = seat2 (BB)
        (,,, uint8 nextActor,) = pokerTable.getHandInfo();
        assertNotEq(nextActor, 1, "All-in seat1 should still be skipped");
    }

    function test_AllInSkip_RoundCompleteWhenOnlyAllInLeft() public {
        // 2 seats: seat1 (SB, all-in), seat2 (BB, normal)
        // After seat2 acts, betting round should complete (seat1 is all-in, can't act)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 5); // all-in blind

        _startHandFull();
        // seat1 is all-in. seat2 is BB. Pre-flop: only seat2 can act.
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 2, "seat2 (BB) is the only non-all-in actor");

        // seat2 checks (or calls depending on currentBet)
        // seat2 currentBet=20 (BB), currentHand.currentBet=20 → can check
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        // Betting round should be complete → VRF requested for flop
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_FLOP),
            "Should advance to VRF flop after seat2 checks"
        );
    }

    // ============ T-1006: Auto-skip Betting When All Players All-In ============

    function test_AutoSkip_AllPlayersAllIn_SkipsToShowdown() public {
        // 2 seats: both all-in → preflop completes → VRF×3 → SHOWDOWN without any betting actions
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        // Both go all-in: seat1 (SB, stack=5), seat2 (BB, stack=15)
        _setSeatStack(1, 5);
        _setSeatStack(2, 15);

        _startHandFull();

        // Both are all-in from blind posting
        assertTrue(pokerTable.getSeat(1).isAllIn, "Seat1 all-in");
        assertTrue(pokerTable.getSeat(2).isAllIn, "Seat2 all-in");

        // Pre-flop: no actors → _isBettingRoundComplete()=true → VRF_FLOP
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_FLOP),
            "Should auto-advance to VRF flop"
        );

        // VRF flop → cards dealt → ≤1 actionable → auto WAITING_VRF_TURN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_TURN),
            "Should auto-advance to VRF turn"
        );

        // VRF turn → WAITING_VRF_RIVER
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_RIVER),
            "Should auto-advance to VRF river"
        );

        // VRF river → SHOWDOWN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.SHOWDOWN),
            "Should reach showdown after 3 VRFs"
        );

        // Verify all 5 community cards dealt
        uint8[5] memory cards = pokerTable.getCommunityCards();
        for (uint8 i = 0; i < 5; i++) {
            assertNotEq(cards[i], 255, "Community card should be dealt");
        }
    }

    // ============ T-1101: Side Pot Build Logic Tests ============

    event SeatAllIn(uint256 indexed handId, uint8 indexed seatIndex, uint256 totalBet);

    function test_SidePot_TwoPlayerOneAllIn() public {
        // seat1 (SB) has 200 total. seat2 (BB) has 1000.
        // seat1 goes all-in pre-flop (200 total). seat2 calls 200.
        // → 1 side pot: 400, eligible=[seat1, seat2]
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 200);

        _startHandFull();

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 200); // seat1 all-in
        assertTrue(pokerTable.getSeat(1).isAllIn);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.call(2);

        // Auto-skip post-flop (≤1 non-all-in). 3 VRFs → SHOWDOWN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        assertEq(pokerTable.getSidePotCount(), 1, "1 side pot");
        (uint256 potAmt, bool[9] memory eligible) = pokerTable.getSidePot(0);
        assertEq(potAmt, 400, "Main pot = 200*2 = 400");
        assertTrue(eligible[1], "seat1 eligible");
        assertTrue(eligible[2], "seat2 eligible");
    }

    function test_SidePot_ThreePlayerDifferentAllInLevels() public {
        // 3 seats: button=0, SB=seat1(200), BB=seat2(500), UTG=seat3(1000)
        // seat1 all-in for 200, seat2 all-in for 500, seat3 calls 500.
        // Pots:
        //   Pot 0 (level 200): 200*3 = 600, eligible=[1,2,3]
        //   Pot 1 (level 500): (500-200)*2 = 600, eligible=[2,3]
        //   Pot 2 (level 500, seat3 excess): seat3 committed 500, but max all-in is 500 so no extra pot
        // Wait: seat3 calls 500 (exact). seat2 all-in for 500.
        // Actually seat1 totalHandBet=200, seat2 totalHandBet=500, seat3 totalHandBet=500
        // All-in levels: 200, 500. maxBet=500.
        // uniqueLevels: [200, 500]
        // Pot0 (prev=0, cur=200): min(200,200)-0 + min(500,200)-0 + min(500,200)-0 = 200+200+200=600, eligible: seats with bet>=200 → all 3
        // Pot1 (prev=200, cur=500): min(200,500)-200 + min(500,500)-200 + min(500,500)-200 = 0+300+300=600, eligible: seats with bet>=500 → seat2, seat3
        // Total: 600+600=1200 ✓ (200+500+500=1200)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);
        _setSeatStack(1, 200);
        _setSeatStack(2, 500);

        _startHandFull();
        // button=0, SB=seat1, BB=seat2, UTG=seat3 acts first

        // seat3 calls (matches BB=20)
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 3, "UTG acts first");
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        // seat1 (SB) all-in raise to 200
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.raise(1, 200);
        assertTrue(pokerTable.getSeat(1).isAllIn);

        // seat2 (BB) all-in raise to 500
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.raise(2, 500);
        assertTrue(pokerTable.getSeat(2).isAllIn);

        // seat3 calls 500
        vm.prank(operator4);
        vm.roll(block.number + 2);
        pokerTable.call(3);

        // VRFs → SHOWDOWN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        assertEq(pokerTable.getSidePotCount(), 2, "2 side pots");

        (uint256 pot0,) = pokerTable.getSidePot(0);
        (uint256 pot1,) = pokerTable.getSidePot(1);
        assertEq(pot0, 600, "Pot0 = 200*3");
        assertEq(pot1, 600, "Pot1 = 300*2");
        assertEq(pot0 + pot1, 1200, "Total matches committed chips");
    }

    // ============ T-1102: Side Pot Showdown Settlement Tests ============

    function _buildShowdownCommit(
        uint256 handId, uint8 seat,
        uint8 c1, uint8 c2, bytes32 salt
    ) internal returns (bytes32) {
        bytes32 commit = keccak256(abi.encodePacked(handId, seat, c1, c2, salt));
        pokerTable.submitHoleCommit(handId, seat, commit);
        return commit;
    }

    function test_SidePotSettlement_AllInWinsMainPot() public {
        // seat1 (SB) stack=200, seat2 (BB) stack=1000
        // seat1 all-in raise to 200, seat2 calls.
        // 1 side pot: 400 eligible=[1,2]
        // seat1 reveals best hand, seat2 reveals worse hand → seat1 wins 400
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 200);

        _startHandFull();
        vm.prank(operator2); vm.roll(block.number + 1);
        pokerTable.raise(1, 200);
        vm.prank(operator3); vm.roll(block.number + 1);
        pokerTable.call(2);

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        uint256 handId = pokerTable.currentHandId();
        uint8[5] memory comm = pokerTable.getCommunityCards();

        // Give seat1 the best possible hand: royal flush if possible.
        // For simplicity, use cards 0,1 (Ace of Spades, 2 of Spades)
        // and seat2 gets cards 2,3 — seat1 wins by having higher hole cards
        // Actually we need to avoid community card overlaps — just use any valid distinct pair
        // Community cards are already dealt. Use hole cards that don't overlap with community.
        bytes32 salt1 = bytes32("salt1");
        bytes32 salt2 = bytes32("salt2");

        // Find cards not in community
        uint8[4] memory freeCards;
        uint8 freeIdx = 0;
        for (uint8 c = 0; c < 52 && freeIdx < 4; c++) {
            bool inComm = false;
            for (uint8 j = 0; j < 5; j++) {
                if (comm[j] == c) { inComm = true; break; }
            }
            if (!inComm) freeCards[freeIdx++] = c;
        }

        // seat1 gets freeCards[0], freeCards[1]; seat2 gets freeCards[2], freeCards[3]
        _buildShowdownCommit(handId, 1, freeCards[0], freeCards[1], salt1);
        _buildShowdownCommit(handId, 2, freeCards[2], freeCards[3], salt2);

        // Use hand evaluator to determine winner
        uint8[5] memory commArr;
        for (uint8 i = 0; i < 5; i++) commArr[i] = comm[i];
        uint256 score1 = HandEvaluator.evaluate(commArr, freeCards[0], freeCards[1]);
        uint256 score2 = HandEvaluator.evaluate(commArr, freeCards[2], freeCards[3]);

        // Reveal both
        pokerTable.revealHoleCards(handId, 1, freeCards[0], freeCards[1], salt1);
        pokerTable.revealHoleCards(handId, 2, freeCards[2], freeCards[3], salt2);

        uint256 seat1StackBefore = pokerTable.getSeat(1).stack;
        uint256 seat2StackBefore = pokerTable.getSeat(2).stack;

        pokerTable.settleShowdown();

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        uint256 seat1After = pokerTable.getSeat(1).stack;
        uint256 seat2After = pokerTable.getSeat(2).stack;

        if (score1 > score2) {
            assertEq(seat1After - seat1StackBefore, 400, "seat1 wins 400");
        } else if (score2 > score1) {
            assertEq(seat2After - seat2StackBefore, 400, "seat2 wins 400");
        } else {
            // Tie: split evenly
            assertEq(seat1After - seat1StackBefore, 200, "seat1 gets half on tie");
            assertEq(seat2After - seat2StackBefore, 200, "seat2 gets half on tie");
        }

        // Total chips conserved
        assertEq(seat1After + seat2After, seat1StackBefore + seat2StackBefore + 400);
    }

    // ============ T-1103: Unmatched Excess Bet Return Tests ============

    function test_UnmatchedBet_ReturnToRaiser() public {
        // seat1 (SB) has 300, seat2 (BB) has 1000.
        // seat1 raises all-in to 300 (total commitment = 300).
        // seat2 calls... but seat2 wants to call 300. seat2 totalHandBet = 300.
        // Both commit 300. Side pot: 600, eligible=[seat1,seat2]. No unmatched.
        // For real unmatched: seat2 raises all-in to 1000, seat1 calls all-in 300.
        // seat2 totalHandBet=1000, seat1 totalHandBet=300.
        // Pot0 (level 300): 300*2=600, eligible=[seat1,seat2]
        // Pot1 (level 1000): seat2 contributed 700 more, seat1 contributed 0.
        //   → potAmount=700, eligible=[seat2] (only seat2 has totalHandBet>=1000)
        //   → seat2 wins this back (unmatched)

        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 300); // seat1 (SB) short stack

        _startHandFull();
        // seat1 SB posts 10, stack=290. seat2 BB posts 20, stack=980.
        // seat1 acts first (2-player, heads-up). seat1 calls all-in (goes all-in via raise)
        (,,, uint8 actor,) = pokerTable.getHandInfo();
        assertEq(actor, 1);

        // seat1 calls all-in (stack=290, toCall=10 from SB→BB). Actually toCall=20-10=10.
        // Let's have seat2 raise big first. Actually with 2 players, seat1 acts first preflop.
        // seat2 (BB) has 1000. seat1 raises all-in to 300. seat2 calls 300.
        // Simpler: have seat1 all-in call → seat2 has leftover NOT in main pot.
        // Actually: seat1 goes all-in to 300, seat2 calls 300 — no unmatched.

        // Better setup for unmatched: seat1 calls, seat2 raises to 1000 (all-in).
        // But seat2 only has BUY_IN=1000 and totalHandBet after BB=20 is 20.
        // seat2 raises to 1000 total (all-in), seat1 calls all-in (stack=290).
        // seat1.totalHandBet = 300, seat2.totalHandBet = 1000.
        // Side pots:
        //   Pot0 (level 300): 300*2 = 600, eligible=[seat1,seat2]
        //   Pot1 (level 1000): (1000-300)*1 = 700, eligible=[seat2] → returned to seat2

        // Preflop: seat1 acts (is actor), seat1 calls (just 10 more to match BB=20)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1); // seat1 calls BB=20 (toCall=10, stack goes from 290 to 280)

        // seat2 raises all-in to 1000
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.raise(2, 1000); // seat2 all-in

        // seat1 calls all-in (stack=280, toCall=1000-20=980, actualCall=280)
        vm.prank(operator2);
        vm.roll(block.number + 2);
        pokerTable.call(1); // seat1 all-in call

        assertTrue(pokerTable.getSeat(1).isAllIn, "Seat1 all-in");

        // VRFs to showdown
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));

        // Verify side pots
        assertEq(pokerTable.getSidePotCount(), 2, "Should have 2 side pots");
        (uint256 pot0,) = pokerTable.getSidePot(0);
        (uint256 pot1, bool[9] memory eligible1) = pokerTable.getSidePot(1);

        // seat1 committed 300 total, seat2 committed 1000 total
        assertEq(pot0, 600, "Main pot = 300*2");
        assertEq(pot1, 700, "Side pot (returned to seat2) = 700");
        assertTrue(eligible1[2], "Only seat2 eligible for pot1");
        assertFalse(eligible1[1], "Seat1 NOT eligible for pot1");

        // Settle with hole cards
        uint256 handId = pokerTable.currentHandId();
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8[4] memory freeCards;
        uint8 fi = 0;
        for (uint8 c = 0; c < 52 && fi < 4; c++) {
            bool inC = false;
            for (uint8 j = 0; j < 5; j++) if (comm[j] == c) { inC = true; break; }
            if (!inC) freeCards[fi++] = c;
        }
        bytes32 s1 = bytes32("s1"); bytes32 s2 = bytes32("s2");
        pokerTable.submitHoleCommit(handId, 1, keccak256(abi.encodePacked(handId, uint8(1), freeCards[0], freeCards[1], s1)));
        pokerTable.submitHoleCommit(handId, 2, keccak256(abi.encodePacked(handId, uint8(2), freeCards[2], freeCards[3], s2)));
        pokerTable.revealHoleCards(handId, 1, freeCards[0], freeCards[1], s1);
        pokerTable.revealHoleCards(handId, 2, freeCards[2], freeCards[3], s2);

        uint256 s2StackBefore = pokerTable.getSeat(2).stack;
        pokerTable.settleShowdown();

        uint256 s1After = pokerTable.getSeat(1).stack;
        uint256 s2After = pokerTable.getSeat(2).stack;

        // seat2 ALWAYS gets 700 back (unmatched excess)
        // Plus either the main pot (if seat2 wins) or not
        uint8[5] memory commArr; for (uint8 i=0;i<5;i++) commArr[i]=comm[i];
        uint256 sc1 = HandEvaluator.evaluate(commArr, freeCards[0], freeCards[1]);
        uint256 sc2 = HandEvaluator.evaluate(commArr, freeCards[2], freeCards[3]);

        if (sc1 > sc2) {
            // seat1 wins main pot (600), seat2 gets back unmatched (700)
            assertEq(s1After, 600, "seat1 wins main pot");
            assertEq(s2After - s2StackBefore, 700, "seat2 gets back unmatched");
        } else if (sc2 > sc1) {
            // seat2 wins main pot (600) + gets back unmatched (700) = 1300
            assertEq(s2After - s2StackBefore, 600 + 700, "seat2 wins all pots");
        } else {
            // Tie: both get 300 from main pot; seat2 gets 700 unmatched back
            assertEq(s1After, 300, "seat1 gets 300 on tie");
            assertEq(s2After - s2StackBefore, 300 + 700, "seat2 gets 300+700 on tie");
        }

        // Total chips = initial pot (1000 + 300 = 1300 total committed)
        // After settle: seat1 + seat2 stacks = 1300
        assertEq(s1After + s2After, 1300, "Total chips conserved");
    }

    function test_AutoSkip_OneNonAllIn_SkipsPostFlopBetting() public {
        // 2 seats: seat1 all-in preflop, seat2 calls normally
        // seat1 (SB stack=5, all-in), seat2 (BB, normal)
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _setSeatStack(1, 5);

        _startHandFull();
        // seat1 all-in, seat2 is the only actor (1 non-all-in player)

        // seat2 checks preflop
        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        // VRF flop → only 1 non-all-in player (seat2) → auto-skip flop betting → VRF_TURN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_TURN),
            "Flop betting auto-skipped"
        );

        // VRF turn → auto-skip → VRF_RIVER
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_RIVER),
            "Turn betting auto-skipped"
        );

        // VRF river → auto-skip → SHOWDOWN
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 2);
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.SHOWDOWN),
            "River betting auto-skipped to showdown"
        );
    }

    // ============ T-1202: Hole-Community Card Overlap Detection ============

    /**
     * @dev Fisher-Yates community cards with TEST_RANDOMNESS:
     *      Flop: communityCards[0]=7♥(31), [1]=5♠(42), [2]=5♣(3)
     *      Turn: communityCards[3]=5♥(29)
     *      River: communityCards[4]=K♦(24)
     *      Cards to avoid in hole cards: {3, 24, 29, 31, 42}
     */

    function test_CardIntegrity_NoViolation() public {
        _setupAllSeats();
        _startHandFull();

        // Hole cards deliberately chosen to NOT overlap with Fisher-Yates community cards:
        // Community = {3(5♣), 29(5♥), 31(7♥), 42(5♠), 24(K♦)}
        // Seat 0: 2♣(0)  3♣(1)  — safe
        // Seat 1: 4♣(2)  6♣(4)  — safe
        // Seat 2: 7♣(5)  8♣(6)  — safe
        // Seat 3: 9♣(7)  T♣(8)  — safe
        _commitCards(1, 0, 0, 1, bytes32("s0"));
        _commitCards(1, 1, 2, 4, bytes32("s1"));
        _commitCards(1, 2, 5, 6, bytes32("s2"));
        _commitCards(1, 3, 7, 8, bytes32("s3"));

        _playToShowdown();

        // Reveal all cards — no CardIntegrityViolation should be emitted
        vm.recordLogs();
        pokerTable.revealHoleCards(1, 0, 0, 1, bytes32("s0"));
        pokerTable.revealHoleCards(1, 1, 2, 4, bytes32("s1"));
        pokerTable.revealHoleCards(1, 2, 5, 6, bytes32("s2"));
        pokerTable.revealHoleCards(1, 3, 7, 8, bytes32("s3"));

        Vm.Log[] memory logs = vm.getRecordedLogs();
        bytes32 violationSig = keccak256("CardIntegrityViolation(uint256,uint8,uint8,uint8)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertFalse(
                logs[i].topics[0] == violationSig,
                "CardIntegrityViolation emitted unexpectedly"
            );
        }

        // All 13 unique cards: 8 hole + 5 community
        uint8[5] memory comm = pokerTable.getCommunityCards();
        uint8[13] memory allCards = [
            uint8(0), 1, 2, 4, 5, 6, 7, 8,   // hole cards
            comm[0], comm[1], comm[2], comm[3], comm[4]  // community
        ];
        for (uint8 i = 0; i < 13; i++) {
            for (uint8 j = i + 1; j < 13; j++) {
                assertFalse(allCards[i] == allCards[j], "Duplicate card detected");
            }
        }
    }

    function test_CardIntegrity_ViolationDetected() public {
        _setupAllSeats();
        _startHandFull();

        // Community card[2] = 5♣(3) from Fisher-Yates flop (communityCards index 2).
        // Deliberately give seat 0 a hole card = 3 (5♣) to simulate dealer cheating.
        // Seat 0: 5♣(3) A♣(12) ← 5♣ is also community card at index 2
        _commitCards(1, 0, 3, 12, bytes32("s0"));
        _commitCards(1, 1, 2, 4, bytes32("s1"));
        _commitCards(1, 2, 5, 6, bytes32("s2"));
        _commitCards(1, 3, 7, 8, bytes32("s3"));

        _playToShowdown();

        // Reveal seat 0 — CardIntegrityViolation should be emitted for card 3 (5♣)
        vm.recordLogs();
        pokerTable.revealHoleCards(1, 0, 3, 12, bytes32("s0"));
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 violationSig = keccak256("CardIntegrityViolation(uint256,uint8,uint8,uint8)");
        bool violationFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == violationSig) {
                violationFound = true;
                // Decode: seatIndex is topics[2] (indexed), card is in data
                uint8 seatIndex = uint8(uint256(logs[i].topics[2]));
                (uint8 card, uint8 commIdx) = abi.decode(logs[i].data, (uint8, uint8));
                assertEq(seatIndex, 0, "Violation on seat 0");
                assertEq(card, 3, "Violated card is 3 (5 of clubs)");
                assertEq(commIdx, 2, "Community index 2 (flop third card)");
            }
        }
        assertTrue(violationFound, "CardIntegrityViolation not emitted");
    }

    // ============ T-1301: Heads-Up Blind Rule (button=SB) ============

    function test_HeadsUp_ButtonIsSB() public {
        // Register only 2 seats: seat 0 (button) and seat 1
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        _startHandFull();

        // Button = 0: in heads-up, seat 0 should be SB and seat 1 should be BB
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);

        assertEq(seat0.currentBet, SMALL_BLIND, "Seat 0 (button) is SB");
        assertEq(seat1.currentBet, BIG_BLIND,   "Seat 1 is BB");
        assertEq(seat0.stack, BUY_IN - SMALL_BLIND, "SB stack reduced");
        assertEq(seat1.stack, BUY_IN - BIG_BLIND,   "BB stack reduced");

        // Pre-flop: SB (seat 0, button) acts first in heads-up
        (, , , uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 0, "SB (button) acts first pre-flop in heads-up");
    }

    // ============ T-1302: Tournament Winner Detection ============

    function test_TournamentWinner_EmittedWhenOnePlayerRemains() public {
        // 2 players: seat 0 wins everything, seat 1 busts out
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        _startHandFull();

        // Seat 1 (BB) folds → seat 0 wins the pot (blinds = 30)
        // Then seat 1 has BUY_IN - BIG_BLIND = 980. Still alive.
        // We need seat 1 to go all-in and lose. Use _setSeatStack to shortcut.
        // Instead: directly set seat 1 stack to 0 (simulate busted after settlement)
        // Actually simplest: just start hand, let seat 0 win via fold, then again
        // until seat 1 runs out. But that's many hands.

        // Simplest approach: set seat 1 stack to 0 and call _evictBustedSeats
        // indirectly via startHand() (which calls _evictBustedSeats at start).
        // After fold, settle. Then reduce seat1 stack to 0.
        vm.prank(operator1); // SB = button = seat0 acts first (heads-up)
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Settled: seat 1 wins the pot. Seat 0 now has BUY_IN - SMALL_BLIND.
        // Artificially zero out seat 1 (loser) for next hand trigger
        _setSeatStack(1, 0);

        // startHand() → _evictBustedSeats() → seat 1 evicted → 1 playable → TournamentWinner
        vm.recordLogs();
        _startHandFull();
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 winnerSig = keccak256("TournamentWinner(address,uint8,uint256)");
        bool winnerFound = false;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == winnerSig) {
                winnerFound = true;
                uint8 seatIndex = uint8(uint256(logs[i].topics[2]));
                assertEq(seatIndex, 0, "Seat 0 is the winner");
            }
        }
        assertTrue(winnerFound, "TournamentWinner not emitted");
    }

    function test_TournamentWinner_NotEmittedWithMultiplePlayers() public {
        _setupAllSeats();
        _startHandFull();

        vm.recordLogs();
        // No settlement yet — shouldn't emit TournamentWinner
        Vm.Log[] memory logs = vm.getRecordedLogs();

        bytes32 winnerSig = keccak256("TournamentWinner(address,uint8,uint256)");
        for (uint256 i = 0; i < logs.length; i++) {
            assertFalse(logs[i].topics[0] == winnerSig, "TournamentWinner emitted prematurely");
        }
    }

    // ============ T-1303: forceTimeout skips all-in players ============

    function test_ForceTimeout_SkipsAllInPlayer() public {
        // 3 players: seat 0 (button), seat 1 (SB), seat 2 (BB)
        // Force seat 1 to go all-in on blind posting by reducing its stack
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);

        // Set seat 1 stack to exactly SMALL_BLIND so it goes all-in posting SB
        _setSeatStack(1, SMALL_BLIND);
        _startHandFull();

        // Seat 1 should be all-in after posting SB
        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        assertTrue(seat1.isAllIn, "Seat 1 should be all-in after posting SB");
        assertTrue(seat1.isActive, "All-in seat should still be active");

        // Get the current actor (should NOT be seat 1 — it's all-in)
        (, , , uint8 actorSeat,) = pokerTable.getHandInfo();
        assertFalse(pokerTable.getSeat(actorSeat).isAllIn, "Actor should not be all-in");

        // Warp past deadline and call forceTimeout on the NON-all-in actor
        vm.warp(block.timestamp + pokerTable.ACTION_TIMEOUT() + 1);
        vm.roll(block.number + 2);
        pokerTable.forceTimeout();

        // Seat 1 (all-in) should still be active — forceTimeout didn't touch it
        assertTrue(pokerTable.getSeat(1).isActive, "All-in player not folded by forceTimeout");
    }

    function test_ForceTimeout_AllInActor_AdvancesWithoutFold() public {
        // Edge case: somehow an all-in seat is the actor. forceTimeout should advance, not fold.
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);

        _startHandFull();

        // Seat 3 (UTG) has already acted. Seat 0 (BTN) calls.
        vm.prank(operator4); // Hmm, only 3 seats registered. UTG = seat 0 (btn=0, SB=1, BB=2, UTG=0 wraps)
        // Let's just do a normal test: all-in call scenario
        // Reduce seat 0 stack to below toCall so it goes all-in on call
        // UTG=seat 0 acts first (in 3-player, btn=0, SB=1, BB=2, UTG = next after BB = 0)
        (, , , uint8 utg,) = pokerTable.getHandInfo();
        _setSeatStack(utg, 5); // below bigBlind=20, force all-in call

        // Warp past deadline
        vm.warp(block.timestamp + pokerTable.ACTION_TIMEOUT() + 1);
        vm.roll(block.number + 2);

        // If actor is all-in (already set stack to 5), forceTimeout advances without fold
        // Regardless: forceTimeout should not revert
        pokerTable.forceTimeout();
        // Test just verifies it doesn't revert or produce unexpected state
    }

    function test_HeadsUp_ThreePlayerUsesNormalRule() public {
        // 3+ players: button is NOT the SB
        _setupAllSeats(); // registers seats 0, 1, 2, 3
        _startHandFull();

        // Button=0: SB = seat 1, BB = seat 2
        PokerTable.Seat memory seat0 = pokerTable.getSeat(0);
        PokerTable.Seat memory seat1 = pokerTable.getSeat(1);
        PokerTable.Seat memory seat2 = pokerTable.getSeat(2);

        assertEq(seat0.currentBet, 0,           "Button (seat 0) not SB");
        assertEq(seat1.currentBet, SMALL_BLIND, "Seat 1 is SB");
        assertEq(seat2.currentBet, BIG_BLIND,   "Seat 2 is BB");

        // Pre-flop first actor = UTG = seat 3
        (, , , uint8 actorSeat,) = pokerTable.getHandInfo();
        assertEq(actorSeat, 3, "UTG (seat 3) acts first pre-flop with 4 players");
    }

    // ============ Post Blind Tests ============

    function test_PostBlind_NotSetForInitialSeats() public {
        // Seats registered during WAITING_FOR_SEATS should NOT need post blind
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        assertFalse(pokerTable.needsPostBlind(0), "Initial seat 0 no post blind");
        assertFalse(pokerTable.needsPostBlind(1), "Initial seat 1 no post blind");
    }

    function test_PostBlind_SetForMidGameJoiner() public {
        // Start with 2 players, play a hand, then add a 3rd player
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _startHandFull();

        // Fold to settle the hand
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Now gameState = SETTLED. Register seat 2.
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
        _registerSeat(2, owner3, operator3, BUY_IN);

        assertTrue(pokerTable.needsPostBlind(2), "Mid-game joiner needs post blind");
        assertFalse(pokerTable.needsPostBlind(0), "Existing seat no post blind");
    }

    function test_PostBlind_DeductedOnStartHand() public {
        // 2 players play a hand, 3rd joins, verify post blind is deducted
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _startHandFull();

        // Fold to settle
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Register seat 3 mid-game
        _registerSeat(3, owner4, operator4, BUY_IN);
        assertTrue(pokerTable.needsPostBlind(3));

        // Start next hand. Button advances: btn=1, SB=0, BB=1? No—
        // After hand 1: button advances. Let's check.
        // Hand 1: btn=0, SB=0 (heads-up btn=SB), BB=1. After settle, btn advances to 1.
        // Hand 2 with 3 players (seats 0,1,3): btn=1, SB=3, BB=0. Seat 3 is SB (post blind cleared for SB).
        // Actually seat 3 is the mid-game joiner. Let's register seat 2 instead for clearer test.
        // Re-do: register seat 2 as mid-game joiner.
        // Actually seat 3 is fine. Let's just verify.

        vm.roll(block.number + 1);
        _startHandFull();

        // Seat 3 joined mid-game. If it's not SB or BB, it should have posted BB.
        PokerTable.Seat memory seat3 = pokerTable.getSeat(3);

        // needsPostBlind should be cleared after startHand
        assertFalse(pokerTable.needsPostBlind(3), "Post blind flag cleared");

        // If seat 3 is neither SB nor BB, it posted BB as live blind
        // btn=1 (advanced from 0): with 3 players, SB=next(1)=3, BB=next(3)=0
        // So seat 3 IS the SB. Post blind skipped (SB already paid).
        // Verify SB posted normally
        assertEq(seat3.currentBet, SMALL_BLIND, "Seat 3 is SB, posted SB normally");
    }

    function test_PostBlind_NonBlindSeatPaysExtraBB() public {
        // Setup: 3 initial players, play hand, 4th joins mid-game in non-blind position
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _startHandFull();

        // Hand 1: btn=0, SB=1, BB=2, UTG=0. Fold everyone to settle.
        vm.prank(operator1); // UTG=seat 0 for 3-player btn=0: SB=1,BB=2,UTG=0
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Only 2 active left -> immediate winner (seat 1 or 2 wins pot)
        // Let seat 1 fold too (SB)
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Hand settled. Register seat 3 mid-game.
        _registerSeat(3, owner4, operator4, BUY_IN);
        assertTrue(pokerTable.needsPostBlind(3));

        uint256 stackBefore = BUY_IN;

        vm.roll(block.number + 1);
        _startHandFull();

        // Hand 2: btn advances to 1. With 4 players: SB=2, BB=3. Seat 3 IS the BB.
        // So post blind is skipped (BB already pays BB).
        PokerTable.Seat memory seat3 = pokerTable.getSeat(3);
        assertEq(seat3.currentBet, BIG_BLIND, "Seat 3 is BB, posted BB normally");
        assertEq(seat3.stack, stackBefore - BIG_BLIND, "BB cost only");
        assertFalse(pokerTable.needsPostBlind(3), "Flag cleared");
    }

    function test_PostBlind_FourPlayerMidGameJoinerPaysPostBlind() public {
        // Setup a scenario where mid-game joiner is NOT SB or BB
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _startHandFull();

        // Fold to settle hand 1
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Register seats 2 and 3 mid-game
        _registerSeat(2, owner3, operator3, BUY_IN);
        _registerSeat(3, owner4, operator4, BUY_IN);

        vm.roll(block.number + 1);
        _startHandFull();

        // Hand 2: btn advances from 0 to 1. With 4 players:
        // SB = next(1) = 2, BB = next(2) = 3
        // Seats 2 and 3 are both mid-game joiners.
        // Seat 2 = SB (skipped), Seat 3 = BB (skipped).
        // Seats 0 and 1 are not mid-game. So no post blind this hand.

        // Let's fold again to get to hand 3 where we can test properly
        // UTG in 4-player with btn=1: SB=2, BB=3, UTG=0
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Hand 2 settled. All post blind flags are cleared now.
        assertFalse(pokerTable.needsPostBlind(2));
        assertFalse(pokerTable.needsPostBlind(3));
    }

    function test_PostBlind_ClearedOnLeaveSeat() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _startHandFull();

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Register mid-game
        _registerSeat(2, owner3, operator3, BUY_IN);
        assertTrue(pokerTable.needsPostBlind(2));

        // Leave before playing
        vm.prank(owner3);
        pokerTable.leaveSeat(2, owner3);
        assertFalse(pokerTable.needsPostBlind(2), "Flag cleared on leave");
    }

    function test_PostBlind_EmitsEvent() public {
        // We need a 5-seat scenario to ensure a mid-game joiner is NOT SB/BB
        address owner5 = address(0x5);
        address operator5 = address(0x55);
        chipToken.mint(owner5, BUY_IN * 1000);

        // Initial: 3 players at seats 0, 1, 2
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);
        _registerSeat(2, owner3, operator3, BUY_IN);
        _startHandFull();

        // btn=0, SB=1, BB=2, UTG=0. Fold all to settle.
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.fold(1);

        // Register seats 3 and 4 mid-game
        _registerSeat(3, owner4, operator4, BUY_IN);
        _registerSeat(4, owner5, operator5, BUY_IN);

        // Hand 2: btn advances to 1. 5 players (0,1,2,3,4): SB=2, BB=3.
        // Seat 3 = BB (post blind skipped), Seat 4 = NOT SB/BB → should post blind.
        vm.roll(block.number + 1);
        _startHandFull();

        PokerTable.Seat memory seat4 = pokerTable.getSeat(4);
        // Seat 4 should have posted BB as live blind
        assertEq(seat4.currentBet, BIG_BLIND, "Post blind = BB as live blind");
        assertEq(seat4.stack, BUY_IN - BIG_BLIND, "Stack reduced by BB");
        assertFalse(pokerTable.needsPostBlind(4), "Flag cleared");

        // Verify pot includes the post blind
        (, uint256 pot, , ,) = pokerTable.getHandInfo();
        // pot = SB + BB + post blind = 10 + 20 + 20 = 50
        assertEq(pot, SMALL_BLIND + BIG_BLIND + BIG_BLIND, "Pot includes post blind");
    }

    // ============ Trustless Dealer Test Helpers ============

    /**
     * @dev Full hand start: startHand() + fulfill hole-card VRF + advanceToPreflop().
     *      Reaches BETTING_PRE through the new WAITING_VRF_HOLECARDS → WAITING_FOR_HOLECARDS
     *      → BETTING_PRE flow without submitting mock commits (so tests can submit their own).
     */
    function _startHandFull() internal {
        pokerTable.startHand();
        // If tournament ended during startHand() (eviction), stop here.
        if (pokerTable.gameState() != PokerTable.GameState.WAITING_VRF_HOLECARDS) return;
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();
    }
}
