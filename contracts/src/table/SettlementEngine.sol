// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";
import "../HandEvaluator.sol";
import { ShuffleVerifier, SeatReveal } from "../ShuffleVerifier.sol";

/**
 * @title SettlementEngine
 * @notice Hole card commit/reveal, showdown evaluation, pot distribution,
 *         side-pot settlement, shuffle verification, and vault PnL notifications.
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract SettlementEngine is PokerTableBase {

    // ============ Shuffle Verification ============

    function verifyShuffleAtShowdown(
        uint256 handId,
        uint8 seatCount,
        SeatReveal[] memory reveals,
        uint256 vrfRandomness
    ) external {
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(dealerSeedReveals[handId] != bytes32(0), "Dealer seed not revealed yet");

        bytes32 storedHash = holeCardVRFRandomnessHash[handId];
        require(storedHash != bytes32(0), "VRF randomness not available");
        require(keccak256(abi.encodePacked(vrfRandomness)) == storedHash, "VRF randomness mismatch");

        bytes32 dealerSeed = dealerSeedReveals[handId];

        bool valid = ShuffleVerifier.verifyShuffleAndHoleCards(
            vrfRandomness,
            dealerSeed,
            seatCount,
            handId,
            reveals
        );

        if (valid) {
            emit ShuffleVerified(handId, dealerSeed);
        } else {
            emit ShuffleIntegrityViolation(handId, dealerSeed);
            if (!paused) {
                paused = true;
                emit TablePaused(address(this));
            }
        }
    }

    function _checkAndFlagUnrevealedDealerSeed(uint256 handId) internal {
        if (dealerSeedCommits[handId] != bytes32(0) && dealerSeedReveals[handId] == bytes32(0)) {
            emit ShuffleUnverified(handId);
            if (!paused) {
                paused = true;
                emit TablePaused(address(this));
            }
        }
    }

    // ============ Hole Card Commit/Reveal ============

    function submitHoleCommit(
        uint256 handId,
        uint8 seatIndex,
        bytes32 commitment
    ) external onlyDealer {
        require(seatIndex < numSeats, "Invalid seat");
        require(handId == currentHandId, "Must be current hand");
        require(
            gameState != GameState.WAITING_FOR_SEATS &&
            gameState != GameState.SETTLED &&
            gameState != GameState.TOURNAMENT_OVER,
            "Cannot submit commit now"
        );
        require(commitment != bytes32(0), "Empty commitment");
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
        require(seatIndex < numSeats, "Invalid seat");
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(card1 < DECK_SIZE && card2 < DECK_SIZE, "Invalid card value");
        require(card1 != card2, "Duplicate cards");

        bytes32 commitment = holeCommits[handId][seatIndex];
        require(commitment != bytes32(0), "No commitment found");
        require(!isHoleCardsRevealed[handId][seatIndex], "Already revealed");

        if (handId == currentHandId) {
            require(
                gameState == GameState.SHOWDOWN || gameState == GameState.SETTLED,
                "Not at showdown"
            );
        }

        bytes32 computedCommitment = keccak256(
            abi.encodePacked(handId, seatIndex, card1, card2, salt)
        );
        require(computedCommitment == commitment, "Invalid reveal");

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

    function getRevealedHoleCards(
        uint256 handId,
        uint8 seatIndex
    ) external view returns (uint8 card1, uint8 card2) {
        require(seatIndex < numSeats, "Invalid seat");
        if (!isHoleCardsRevealed[handId][seatIndex]) {
            return (UNDEALT, UNDEALT);
        }
        return (_revealedHoleCards[handId][seatIndex][0], _revealedHoleCards[handId][seatIndex][1]);
    }

    // ============ Settlement ============

    function _settleHand(uint8 winnerSeat) internal override {
        require(winnerSeat < numSeats, "Invalid winner");

        uint256 handId = currentHandId;
        _checkAndFlagUnrevealedDealerSeed(handId);

        uint256 potAmount = currentHand.pot;
        seats[winnerSeat].stack += potAmount;

        emit SeatUpdated(winnerSeat, seats[winnerSeat].owner, seats[winnerSeat].operator, seats[winnerSeat].stack);
        emit HandSettled(currentHandId, winnerSeat, potAmount);

        {
            uint256[MAX_SEATS] memory won;
            won[winnerSeat] = potAmount;
            _notifyVaultsOfSettlement(handId, won);
        }

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

    function settleShowdown() external {
        require(gameState == GameState.SHOWDOWN, "Not at showdown");

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
        _checkAndFlagUnrevealedDealerSeed(currentHandId);
        uint8 potCount = currentHand.sidePotCount;
        uint8 firstWinner = numSeats;
        uint256[MAX_SEATS] memory won;

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
                    won[i] += amount;
                    if (firstWinner == numSeats) firstWinner = i;
                    emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
                }
            }
        }

        if (firstWinner == numSeats) firstWinner = fallbackWinner;

        emit HandSettled(currentHandId, firstWinner, currentHand.pot);
        _notifyVaultsOfSettlement(currentHandId, won);

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

    function _settleHandSplit(
        uint8[MAX_SEATS] memory revSeats,
        uint256[MAX_SEATS] memory scores,
        uint8 revealedCount,
        uint256 bestScore,
        uint8 winnerCount
    ) internal {
        _checkAndFlagUnrevealedDealerSeed(currentHandId);
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

        uint256[MAX_SEATS] memory won;
        for (uint8 i = 0; i < revealedCount; i++) {
            if (scores[i] == bestScore) {
                uint256 amount = share;
                if (revSeats[i] == primaryWinner) amount += remainder;
                seats[revSeats[i]].stack += amount;
                won[revSeats[i]] = amount;
                emit SeatUpdated(
                    revSeats[i],
                    seats[revSeats[i]].owner,
                    seats[revSeats[i]].operator,
                    seats[revSeats[i]].stack
                );
            }
        }

        emit HandSettled(currentHandId, primaryWinner, potAmount);
        _notifyVaultsOfSettlement(currentHandId, won);

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

    function _settleUnrevealedShowdown() internal {
        uint8 activeCount;
        uint8[MAX_SEATS] memory activeSeats;
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                activeSeats[activeCount] = i;
                activeCount++;
            }
        }

        require(activeCount > 0, "No active players");

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
        require(primaryWinner != UNDEALT, "No active players");

        uint256[MAX_SEATS] memory won;
        for (uint8 i = 0; i < activeCount; i++) {
            uint8 seatIndex = activeSeats[i];
            uint256 payout = share;
            if (seatIndex == primaryWinner) payout += remainder;
            seats[seatIndex].stack += payout;
            won[seatIndex] = payout;
            emit SeatUpdated(seatIndex, seats[seatIndex].owner, seats[seatIndex].operator, seats[seatIndex].stack);
        }

        emit ShowdownTimedOut(currentHandId, activeCount, potAmount);
        emit HandSettled(currentHandId, primaryWinner, potAmount);
        _notifyVaultsOfSettlement(currentHandId, won);

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

    // ============ Vault Settlement Notifications ============

    function _notifyVaultsOfSettlement(
        uint256 handId,
        uint256[MAX_SEATS] memory won
    ) internal {
        if (playerRegistry == address(0)) return;
        for (uint8 i = 0; i < numSeats; i++) {
            address seatOwner = seats[i].owner;
            if (seatOwner == address(0)) continue;
            uint256 totalBet = seats[i].totalHandBet;
            uint256 received = won[i];
            if (totalBet == 0 && received == 0) continue;
            int256 pnl = int256(received) - int256(totalBet);
            try IPlayerRegistry(playerRegistry).agents(seatOwner) returns (
                address vault, address, address, address, string memory, bool isReg
            ) {
                if (!isReg || vault == address(0)) continue;
                if (vault.code.length == 0) continue;
                try IPlayerVaultMinimal(vault).onSettlement(handId, pnl) {} catch (bytes memory reason) {
                    emit VaultCallbackFailed(handId, seatOwner, vault, reason);
                }
            } catch {}
        }
    }
}
