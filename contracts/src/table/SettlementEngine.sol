// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";
import "../HandEvaluator.sol";
import "../ShuffleVerifier.sol";

interface IPlayerRegistryVault {
    function getVault(address agent) external view returns (address);
}

interface IPlayerVaultPnl {
    function onSettlement(uint256 handId, int256 pnl) external;
}

/**
 * @title SettlementEngine
 * @notice Hole card commit/reveal, showdown evaluation, pot distribution,
 *         side-pot settlement, shuffle verification, and vault PnL notifications.
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract SettlementEngine is PokerTableBase {

    // ============ AI Decision Transparency ============

    /**
     * @notice AI agent commits their decision hash before acting.
     *         Allows post-hand verification that the agent acted as committed.
     * @param seatIndex   Seat the agent controls.
     * @param commitHash  keccak256(abi.encode(handId, seatIndex, action, reasoning, salt))
     * @param reasoningHash Optional hash of the full reasoning JSON (0 = not provided).
     */
    function commitDecision(uint8 seatIndex, bytes32 commitHash, bytes32 reasoningHash) external {
        require(seatIndex < numSeats, "S1");
        require(
            msg.sender == seats[seatIndex].operator || msg.sender == seats[seatIndex].owner,
            "Not operator"
        );
        require(commitHash != bytes32(0), "Empty commitment");
        uint256 handId = currentHandId;
        decisionCommits[handId][seatIndex] = commitHash;
        if (reasoningHash != bytes32(0)) {
            decisionReasoningHashes[handId][seatIndex] = reasoningHash;
        }
        emit DecisionCommitted(handId, seatIndex, commitHash, reasoningHash);
    }

    /**
     * @notice Reveal decision after hand is settled for transparency verification.
     */
    function revealDecision(
        uint256 handId,
        uint8 seatIndex,
        string calldata action,
        string calldata reasoning,
        bytes32 salt
    ) external {
        require(handSettledFlag[handId], "Hand not settled");
        require(seatIndex < numSeats, "S1");
        bytes32 stored = decisionCommits[handId][seatIndex];
        require(stored != bytes32(0), "No commitment found");
        bytes32 expected = keccak256(abi.encode(handId, seatIndex, action, reasoning, salt));
        require(expected == stored, "Commitment mismatch");
        emit DecisionRevealed(handId, seatIndex, action, reasoning);
    }

    /// @notice Returns the stored reasoning hash for a given hand/seat.
    function getReasoningHash(uint256 handId, uint8 seatIndex) external view returns (bytes32) {
        return decisionReasoningHashes[handId][seatIndex];
    }

    // ============ Dealer Seed Commit/Reveal ============

    /**
     * @notice Dealer reveals their shuffle seed, allowing anyone to verify the shuffle.
     *         Must be called before settlement to avoid ShuffleUnverified.
     */
    function revealDealerSeed(uint256 handId, bytes32 seed) external onlyDealer {
        require(gameState == GameState.SHOWDOWN, "DealerSeed: not in showdown");
        require(dealerSeedCommitments[handId] != bytes32(0), "DealerSeed: no commitment");
        require(
            keccak256(abi.encodePacked(seed)) == dealerSeedCommitments[handId],
            "DealerSeed: commitment mismatch"
        );
        dealerSeedRevealed[handId] = true;
        dealerSeedReveals[handId] = seed;
        emit DealerSeedRevealed(handId, seed);
    }

    /**
     * @notice Verify the shuffle at showdown using the dealer seed and VRF randomness.
     *         Emits ShuffleVerified or ShuffleIntegrityViolation.
     */
    function verifyShuffleAtShowdown(
        uint256 handId,
        uint8 seatCount,
        SeatReveal[] calldata reveals,
        uint256 vrfRandomness
    ) external {
        require(dealerSeedReveals[handId] != bytes32(0), "Seed not revealed");
        bytes32 seed = dealerSeedReveals[handId];

        bool verified = ShuffleVerifier.verifyShuffleAndHoleCards(
            vrfRandomness,
            seed,
            seatCount,
            handId,
            reveals
        );

        if (verified) {
            emit ShuffleVerified(handId, seed);
        } else {
            emit ShuffleIntegrityViolation(handId, seed);
        }
    }

    /**
     * @notice Dealer optionally commits a seed hash before a hand starts.
     *         If committed but not revealed before settlement, the table is auto-paused
     *         and `ShuffleUnverified` is emitted as a hard-enforcement signal.
     */
    function submitDealerSeedCommit(uint256 handId, bytes32 commitment) external onlyDealer {
        require(handId == currentHandId, "H1");
        require(commitment != bytes32(0), "H3");
        require(dealerSeedCommitments[handId] == bytes32(0), "DealerSeed: already committed");
        dealerSeedCommitments[handId] = commitment;
        emit DealerSeedCommitted(handId, commitment);
    }

    function _postSettlementCleanup(uint256 handId, uint8 winner, uint256 potAmount) internal {
        // Shuffle verification enforcement: if the dealer committed a seed but never
        // revealed it, emit a warning event and pause the table.
        if (dealerSeedCommitments[handId] != bytes32(0) && !dealerSeedRevealed[handId]) {
            emit ShuffleUnverified(handId);
            paused = true;
        }

        emit HandSettled(handId, winner, potAmount);
        handWinner[handId] = winner;
        handSettledFlag[handId] = true;
        gameState = GameState.SETTLED;
        showdownStartTimestamp = 0;
        _advanceButton();
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;

        // Notify vaults of per-seat PnL before resetting hand state.
        if (playerRegistry != address(0)) {
            for (uint8 i = 0; i < numSeats; i++) {
                if (seats[i].owner == address(0)) continue;
                if (seats[i].totalHandBet == 0 && i != winner) continue;
                address vault = IPlayerRegistryVault(playerRegistry).getVault(seats[i].owner);
                if (vault == address(0)) continue;
                int256 pnl;
                if (i == winner) {
                    pnl = int256(potAmount) - int256(seats[i].totalHandBet);
                } else {
                    pnl = -int256(seats[i].totalHandBet);
                }
                try IPlayerVaultPnl(vault).onSettlement(handId, pnl) {
                    continue;
                } catch {
                    continue;
                }
            }
        }

        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
        _evictBustedSeats();
    }

    // ============ Hole Card Commit/Reveal ============

    function submitHoleCommit(
        uint256 handId,
        uint8 seatIndex,
        bytes32 commitment
    ) external onlyDealer {
        require(seatIndex < numSeats, "S1");
        require(handId == currentHandId, "H1");
        require(
            gameState != GameState.WAITING_FOR_SEATS &&
            gameState != GameState.SETTLED &&
            gameState != GameState.TOURNAMENT_OVER,
            "H2"
        );
        require(commitment != bytes32(0), "H3");
        if (holeCommits[handId][seatIndex] != bytes32(0)) revert CommitmentAlreadyExists();

        holeCommits[handId][seatIndex] = commitment;
        emit HoleCommitSubmitted(handId, seatIndex, commitment);
    }

    function revealHoleCards(
        uint256 handId,
        uint8 seatIndex,
        uint8 card1,
        uint8 card2,
        bytes32 salt
    ) external {
        require(seatIndex < numSeats, "S1");
        require(handId > 0 && handId <= currentHandId, "H4");
        require(card1 < DECK_SIZE && card2 < DECK_SIZE, "C1");
        require(card1 != card2, "C2");

        bytes32 commitment = holeCommits[handId][seatIndex];
        require(commitment != bytes32(0), "C3");
        require(!isHoleCardsRevealed[handId][seatIndex], "C4");

        if (handId == currentHandId) {
            require(
                gameState == GameState.SHOWDOWN || gameState == GameState.SETTLED,
                "SD"
            );
        }

        bytes32 computedCommitment = keccak256(
            abi.encodePacked(handId, seatIndex, card1, card2, salt)
        );
        require(computedCommitment == commitment, "C5");

        for (uint8 ci = 0; ci < 5; ci++) {
            if (communityCards[ci] == UNDEALT) continue;
            if (card1 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card1, ci);
                return;
            }
            if (card2 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card2, ci);
                return;
            }
        }

        _revealedHoleCards[handId][seatIndex] = [card1, card2];
        isHoleCardsRevealed[handId][seatIndex] = true;

        emit HoleCardsRevealed(handId, seatIndex, card1, card2);
    }

    // ============ Settlement ============

    function _settleHand(uint8 winnerSeat) internal override {
        require(winnerSeat < numSeats, "W1");
        uint256 handId = currentHandId;
        uint256 potAmount = currentHand.pot;
        seats[winnerSeat].stack += potAmount;
        emit SeatUpdated(winnerSeat, seats[winnerSeat].owner, seats[winnerSeat].operator, seats[winnerSeat].stack);
        _postSettlementCleanup(handId, winnerSeat, potAmount);
    }

    function settleShowdown() external {
        require(gameState == GameState.SHOWDOWN, "SD");

        uint256 handId = currentHandId;

        uint256[MAX_SEATS] memory scoresBySeat;
        bool[MAX_SEATS] memory revealedBySeat;
        uint8 revealedCount;
        uint8[MAX_SEATS] memory revSeats;

        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive && isHoleCardsRevealed[handId][i]) {
                uint8 c1 = _revealedHoleCards[handId][i][0];
                uint8 c2 = _revealedHoleCards[handId][i][1];
                scoresBySeat[i] = HandEvaluator.evaluate(communityCards, c1, c2);
                revealedBySeat[i] = true;
                revSeats[revealedCount] = i;
                revealedCount++;
            }
        }

        if (revealedCount == 0) {
            if (
                showdownStartTimestamp == 0 ||
                block.timestamp <= showdownStartTimestamp + SHOWDOWN_TIMEOUT
            ) revert ShowdownRevealWindowOpen();
            _settleUnrevealedShowdown();
            return;
        }

        if (currentHand.sidePotCount > 0) {
            _settleShowdownWithSidePots(scoresBySeat, revealedBySeat, revSeats[0]);
            return;
        }

        uint256[MAX_SEATS] memory seqScores;
        for (uint8 i = 0; i < revealedCount; i++) {
            seqScores[i] = scoresBySeat[revSeats[i]];
        }

        if (revealedCount == 1) {
            _settleHand(revSeats[0]);
            return;
        }

        uint256 bestScore;
        for (uint8 i = 0; i < revealedCount; i++) {
            if (seqScores[i] > bestScore) bestScore = seqScores[i];
        }

        uint8 winnerCount;
        for (uint8 i = 0; i < revealedCount; i++) {
            if (seqScores[i] == bestScore) winnerCount++;
        }

        if (winnerCount == 1) {
            for (uint8 i = 0; i < revealedCount; i++) {
                if (seqScores[i] == bestScore) {
                    _settleHand(revSeats[i]);
                    return;
                }
            }
        }

        _settleHandSplit(revSeats, seqScores, revealedCount, bestScore, winnerCount);
    }

    function _settleShowdownWithSidePots(
        uint256[MAX_SEATS] memory scoresBySeat,
        bool[MAX_SEATS] memory revealedBySeat,
        uint8 fallbackWinner
    ) internal {
        uint8 potCount = currentHand.sidePotCount;
        uint8 firstWinner = numSeats;

        for (uint8 p = 0; p < potCount; p++) {
            uint256 potAmount = sidePots[p].amount;
            bool[MAX_SEATS] memory eligible = sidePots[p].eligible;

            uint8 eligCount = 0;
            uint256 bestScore = 0;

            for (uint8 i = 0; i < numSeats; i++) {
                if (eligible[i] && revealedBySeat[i]) {
                    eligCount++;
                    if (scoresBySeat[i] > bestScore) bestScore = scoresBySeat[i];
                }
            }

            if (eligCount == 0) continue;

            uint8 winnerCount = 0;
            for (uint8 i = 0; i < numSeats; i++) {
                if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) winnerCount++;
            }

            uint256 share = potAmount / winnerCount;
            uint256 remainder = potAmount % winnerCount;

            uint8 primaryWinner = numSeats;
            for (uint8 i = 1; i <= numSeats; i++) {
                uint8 seat = (buttonSeat + i) % numSeats;
                if (eligible[seat] && revealedBySeat[seat] && scoresBySeat[seat] == bestScore) {
                    primaryWinner = seat;
                    break;
                }
            }

            for (uint8 i = 0; i < numSeats; i++) {
                if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) {
                    uint256 amount = share + (i == primaryWinner ? remainder : 0);
                    seats[i].stack += amount;
                    if (firstWinner == numSeats) firstWinner = i;
                    emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
                }
            }
        }

        if (firstWinner == numSeats) firstWinner = fallbackWinner;
        _postSettlementCleanup(currentHandId, firstWinner, currentHand.pot);
    }

    function _settleHandSplit(
        uint8[MAX_SEATS] memory revSeats,
        uint256[MAX_SEATS] memory scores,
        uint8 revealedCount,
        uint256 bestScore,
        uint8 winnerCount
    ) internal {
        uint256 potAmount = currentHand.pot;
        uint256 share = potAmount / winnerCount;
        uint256 remainder = potAmount % winnerCount;

        uint8 primaryWinner = UNDEALT;
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 seat = (buttonSeat + i) % numSeats;
            for (uint8 j = 0; j < revealedCount; j++) {
                if (revSeats[j] == seat && scores[j] == bestScore) {
                    primaryWinner = seat;
                    break;
                }
            }
            if (primaryWinner != UNDEALT) break;
        }

        for (uint8 i = 0; i < revealedCount; i++) {
            if (scores[i] == bestScore) {
                uint256 amount = share;
                if (revSeats[i] == primaryWinner) amount += remainder;
                seats[revSeats[i]].stack += amount;
                emit SeatUpdated(
                    revSeats[i],
                    seats[revSeats[i]].owner,
                    seats[revSeats[i]].operator,
                    seats[revSeats[i]].stack
                );
            }
        }

        _postSettlementCleanup(currentHandId, primaryWinner, potAmount);
    }

    function _settleUnrevealedShowdown() internal {
        uint8 activeCount;
        uint8[MAX_SEATS] memory activeSeats;
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                activeSeats[activeCount] = i;
                activeCount++;
            }
        }

        require(activeCount > 0, "NA");

        if (activeCount == 1) {
            _settleHand(activeSeats[0]);
            return;
        }

        uint256 potAmount = currentHand.pot;
        uint256 share = potAmount / uint256(activeCount);
        uint256 remainder = potAmount % uint256(activeCount);

        uint8 primaryWinner = UNDEALT;
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 seat = (buttonSeat + i) % numSeats;
            for (uint8 j = 0; j < activeCount; j++) {
                if (activeSeats[j] == seat) {
                    primaryWinner = seat;
                    break;
                }
            }
            if (primaryWinner != UNDEALT) break;
        }
        require(primaryWinner != UNDEALT, "NA");

        for (uint8 i = 0; i < activeCount; i++) {
            uint8 seatIdx = activeSeats[i];
            uint256 payout = share;
            if (seatIdx == primaryWinner) payout += remainder;
            seats[seatIdx].stack += payout;
            emit SeatUpdated(seatIdx, seats[seatIdx].owner, seats[seatIdx].operator, seats[seatIdx].stack);
        }

        _postSettlementCleanup(currentHandId, primaryWinner, potAmount);
    }

}
