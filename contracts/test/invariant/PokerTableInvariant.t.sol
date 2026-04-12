// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {PokerTable} from "../../src/PokerTable.sol";
import {PokerTableBase} from "../../src/table/PokerTableBase.sol";
import {ChipToken} from "../../src/ChipToken.sol";
import {MockVRFAdapter} from "../mocks/MockVRFAdapter.sol";

/**
 * @title PokerTable Invariant Handler
 * @notice Generates random seat/action sequences for the Foundry invariant fuzzer.
 *
 * Chip conservation law:
 *   chipToken.balanceOf(table) == sum(seats[i].stack) + currentHand.pot
 *
 * Every chip that enters via registerSeat is either in a seat stack or in the
 * current pot. Betting moves chips from stack → pot; settlement moves pot → stack;
 * leaveSeat transfers stack out. No chips are created or destroyed.
 */
contract PokerTableHandler is Test {
    PokerTable public table;
    ChipToken public chipToken;
    MockVRFAdapter public vrf;

    address[2] public owners;
    address[2] public operators;

    uint256 constant BUY_IN     = 1_000;
    uint256 constant BIG_BLIND  = 20;
    uint256 constant TOP_UP_AMT = 200;

    constructor(PokerTable _table, ChipToken _chip, MockVRFAdapter _vrf) {
        table     = _table;
        chipToken = _chip;
        vrf       = _vrf;

        for (uint8 i = 0; i < 2; i++) {
            owners[i]    = address(uint160(0x1000 + i));
            operators[i] = address(uint160(0x2000 + i));
            // Minting is done by the test contract (ChipToken owner); see setUp()
        }
    }

    // ── Seat management ──────────────────────────────────────────────────────

    function h_registerSeat(uint8 seed) external {
        uint8 idx = seed % 2;
        (address own,,,,,,) = table.seats(idx);
        if (own != address(0)) return; // already occupied
        address owner = owners[idx];
        // Only re-register if the owner still has chips (minted once in setUp)
        if (chipToken.balanceOf(owner) < BUY_IN) return;
        vm.startPrank(owner);
        chipToken.approve(address(table), BUY_IN);
        try table.registerSeat(idx, owner, operators[idx], BUY_IN) {} catch {}
        vm.stopPrank();
    }

    function h_leaveSeat(uint8 seed) external {
        uint8 idx = seed % 2;
        vm.prank(owners[idx]);
        try table.leaveSeat(idx, owners[idx]) {} catch {}
    }

    // ── Hand progression ─────────────────────────────────────────────────────

    function h_startHand() external {
        try table.startHand() {} catch { return; }
        // Fulfill hole card VRF immediately so the hand can progress
        uint256 reqId = vrf.lastRequestId();
        if (reqId != 0) {
            try vrf.fulfillRandomness(reqId, uint256(keccak256(abi.encode(reqId, block.timestamp)))) {} catch {}
        }
    }

    function h_fulfillVRF(uint256 randomSeed) external {
        uint256 reqId = vrf.lastRequestId();
        if (reqId == 0) return;
        try vrf.fulfillRandomness(reqId, uint256(keccak256(abi.encode(randomSeed)))) {} catch {}
    }

    // ── Betting actions ───────────────────────────────────────────────────────

    function h_fold(uint8 seed) external {
        uint8 idx = seed % 2;
        vm.prank(operators[idx]);
        try table.fold(idx) {} catch {}
    }

    function h_check(uint8 seed) external {
        uint8 idx = seed % 2;
        vm.prank(operators[idx]);
        try table.check(idx) {} catch {}
    }

    function h_call(uint8 seed) external {
        uint8 idx = seed % 2;
        vm.prank(operators[idx]);
        try table.call(idx) {} catch {}
    }

    function h_raise(uint8 seed, uint256 raiseAmount) external {
        uint8 idx = seed % 2;
        raiseAmount = bound(raiseAmount, BIG_BLIND, BUY_IN);
        vm.prank(operators[idx]);
        try table.raise(idx, raiseAmount) {} catch {}
    }

    function h_forceTimeout() external {
        try table.forceTimeout() {} catch {}
    }
}

/**
 * @title PokerTable Invariant Test Suite
 * @notice Verifies chip conservation and timing constraints across random action sequences.
 */
contract PokerTableInvariantTest is Test {
    PokerTable          public pokerTable;
    ChipToken           public chipToken;
    MockVRFAdapter      public vrf;
    PokerTableHandler   public handler;

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND   = 20;
    uint256 constant BUY_IN      = 1_000;

    function setUp() public {
        vrf       = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(vrf), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes, 2, address(this)
        );
        handler = new PokerTableHandler(pokerTable, chipToken, vrf);

        // Pre-register both seats so the table starts with chips in play.
        // Mint is called here (not in handler constructor) because ChipToken.mint
        // requires msg.sender == owner (the test contract).
        for (uint8 i = 0; i < 2; i++) {
            address owner = handler.owners(i);
            address op    = handler.operators(i);
            chipToken.mint(owner, BUY_IN * 1000);
            vm.startPrank(owner);
            chipToken.approve(address(pokerTable), BUY_IN);
            pokerTable.registerSeat(i, owner, op, BUY_IN);
            vm.stopPrank();
        }

        targetContract(address(handler));
    }

    // ── Invariants ────────────────────────────────────────────────────────────

    /**
     * @notice Chip conservation: every token held by the table contract is either
     *         sitting in a seat stack or counted in the current pot.
     *
     *   chipToken.balanceOf(table) == sum(seats[i].stack) + currentHand.pot
     */
    function invariant_chipConservation() public view {
        uint256 tableBalance = chipToken.balanceOf(address(pokerTable));
        uint256 stacksTotal  = _sumStacks();
        uint256 pot          = _pot();

        assertEq(
            tableBalance,
            stacksTotal + pot,
            "Chip conservation violated: balance != stacks + pot"
        );
    }

    /**
     * @notice lastActionBlock must never exceed the current block number.
     *         (It should equal the block in which the last action was taken.)
     */
    function invariant_actionBlockNotFuture() public view {
        assertLe(
            pokerTable.lastActionBlock(),
            block.number,
            "lastActionBlock is in the future"
        );
    }

    /**
     * @notice Once a hand is settled, the settled flag is permanent
     *         and the winner is recorded.
     */
    function invariant_settledHandHasWinner() public view {
        uint256 handId = pokerTable.currentHandId();
        if (handId == 0) return;
        // Check the most-recently completed hand (handId - 1 if current is new)
        if (handId > 1 && pokerTable.handSettledFlag(handId - 1)) {
            // Winner seat must be a valid seat index (< numSeats)
            assertLt(
                uint256(pokerTable.handWinner(handId - 1)),
                uint256(pokerTable.numSeats()),
                "Settled hand has invalid winner seat"
            );
        }
    }

    // ── Internal helpers ──────────────────────────────────────────────────────

    function _sumStacks() internal view returns (uint256 total) {
        uint8 n = pokerTable.numSeats();
        for (uint8 i = 0; i < n; i++) {
            (, , uint256 stack,,,,) = pokerTable.seats(i);
            total += stack;
        }
    }

    function _pot() internal view returns (uint256) {
        // Use getHandInfo() because the Hand struct contains a bool[9] fixed-size
        // array (hasActed), which prevents Solidity from generating an auto-getter.
        (, uint256 pot,,,) = pokerTable.getHandInfo();
        return pot;
    }
}
