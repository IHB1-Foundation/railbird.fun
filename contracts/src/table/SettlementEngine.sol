// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";
import "../HandEvaluator.sol";

/**
 * @title SettlementEngine
 * @notice Hole card commit/reveal, showdown evaluation, pot distribution,
 *         side-pot settlement, shuffle verification, and vault PnL notifications.
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract SettlementEngine is PokerTableBase {
    struct ShowdownState {
        uint256[MAX_SEATS] scoresBySeat;
        bool[MAX_SEATS] revealedBySeat;
        uint8[MAX_SEATS] revealedSeats;
        uint8 revealedCount;
    }

    // ============ Dealer Seed Commit/Reveal ============

    function submitDealerSeedCommit(uint256 handId, bytes32 commitment) external onlyDealer {
        if (handId != currentHandId) revert InvalidParam();
        if (commitment == bytes32(0)) revert InvalidParam();
        if (dealerSeedCommitments[handId] != bytes32(0)) revert CommitmentAlreadyExists();
        dealerSeedCommitments[handId] = commitment;
        emit DealerSeedCommitted(handId, commitment);
    }

    function _postSettlementCleanup(uint256 handId, uint8 winner, uint256 potAmount) internal {
        emit HandSettled(handId, winner, potAmount);
        handWinner[handId] = winner;
        handSettledFlag[handId] = true;
        gameState = GameState.SETTLED;
        showdownStartTimestamp = 0;
        _advanceButton();
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;

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
        if (seatIndex >= numSeats) revert SeatError();
        if (handId != currentHandId) revert InvalidParam();
        if (
            gameState == GameState.WAITING_FOR_SEATS ||
            gameState == GameState.SETTLED ||
            gameState == GameState.TOURNAMENT_OVER
        ) revert InvalidState();
        if (commitment == bytes32(0)) revert InvalidParam();
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
        if (seatIndex >= numSeats) revert SeatError();
        if (handId == 0 || handId > currentHandId) revert InvalidParam();
        if (card1 >= DECK_SIZE || card2 >= DECK_SIZE) revert InvalidParam();
        if (card1 == card2) revert InvalidParam();

        bytes32 commitment = holeCommits[handId][seatIndex];
        if (commitment == bytes32(0)) revert InvalidParam();
        if (isHoleCardsRevealed[handId][seatIndex]) revert CommitmentAlreadyExists();

        if (handId == currentHandId) {
            if (gameState != GameState.SHOWDOWN && gameState != GameState.SETTLED) revert InvalidState();
        }

        bytes32 computedCommitment = keccak256(
            abi.encodePacked(handId, seatIndex, card1, card2, salt)
        );
        if (computedCommitment != commitment) revert InvalidParam();

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
        if (winnerSeat >= numSeats) revert SeatError();
        uint256 handId = currentHandId;
        uint256 potAmount = currentHand.pot;
        seats[winnerSeat].stack += potAmount;
        emit SeatUpdated(winnerSeat, seats[winnerSeat].owner, seats[winnerSeat].operator, seats[winnerSeat].stack);
        _postSettlementCleanup(handId, winnerSeat, potAmount);
    }

    function settleShowdown() external {
        if (gameState != GameState.SHOWDOWN) revert InvalidState();
        ShowdownState memory showdown = _collectShowdownState(currentHandId);

        if (showdown.revealedCount == 0) {
            _handleUnrevealedShowdown();
            return;
        }

        if (currentHand.sidePotCount > 0) {
            _settleShowdownWithSidePots(
                showdown.scoresBySeat,
                showdown.revealedBySeat,
                showdown.revealedSeats[0]
            );
            return;
        }

        if (showdown.revealedCount == 1) {
            _settleHand(showdown.revealedSeats[0]);
            return;
        }

        uint256[MAX_SEATS] memory seqScores = _buildSequentialScores(
            showdown.scoresBySeat,
            showdown.revealedSeats,
            showdown.revealedCount
        );
        (uint256 bestScore, uint8 winnerCount, uint8 uniqueWinnerSeat) = _resolveShowdownOutcome(
            showdown.revealedSeats,
            seqScores,
            showdown.revealedCount
        );
        if (winnerCount == 1) {
            _settleHand(uniqueWinnerSeat);
            return;
        }

        _settleHandSplit(
            showdown.revealedSeats,
            seqScores,
            showdown.revealedCount,
            bestScore,
            winnerCount
        );
    }

    function _settleShowdownWithSidePots(
        uint256[MAX_SEATS] memory scoresBySeat,
        bool[MAX_SEATS] memory revealedBySeat,
        uint8 fallbackWinner
    ) internal {
        uint8 firstWinner = _distributeSidePots(scoresBySeat, revealedBySeat, fallbackWinner);
        _postSettlementCleanup(currentHandId, firstWinner, currentHand.pot);
    }

    function _collectShowdownState(uint256 handId) internal view returns (ShowdownState memory showdown) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (!seats[i].isActive || !isHoleCardsRevealed[handId][i]) {
                continue;
            }

            uint8 c1 = _revealedHoleCards[handId][i][0];
            uint8 c2 = _revealedHoleCards[handId][i][1];
            showdown.scoresBySeat[i] = HandEvaluator.evaluate(communityCards, c1, c2);
            showdown.revealedBySeat[i] = true;
            showdown.revealedSeats[showdown.revealedCount] = i;
            showdown.revealedCount++;
        }
    }

    function _handleUnrevealedShowdown() internal {
        if (
            showdownStartTimestamp == 0 ||
            block.timestamp <= showdownStartTimestamp + SHOWDOWN_TIMEOUT
        ) revert ShowdownRevealWindowOpen();

        _settleUnrevealedShowdown();
    }

    function _buildSequentialScores(
        uint256[MAX_SEATS] memory scoresBySeat,
        uint8[MAX_SEATS] memory revealedSeats,
        uint8 revealedCount
    ) internal pure returns (uint256[MAX_SEATS] memory seqScores) {
        for (uint8 i = 0; i < revealedCount; i++) {
            seqScores[i] = scoresBySeat[revealedSeats[i]];
        }
    }

    function _resolveShowdownOutcome(
        uint8[MAX_SEATS] memory revealedSeats,
        uint256[MAX_SEATS] memory seqScores,
        uint8 revealedCount
    ) internal pure returns (uint256 bestScore, uint8 winnerCount, uint8 uniqueWinnerSeat) {
        uniqueWinnerSeat = UNDEALT;

        for (uint8 i = 0; i < revealedCount; i++) {
            if (seqScores[i] > bestScore) {
                bestScore = seqScores[i];
            }
        }

        for (uint8 i = 0; i < revealedCount; i++) {
            if (seqScores[i] == bestScore) {
                winnerCount++;
                uniqueWinnerSeat = winnerCount == 1 ? revealedSeats[i] : UNDEALT;
            }
        }
    }

    function _distributeSidePots(
        uint256[MAX_SEATS] memory scoresBySeat,
        bool[MAX_SEATS] memory revealedBySeat,
        uint8 fallbackWinner
    ) internal returns (uint8 firstWinner) {
        firstWinner = numSeats;

        for (uint8 p = 0; p < currentHand.sidePotCount; p++) {
            uint8 potWinner = _distributeSingleSidePot(p, scoresBySeat, revealedBySeat);
            if (firstWinner == numSeats && potWinner != numSeats) {
                firstWinner = potWinner;
            }
        }

        if (firstWinner == numSeats) {
            return fallbackWinner;
        }
    }

    function _distributeSingleSidePot(
        uint8 potIndex,
        uint256[MAX_SEATS] memory scoresBySeat,
        bool[MAX_SEATS] memory revealedBySeat
    ) internal returns (uint8 primaryWinner) {
        bool[MAX_SEATS] memory eligible = sidePots[potIndex].eligible;
        (uint256 bestScore, uint8 winnerCount) = _resolveEligibleBestScore(
            eligible,
            revealedBySeat,
            scoresBySeat
        );
        if (winnerCount == 0) {
            return numSeats;
        }

        uint256 potAmount = sidePots[potIndex].amount;
        uint256 share = potAmount / winnerCount;
        uint256 remainder = potAmount % winnerCount;

        primaryWinner = _findButtonOrderedWinner(eligible, revealedBySeat, scoresBySeat, bestScore);
        _paySidePotWinners(
            eligible,
            revealedBySeat,
            scoresBySeat,
            bestScore,
            share,
            remainder,
            primaryWinner
        );
    }

    function _resolveEligibleBestScore(
        bool[MAX_SEATS] memory eligible,
        bool[MAX_SEATS] memory revealedBySeat,
        uint256[MAX_SEATS] memory scoresBySeat
    ) internal pure returns (uint256 bestScore, uint8 winnerCount) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] > bestScore) {
                bestScore = scoresBySeat[i];
            }
        }

        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) {
                winnerCount++;
            }
        }
    }

    function _findButtonOrderedWinner(
        bool[MAX_SEATS] memory eligible,
        bool[MAX_SEATS] memory revealedBySeat,
        uint256[MAX_SEATS] memory scoresBySeat,
        uint256 bestScore
    ) internal view returns (uint8 primaryWinner) {
        primaryWinner = numSeats;
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 seat = (buttonSeat + i) % numSeats;
            if (eligible[seat] && revealedBySeat[seat] && scoresBySeat[seat] == bestScore) {
                return seat;
            }
        }
    }

    function _paySidePotWinners(
        bool[MAX_SEATS] memory eligible,
        bool[MAX_SEATS] memory revealedBySeat,
        uint256[MAX_SEATS] memory scoresBySeat,
        uint256 bestScore,
        uint256 share,
        uint256 remainder,
        uint8 primaryWinner
    ) internal {
        for (uint8 i = 0; i < numSeats; i++) {
            if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) {
                uint256 amount = share + (i == primaryWinner ? remainder : 0);
                seats[i].stack += amount;
                emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
            }
        }
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

        if (activeCount == 0) revert InvalidState();

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
        if (primaryWinner == UNDEALT) revert InvalidState();

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
