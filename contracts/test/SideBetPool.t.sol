// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/SideBetPool.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "./mocks/MockVRFAdapter.sol";
import "../src/table/PokerTableBase.sol";

contract SideBetPoolTest is Test {
    SideBetPool public pool;
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    ChipToken public chipToken;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);

    address public bettor1 = address(0xA1);
    address public bettor2 = address(0xA2);
    address public bettor3 = address(0xA3);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant BUY_IN = 1000;
    uint256 constant TEST_RANDOMNESS = 123456789;

    // Fund bettors with ETH
    function setUp() public {
        mockVRF = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(mockVRF), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes, 2, address(this)
        );
        pool = new SideBetPool();

        // Fund players
        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);

        // Register seats
        vm.startPrank(owner1);
        chipToken.approve(address(pokerTable), BUY_IN);
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);
        vm.stopPrank();

        vm.startPrank(owner2);
        chipToken.approve(address(pokerTable), BUY_IN);
        pokerTable.registerSeat(1, owner2, operator2, BUY_IN);
        vm.stopPrank();

        // Fund bettors
        vm.deal(bettor1, 10 ether);
        vm.deal(bettor2, 10 ether);
        vm.deal(bettor3, 10 ether);
    }

    // ── Helpers ──────────────────────────────────────────────────────────────

    function _startHand() internal returns (uint256 handId) {
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        // Submit hole commits so we can advance
        bytes32 commit0 = keccak256(abi.encodePacked(uint256(1), uint8(0), uint8(1), uint8(2), bytes32(0)));
        bytes32 commit1 = keccak256(abi.encodePacked(uint256(1), uint8(1), uint8(3), uint8(4), bytes32(0)));
        pokerTable.submitHoleCommit(1, 0, commit0);
        pokerTable.submitHoleCommit(1, 1, commit1);
        pokerTable.advanceToPreflop();
        return pokerTable.currentHandId();
    }

    function _foldToSettle() internal {
        // operator1 folds immediately (preflop)
        vm.roll(block.number + 1);
        vm.prank(operator1);
        pokerTable.fold(0);
    }

    // ── Tests ─────────────────────────────────────────────────────────────────

    // T1: placeBet succeeds during active hand
    function test_PlaceBet_Success() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);

        SideBetPool.Pool memory p = pool.getPoolInfo(address(pokerTable), handId);
        assertEq(p.totalPool, 1 ether);
        assertEq(pool.seatTotals(keccak256(abi.encode(address(pokerTable), handId)), 0), 1 ether);
    }

    // T2: Multiple bettors, multiple seats
    function test_PlaceBet_MultipleUsers() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 2 ether}(address(pokerTable), handId, 0);

        vm.prank(bettor2);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 1);

        vm.prank(bettor3);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);

        SideBetPool.Pool memory p = pool.getPoolInfo(address(pokerTable), handId);
        assertEq(p.totalPool, 4 ether);
    }

    // T3: placeBet fails with zero value
    function test_PlaceBet_RevertZeroValue() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        vm.expectRevert("Bet amount must be > 0");
        pool.placeBet{value: 0}(address(pokerTable), handId, 0);
    }

    // T4: placeBet fails on already-settled pool
    function test_PlaceBet_RevertAlreadySettled() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);

        _foldToSettle();
        pool.settleBets(address(pokerTable), handId);

        vm.prank(bettor2);
        vm.expectRevert("Pool already settled");
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);
    }

    // T5: placeBet fails with invalid seat index
    function test_PlaceBet_RevertInvalidSeat() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        vm.expectRevert("Invalid seat index");
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 9); // 9 seats but table only has 2
    }

    // T6: settleBets fails before hand is settled
    function test_SettleBets_RevertHandNotSettled() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);

        vm.expectRevert("Hand not settled on-chain");
        pool.settleBets(address(pokerTable), handId);
    }

    // T7: settleBets succeeds after fold
    function test_SettleBets_AfterFold() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 1); // bet on seat 1 (will win)

        _foldToSettle(); // seat 0 folds, seat 1 wins

        pool.settleBets(address(pokerTable), handId);

        SideBetPool.Pool memory p = pool.getPoolInfo(address(pokerTable), handId);
        assertTrue(p.settled);
        assertEq(p.winnerSeat, 1);
    }

    // T8: claimWinnings correct proportional payout — 3 bettors, 2 on winning seat
    function test_ClaimWinnings_ProportionalPayout() public {
        uint256 handId = _startHand();

        // bettor1 bets 2 ETH on seat 1 (winner), bettor2 bets 1 ETH on seat 1, bettor3 bets 1 ETH on seat 0 (loser)
        vm.prank(bettor1);
        pool.placeBet{value: 2 ether}(address(pokerTable), handId, 1);
        vm.prank(bettor2);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 1);
        vm.prank(bettor3);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);

        _foldToSettle(); // seat 0 folds → seat 1 wins
        pool.settleBets(address(pokerTable), handId);

        uint256 b1Before = bettor1.balance;
        uint256 b2Before = bettor2.balance;

        vm.prank(bettor1);
        pool.claimWinnings(address(pokerTable), handId);

        vm.prank(bettor2);
        pool.claimWinnings(address(pokerTable), handId);

        // totalPool = 4 ETH, seatTotals[1] = 3 ETH
        // bettor1 payout = 2 ETH * 4 ETH / 3 ETH = 2.666... ETH
        // bettor2 payout = 1 ETH * 4 ETH / 3 ETH = 1.333... ETH
        uint256 b1After = bettor1.balance;
        uint256 b2After = bettor2.balance;

        assertGt(b1After, b1Before);
        assertGt(b2After, b2Before);
        // totalPool = 4 ETH, winnerTotal = 3 ETH
        // bettor1 (2 ETH on winner): payout = 2 * 4 / 3 = 2.666... ETH
        // bettor2 (1 ETH on winner): payout = 1 * 4 / 3 = 1.333... ETH
        // payout = bet * totalPool / winnerTotal (integer division)
        uint256 totalPool = 4 ether;
        uint256 winnerTotal = 3 ether;
        uint256 expectedB1 = (uint256(2 ether) * totalPool) / winnerTotal;
        uint256 expectedB2 = (uint256(1 ether) * totalPool) / winnerTotal;
        assertEq(b1After - b1Before, expectedB1);
        assertEq(b2After - b2Before, expectedB2);
    }

    // T9: claimWinnings fails for bettor on losing seat
    function test_ClaimWinnings_LoserGetsNothing() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 2 ether}(address(pokerTable), handId, 1); // bet on winner (seat 1)
        vm.prank(bettor3);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0); // seat 0 loses

        _foldToSettle(); // seat 0 folds, seat 1 wins
        pool.settleBets(address(pokerTable), handId);

        // Bettor3 bet on loser — no winnings
        vm.prank(bettor3);
        vm.expectRevert("No winnings to claim");
        pool.claimWinnings(address(pokerTable), handId);
    }

    // T10: claim after claim fails (no double-claim)
    function test_ClaimWinnings_NoDuplicateClaim() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 1);

        _foldToSettle();
        pool.settleBets(address(pokerTable), handId);

        vm.prank(bettor1);
        pool.claimWinnings(address(pokerTable), handId);

        // Second claim should fail
        vm.prank(bettor1);
        vm.expectRevert("No winnings to claim");
        pool.claimWinnings(address(pokerTable), handId);
    }

    // T11: settleBets fails on non-existent pool
    function test_SettleBets_RevertNoPool() public {
        vm.expectRevert("Pool does not exist");
        pool.settleBets(address(pokerTable), 999);
    }

    // T12: empty pool settle (no bets but hand settled)
    function test_SettleBets_EmptyPool() public {
        uint256 handId = _startHand();
        _foldToSettle();

        // Pool never created — should revert
        vm.expectRevert("Pool does not exist");
        pool.settleBets(address(pokerTable), handId);
    }

    // T13: getSeatOdds returns correct implied odds
    function test_GetSeatOdds() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);
        vm.prank(bettor2);
        pool.placeBet{value: 3 ether}(address(pokerTable), handId, 1);

        uint256[] memory odds = pool.getSeatOdds(address(pokerTable), handId);
        // totalPool = 4 ETH
        // seat 0: 4/1 = 40000 bps (4.0x)
        // seat 1: 4/3 = 13333 bps (1.333x)
        assertEq(odds[0], 40000);
        assertEq(odds[1], 13333);
    }

    // T14: getUserBets returns correct bet list
    function test_GetUserBets() public {
        uint256 handId = _startHand();

        vm.prank(bettor1);
        pool.placeBet{value: 1 ether}(address(pokerTable), handId, 0);
        vm.prank(bettor1);
        pool.placeBet{value: 2 ether}(address(pokerTable), handId, 1);

        SideBetPool.Bet[] memory bets = pool.getUserBets(address(pokerTable), handId, bettor1);
        assertEq(bets.length, 2);
        assertEq(bets[0].amount, 1 ether);
        assertEq(bets[0].seatIndex, 0);
        assertEq(bets[1].amount, 2 ether);
        assertEq(bets[1].seatIndex, 1);
    }

    // T15: hand winner is correctly recorded in PokerTable
    function test_HandWinnerRecordedInPokerTable() public {
        uint256 handId = _startHand();
        _foldToSettle();

        assertTrue(pokerTable.handSettledFlag(handId));
        uint8 winner = pokerTable.handWinner(handId);
        // Seat 0 folded, so seat 1 wins
        assertEq(winner, 1);
    }
}
