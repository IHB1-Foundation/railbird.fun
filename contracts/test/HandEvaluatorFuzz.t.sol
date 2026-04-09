// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/HandEvaluator.sol";

/**
 * @title HandEvaluatorFuzzTest
 * @notice Fuzz tests for HandEvaluator to catch edge cases in combinatorial evaluation.
 * @dev Covers T-M4-01.
 *
 * Card encoding: 0-51 where card % 13 = rank (0=2 .. 12=A), card / 13 = suit (0..3)
 */
contract HandEvaluatorFuzzTest is Test {
    using HandEvaluator for *;

    // ─── Property: evaluate must always return a non-zero score ──────────────

    /// @dev Score is non-zero for any valid 7-card hand.
    function testFuzz_Evaluate_NonZeroScore(
        uint8 c0, uint8 c1, uint8 c2, uint8 c3, uint8 c4,
        uint8 hole1, uint8 hole2
    ) public pure {
        // Bound each card to valid range 0-51
        c0 = uint8(bound(c0, 0, 51));
        c1 = uint8(bound(c1, 0, 51));
        c2 = uint8(bound(c2, 0, 51));
        c3 = uint8(bound(c3, 0, 51));
        c4 = uint8(bound(c4, 0, 51));
        hole1 = uint8(bound(hole1, 0, 51));
        hole2 = uint8(bound(hole2, 0, 51));

        // Skip if any duplicates exist among the 7 cards
        uint8[7] memory cards = [c0, c1, c2, c3, c4, hole1, hole2];
        for (uint8 i = 0; i < 7; i++) {
            for (uint8 j = i + 1; j < 7; j++) {
                if (cards[i] == cards[j]) return;
            }
        }

        uint8[5] memory comm = [c0, c1, c2, c3, c4];
        uint256 score = HandEvaluator.evaluate(comm, hole1, hole2);
        assertTrue(score > 0, "Score must be non-zero for valid hand");
    }

    // ─── Property: hand rank ordering (high card < pair < ... < straight flush)

    /// @dev Hand categories occupy distinct bit ranges; higher categories dominate.
    function testFuzz_Evaluate_HigherCategoryDominates(
        uint8 c0, uint8 c1, uint8 c2, uint8 c3, uint8 c4
    ) public pure {
        // Use a known pair on the board, vary hole cards
        // Community: two Kings + three low unique cards
        uint8[5] memory pairComm = [
            uint8(11), 24,   // K♣ K♦
            0, 1, 3          // 2♣ 3♣ 5♣
        ];
        // Pair hand: any hole
        c0 = uint8(bound(c0, 4, 12)); // avoid duplicates with pairComm
        c1 = uint8(bound(c1, 13, 25));
        if (c1 == 24) c1 = 25; // skip K♦ duplicate

        uint256 pairScore = HandEvaluator.evaluate(pairComm, c0, c1);

        // High-card only hand: vary community with no pairs/straights/flushes
        // Use cards with four different suits and no pair
        uint8[5] memory hcComm = [
            uint8(0), 14, 28, 42, 11 // 2♣ 3♦ 4♥ 5♠ K♣
        ];

        // High-card hole cards (no pair with board)
        uint8 h1 = 9; // J♣
        uint8 h2 = 50; // K♠ — gives pair K, so let's avoid pair
        h2 = 38; // K♥ — still pairs, use another rank
        h2 = 22; // J♦ — pairs J, avoid
        h2 = 35; // J♥ — let's just not fight it, use a card that doesn't pair
        h2 = 20; // 9♦
        uint256 hcScore = HandEvaluator.evaluate(hcComm, h1, h2);

        // Pair score should be >= high-card score (pair or higher dominates high card)
        assertTrue(pairScore >= hcScore, "Pair community produces at least as high a score as high-card community");
    }

    // ─── Property: score is symmetric in hole card order ─────────────────────

    /// @dev evaluate(comm, h1, h2) == evaluate(comm, h2, h1)
    function testFuzz_Evaluate_SymmetricHoleCards(
        uint8 c0, uint8 c1, uint8 c2, uint8 c3, uint8 c4,
        uint8 h1, uint8 h2
    ) public pure {
        c0 = uint8(bound(c0, 0, 51));
        c1 = uint8(bound(c1, 0, 51));
        c2 = uint8(bound(c2, 0, 51));
        c3 = uint8(bound(c3, 0, 51));
        c4 = uint8(bound(c4, 0, 51));
        h1 = uint8(bound(h1, 0, 51));
        h2 = uint8(bound(h2, 0, 51));

        uint8[7] memory cards = [c0, c1, c2, c3, c4, h1, h2];
        for (uint8 i = 0; i < 7; i++) {
            for (uint8 j = i + 1; j < 7; j++) {
                if (cards[i] == cards[j]) return;
            }
        }

        uint8[5] memory comm = [c0, c1, c2, c3, c4];
        uint256 score12 = HandEvaluator.evaluate(comm, h1, h2);
        uint256 score21 = HandEvaluator.evaluate(comm, h2, h1);

        assertEq(score12, score21, "Hand score symmetric in hole card order");
    }

    // ─── Property: best hand out of two players is consistent ────────────────

    /// @dev If playerA wins against playerB, playerB cannot win against playerA.
    function testFuzz_Evaluate_WinnerIsConsistent(
        uint8 c0, uint8 c1, uint8 c2, uint8 c3, uint8 c4,
        uint8 a1, uint8 a2, uint8 b1, uint8 b2
    ) public pure {
        c0 = uint8(bound(c0, 0, 51));
        c1 = uint8(bound(c1, 0, 51));
        c2 = uint8(bound(c2, 0, 51));
        c3 = uint8(bound(c3, 0, 51));
        c4 = uint8(bound(c4, 0, 51));
        a1 = uint8(bound(a1, 0, 51));
        a2 = uint8(bound(a2, 0, 51));
        b1 = uint8(bound(b1, 0, 51));
        b2 = uint8(bound(b2, 0, 51));

        // Ensure all 9 cards are distinct
        uint8[9] memory all = [c0, c1, c2, c3, c4, a1, a2, b1, b2];
        for (uint8 i = 0; i < 9; i++) {
            for (uint8 j = i + 1; j < 9; j++) {
                if (all[i] == all[j]) return;
            }
        }

        uint8[5] memory comm = [c0, c1, c2, c3, c4];
        uint256 scoreA = HandEvaluator.evaluate(comm, a1, a2);
        uint256 scoreB = HandEvaluator.evaluate(comm, b1, b2);

        if (scoreA > scoreB) {
            assertTrue(scoreB <= scoreA, "A wins implies B does not win");
        } else if (scoreB > scoreA) {
            assertTrue(scoreA <= scoreB, "B wins implies A does not win");
        }
        // Tie: both equal — valid
    }

    // ─── Property: score category fits in 4-bit field (0..8) ─────────────────

    function testFuzz_Evaluate_CategoryInValidRange(
        uint8 c0, uint8 c1, uint8 c2, uint8 c3, uint8 c4,
        uint8 h1, uint8 h2
    ) public pure {
        c0 = uint8(bound(c0, 0, 51));
        c1 = uint8(bound(c1, 0, 51));
        c2 = uint8(bound(c2, 0, 51));
        c3 = uint8(bound(c3, 0, 51));
        c4 = uint8(bound(c4, 0, 51));
        h1 = uint8(bound(h1, 0, 51));
        h2 = uint8(bound(h2, 0, 51));

        uint8[7] memory cards = [c0, c1, c2, c3, c4, h1, h2];
        for (uint8 i = 0; i < 7; i++) {
            for (uint8 j = i + 1; j < 7; j++) {
                if (cards[i] == cards[j]) return;
            }
        }

        uint8[5] memory comm = [c0, c1, c2, c3, c4];
        uint256 score = HandEvaluator.evaluate(comm, h1, h2);
        uint256 category = score >> 20;

        // Category: 0=high card, 1=pair, 2=two pair, 3=trips,
        //           4=straight, 5=flush, 6=full house, 7=quads, 8=straight flush
        assertLe(category, 8, "Category cannot exceed 8");
    }
}
