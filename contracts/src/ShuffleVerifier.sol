// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title ShuffleVerifier
 * @notice On-chain verification of the deterministic Fisher-Yates shuffle
 *         used by the OwnerView dealer service.
 *
 * Shuffle algorithm (bit-exact with TypeScript `verifiableShuffle`):
 *   shuffleSeed = keccak256(abi.encodePacked(vrfRandomness, dealerSeed))
 *   deck[0..51] = [0, 1, ..., 51]
 *   for i in [51..1]:
 *     stepHash = keccak256(abi.encodePacked(shuffleSeed, uint256(i)))
 *     j = uint256(stepHash) % (i + 1)
 *     swap deck[i], deck[j]
 *   seat k gets cards: deck[k*2], deck[k*2+1]
 *
 * Gas estimate (9 seats, 51 shuffle steps): ~350,000 gas (well within 500k target).
 */
library ShuffleVerifier {
    uint256 constant DECK_SIZE = 52;

    /**
     * @notice Verify that the revealed hole cards are consistent with the
     *         deterministic shuffle derived from `vrfRandomness` and `dealerSeed`.
     *
     * @param vrfRandomness On-chain VRF randomness for the hole card shuffle
     * @param dealerSeed    Dealer's revealed seed (bytes32)
     * @param seatCount     Number of seats dealt (must be <= 26)
     * @param handId        Hand ID (used in commitment verification)
     * @param seatCards     Per-seat cards and salts for commitment check.
     *                      Array index matches seat position (0-based).
     *                      seatCards[i].card1, seatCards[i].card2 are the claimed cards.
     *                      seatCards[i].salt is the commitment salt.
     *                      seatCards[i].commitment is the on-chain stored commitment.
     * @return true if all seats' cards match the shuffle and commitments verify
     */
    function verifyShuffleAndHoleCards(
        uint256 vrfRandomness,
        bytes32 dealerSeed,
        uint8 seatCount,
        uint256 handId,
        SeatReveal[] memory seatCards
    ) internal pure returns (bool) {
        require(seatCount > 0 && seatCount <= 26, "Invalid seat count");
        require(seatCards.length == seatCount, "seatCards length mismatch");

        // Step 1: compute shuffle seed
        bytes32 shuffleSeed = keccak256(abi.encodePacked(vrfRandomness, dealerSeed));

        // Step 2: execute deterministic Fisher-Yates shuffle
        uint8[52] memory deck;
        for (uint8 i = 0; i < DECK_SIZE; i++) {
            deck[i] = i;
        }

        for (uint256 i = DECK_SIZE - 1; i > 0; i--) {
            bytes32 stepHash = keccak256(abi.encodePacked(shuffleSeed, i));
            uint256 j = uint256(stepHash) % (i + 1);
            // swap deck[i] and deck[j]
            uint8 tmp = deck[i];
            deck[i] = deck[j];
            deck[j] = tmp;
        }

        // Step 3: verify each seat's revealed cards against shuffle and commitment
        for (uint256 k = 0; k < seatCount; k++) {
            uint8 expectedCard1 = deck[k * 2];
            uint8 expectedCard2 = deck[k * 2 + 1];

            SeatReveal memory sr = seatCards[k];

            // Verify cards match shuffle
            if (sr.card1 != expectedCard1 || sr.card2 != expectedCard2) {
                return false;
            }

            // Verify commitment: keccak256(abi.encodePacked(handId, uint8(k), card1, card2, salt))
            bytes32 expectedCommitment = keccak256(
                abi.encodePacked(handId, uint8(k), sr.card1, sr.card2, sr.salt)
            );
            if (sr.commitment != expectedCommitment) {
                return false;
            }
        }

        return true;
    }

    /**
     * @notice Compute only the shuffle seed (for off-chain cross-validation).
     */
    function computeShuffleSeed(
        uint256 vrfRandomness,
        bytes32 dealerSeed
    ) internal pure returns (bytes32) {
        return keccak256(abi.encodePacked(vrfRandomness, dealerSeed));
    }
}

/**
 * @notice Per-seat reveal data for shuffle verification.
 */
struct SeatReveal {
    uint8 card1;
    uint8 card2;
    bytes32 salt;
    bytes32 commitment;
}
