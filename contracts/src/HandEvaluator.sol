// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title HandEvaluator
 * @notice Evaluates poker hand strength from 7 cards (5 community + 2 hole).
 *         Returns a numeric score for comparison (higher = stronger hand).
 * @dev Card encoding: card_id in [0..51]
 *      rank = card_id % 13  →  0=2, 1=3, ..., 8=T, 9=J, 10=Q, 11=K, 12=A
 *      suit = card_id / 13  →  0..3
 *
 *      Score encoding (uint256):
 *        (handType << 20) | (k0 << 16) | (k1 << 12) | (k2 << 8) | (k3 << 4) | k4
 *
 *      Hand types: 0=HighCard, 1=Pair, 2=TwoPair, 3=Trips, 4=Straight,
 *                  5=Flush, 6=FullHouse, 7=Quads, 8=StraightFlush
 */
library HandEvaluator {
    uint256 internal constant HIGH_CARD      = 0;
    uint256 internal constant ONE_PAIR       = 1;
    uint256 internal constant TWO_PAIR       = 2;
    uint256 internal constant THREE_OF_KIND  = 3;
    uint256 internal constant STRAIGHT       = 4;
    uint256 internal constant FLUSH          = 5;
    uint256 internal constant FULL_HOUSE     = 6;
    uint256 internal constant FOUR_OF_KIND   = 7;
    uint256 internal constant STRAIGHT_FLUSH = 8;

    /**
     * @notice Evaluate the best 5-card hand from 5 community cards and 2 hole cards.
     * @param community 5 community cards (each 0-51)
     * @param hole1 First hole card (0-51)
     * @param hole2 Second hole card (0-51)
     * @return best The best hand score (higher = better)
     */
    function evaluate(
        uint8[5] memory community,
        uint8 hole1,
        uint8 hole2
    ) internal pure returns (uint256 best) {
        uint8[7] memory cards;
        cards[0] = hole1;
        cards[1] = hole2;
        for (uint8 i = 0; i < 5; i++) {
            cards[i + 2] = community[i];
        }

        // Try all C(7,2) = 21 ways to exclude 2 cards
        for (uint8 ex1 = 0; ex1 < 7; ex1++) {
            for (uint8 ex2 = ex1 + 1; ex2 < 7; ex2++) {
                uint8[5] memory hand;
                uint8 idx;
                for (uint8 k = 0; k < 7; k++) {
                    if (k != ex1 && k != ex2) {
                        hand[idx++] = cards[k];
                    }
                }
                uint256 s = _scoreFive(hand);
                if (s > best) best = s;
            }
        }
    }

    /**
     * @notice Score a single 5-card poker hand.
     * @dev Split into phases to avoid stack-too-deep.
     */
    function _scoreFive(uint8[5] memory cards) private pure returns (uint256) {
        // Phase 1: Extract ranks, suits, counts
        uint8[13] memory rc;
        uint8[4] memory sc;
        uint8[5] memory sorted;

        for (uint8 i = 0; i < 5; i++) {
            sorted[i] = cards[i] % 13;
            sc[cards[i] / 13]++;
            rc[sorted[i]]++;
        }

        // Sort ranks descending (bubble sort on 5 elements)
        for (uint8 i = 0; i < 4; i++) {
            for (uint8 j = i + 1; j < 5; j++) {
                if (sorted[j] > sorted[i]) {
                    (sorted[i], sorted[j]) = (sorted[j], sorted[i]);
                }
            }
        }

        // Phase 2: Detect flush and straight
        bool isFlush = (sc[0] == 5 || sc[1] == 5 || sc[2] == 5 || sc[3] == 5);
        (bool isStraight, uint8 straightHigh) = _checkStraight(sorted);

        if (isStraight && isFlush) {
            return _pack(STRAIGHT_FLUSH, straightHigh, 0, 0, 0, 0);
        }
        if (isFlush) {
            // Check for pair-based hands first (they take priority over flush only if stronger)
            // Actually flush > straight but < full house. Pairs/trips/quads can't coexist with flush in 5 cards
            // (flush means 5 different cards of same suit, so at most one pair is possible - but
            //  if there's a pair, it's not a flush of 5 unique cards... wait, you can have 5 cards
            //  of same suit with a pair of ranks. E.g., 2♣ 2♣ is impossible since there's only one 2♣)
            // Actually in 5 distinct cards from a 52-card deck, you can't have a pair AND a flush
            // because each card is unique. So if isFlush, the hand is either straight flush or flush.
            return _pack(FLUSH, sorted[0], sorted[1], sorted[2], sorted[3], sorted[4]);
        }
        if (isStraight) {
            // Similarly, a straight has 5 distinct ranks, so no pairs
            return _pack(STRAIGHT, straightHigh, 0, 0, 0, 0);
        }

        // Phase 3: Pair-based hands (no flush or straight possible)
        return _scorePairBased(rc, sorted);
    }

    /**
     * @notice Score hands based on rank counts (pairs, trips, quads, full house).
     * @dev Called only when hand is not a flush or straight.
     */
    function _scorePairBased(uint8[13] memory rc, uint8[5] memory sorted)
        private pure returns (uint256)
    {
        // Categorize by rank counts (iterate high→low)
        uint8 pairCount;
        uint8 tripsCount;
        uint8 quadR;
        uint8 tripR;
        uint8 hiPairR;
        uint8 loPairR;

        for (uint8 r = 13; r > 0;) {
            r--;
            if (rc[r] == 4) {
                quadR = r;
                // Four of a kind
                uint8 k0 = _topKicker(rc, r, 255);
                return _pack(FOUR_OF_KIND, r, k0, 0, 0, 0);
            } else if (rc[r] == 3) {
                tripsCount++;
                tripR = r;
            } else if (rc[r] == 2) {
                pairCount++;
                if (pairCount == 1) hiPairR = r;
                else loPairR = r;
            }
        }

        if (tripsCount > 0 && pairCount > 0) {
            return _pack(FULL_HOUSE, tripR, hiPairR, 0, 0, 0);
        }
        if (tripsCount > 0) {
            (uint8 k0, uint8 k1) = _topTwoKickers(rc, tripR);
            return _pack(THREE_OF_KIND, tripR, k0, k1, 0, 0);
        }
        if (pairCount == 2) {
            uint8 k0 = _topKicker(rc, hiPairR, loPairR);
            return _pack(TWO_PAIR, hiPairR, loPairR, k0, 0, 0);
        }
        if (pairCount == 1) {
            (uint8 k0, uint8 k1, uint8 k2) = _topThreeKickers(rc, hiPairR);
            return _pack(ONE_PAIR, hiPairR, k0, k1, k2, 0);
        }
        // High card
        return _pack(HIGH_CARD, sorted[0], sorted[1], sorted[2], sorted[3], sorted[4]);
    }

    // ──── Helpers ────

    function _pack(uint256 handType, uint8 a, uint8 b, uint8 c, uint8 d, uint8 e)
        private pure returns (uint256)
    {
        return (handType << 20)
            | (uint256(a) << 16)
            | (uint256(b) << 12)
            | (uint256(c) << 8)
            | (uint256(d) << 4)
            | uint256(e);
    }

    function _checkStraight(uint8[5] memory sorted)
        private pure returns (bool, uint8)
    {
        // Normal straight: 5 consecutive descending
        if (sorted[0] - sorted[4] == 4
            && sorted[0] - sorted[1] == 1
            && sorted[1] - sorted[2] == 1
            && sorted[2] - sorted[3] == 1)
        {
            return (true, sorted[0]);
        }
        // Wheel: A(12)-5(3)-4(2)-3(1)-2(0)
        if (sorted[0] == 12 && sorted[1] == 3 && sorted[2] == 2
            && sorted[3] == 1 && sorted[4] == 0)
        {
            return (true, 3);
        }
        return (false, 0);
    }

    /// @dev Highest kicker rank, excluding excA and excB (255 = no exclusion)
    function _topKicker(uint8[13] memory rc, uint8 excA, uint8 excB)
        private pure returns (uint8)
    {
        for (uint8 r = 13; r > 0;) {
            r--;
            if (r != excA && r != excB && rc[r] > 0) return r;
        }
        return 0;
    }

    function _topTwoKickers(uint8[13] memory rc, uint8 excA)
        private pure returns (uint8, uint8)
    {
        uint8 found;
        uint8 k0;
        uint8 k1;
        for (uint8 r = 13; r > 0 && found < 2;) {
            r--;
            if (r != excA && rc[r] > 0) {
                if (found == 0) k0 = r;
                else k1 = r;
                found++;
            }
        }
        return (k0, k1);
    }

    function _topThreeKickers(uint8[13] memory rc, uint8 excA)
        private pure returns (uint8, uint8, uint8)
    {
        uint8 found;
        uint8 k0;
        uint8 k1;
        uint8 k2;
        for (uint8 r = 13; r > 0 && found < 3;) {
            r--;
            if (r != excA && rc[r] > 0) {
                if (found == 0) k0 = r;
                else if (found == 1) k1 = r;
                else k2 = r;
                found++;
            }
        }
        return (k0, k1, k2);
    }
}
