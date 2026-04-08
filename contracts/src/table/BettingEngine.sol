// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";

/**
 * @title BettingEngine
 * @notice Dealer seed commit/reveal, player action handlers, and betting-round
 *         progression (fold, check, call, raise, forceTimeout, side pots, VRF requests).
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract BettingEngine is PokerTableBase {

    // ============ Dealer Seed Commit/Reveal ============

    function submitDealerSeedCommit(uint256 handId, bytes32 commitment) external onlyDealer {
        require(handId == currentHandId, "Must be current hand");
        require(commitment != bytes32(0), "Empty commitment");
        require(dealerSeedCommits[handId] == bytes32(0), "DealerSeed: already committed");
        require(
            gameState == GameState.WAITING_VRF_HOLECARDS ||
            gameState == GameState.WAITING_FOR_HOLECARDS ||
            gameState == GameState.BETTING_PRE,
            "DealerSeed: too late to commit"
        );

        dealerSeedCommits[handId] = commitment;
        emit DealerSeedCommitted(handId, commitment);
    }

    function revealDealerSeed(uint256 handId, bytes32 seed) external {
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(dealerSeedCommits[handId] != bytes32(0), "DealerSeed: no commitment");
        require(dealerSeedReveals[handId] == bytes32(0), "DealerSeed: already revealed");

        if (handId == currentHandId) {
            require(
                gameState == GameState.SHOWDOWN || gameState == GameState.SETTLED,
                "DealerSeed: not in showdown"
            );
        }

        require(keccak256(abi.encodePacked(seed)) == dealerSeedCommits[handId], "DealerSeed: commitment mismatch");

        dealerSeedReveals[handId] = seed;
        emit DealerSeedRevealed(handId, seed);
    }

    // ============ Actions ============

    function fold(uint8 seatIndex)
        external
        onlyOperator(seatIndex)
        inBettingState
        isActorTurn(seatIndex)
        withinDeadline
        oneActionPerBlock
    {
        _recordAction();
        seats[seatIndex].isActive = false;

        emit ActionTaken(currentHandId, seatIndex, ActionType.FOLD, 0, currentHand.pot);

        (uint8 activeCount, uint8 lastActive) = _countActivePlayers();
        if (activeCount == 1) {
            _settleHand(lastActive);
        } else {
            _advanceAction(seatIndex);
        }
    }

    function check(uint8 seatIndex)
        external
        onlyOperator(seatIndex)
        inBettingState
        isActorTurn(seatIndex)
        withinDeadline
        oneActionPerBlock
    {
        require(
            seats[seatIndex].currentBet == currentHand.currentBet,
            "Cannot check, must call or raise"
        );

        _recordAction();
        currentHand.hasActed[seatIndex] = true;

        emit ActionTaken(currentHandId, seatIndex, ActionType.CHECK, 0, currentHand.pot);
        _advanceAction(seatIndex);
    }

    function call(uint8 seatIndex)
        external
        onlyOperator(seatIndex)
        inBettingState
        isActorTurn(seatIndex)
        withinDeadline
        oneActionPerBlock
    {
        uint256 toCall = currentHand.currentBet - seats[seatIndex].currentBet;
        require(toCall > 0, "Nothing to call, use check");

        uint256 actualCall = toCall < seats[seatIndex].stack ? toCall : seats[seatIndex].stack;

        _recordAction();

        seats[seatIndex].stack -= actualCall;
        seats[seatIndex].currentBet += actualCall;
        seats[seatIndex].totalHandBet += actualCall;
        currentHand.pot += actualCall;
        currentHand.hasActed[seatIndex] = true;

        if (seats[seatIndex].stack == 0) {
            seats[seatIndex].isAllIn = true;
            emit SeatAllIn(currentHandId, seatIndex, seats[seatIndex].currentBet);
        }

        emit ActionTaken(currentHandId, seatIndex, ActionType.CALL, toCall, currentHand.pot);
        emit PotUpdated(currentHandId, currentHand.pot);
        emit SeatUpdated(seatIndex, seats[seatIndex].owner, seats[seatIndex].operator, seats[seatIndex].stack);

        _advanceAction(seatIndex);
    }

    function raise(uint8 seatIndex, uint256 raiseToAmount)
        external
        onlyOperator(seatIndex)
        inBettingState
        isActorTurn(seatIndex)
        withinDeadline
        oneActionPerBlock
    {
        uint256 stack = seats[seatIndex].stack;
        uint256 additional = raiseToAmount - seats[seatIndex].currentBet;

        bool isAllInRaise = stack <= additional;

        if (!isAllInRaise) {
            require(raiseToAmount > currentHand.currentBet, "Raise must exceed current bet");
            uint256 minRaise = currentHand.currentBet + currentHand.lastRaiseSize;
            require(raiseToAmount >= minRaise, "Raise too small");
            require(stack >= additional, "Insufficient stack");
        } else {
            additional = stack;
            raiseToAmount = seats[seatIndex].currentBet + stack;
            require(raiseToAmount > currentHand.currentBet, "Raise must exceed current bet");
        }

        _recordAction();

        uint256 prevCurrentBet = currentHand.currentBet;
        seats[seatIndex].stack -= additional;
        seats[seatIndex].currentBet = raiseToAmount;
        seats[seatIndex].totalHandBet += additional;
        currentHand.pot += additional;
        currentHand.currentBet = raiseToAmount;
        currentHand.lastRaiseSize = raiseToAmount - prevCurrentBet;
        currentHand.lastAggressor = seatIndex;
        currentHand.hasActed[seatIndex] = true;

        if (seats[seatIndex].stack == 0) {
            seats[seatIndex].isAllIn = true;
            emit SeatAllIn(currentHandId, seatIndex, seats[seatIndex].currentBet);
        }

        for (uint8 i = 0; i < numSeats; i++) {
            if (i != seatIndex && seats[i].isActive) {
                currentHand.hasActed[i] = false;
            }
        }

        emit ActionTaken(currentHandId, seatIndex, ActionType.RAISE, raiseToAmount, currentHand.pot);
        emit PotUpdated(currentHandId, currentHand.pot);
        emit SeatUpdated(seatIndex, seats[seatIndex].owner, seats[seatIndex].operator, seats[seatIndex].stack);

        _advanceAction(seatIndex);
    }

    function forceTimeout() external inBettingState oneActionPerBlock {
        require(block.timestamp > actionDeadline, "Deadline not passed");

        uint8 seatIndex = currentHand.actorSeat;

        if (seats[seatIndex].isAllIn) {
            _recordAction();
            _advanceAction(seatIndex);
            return;
        }

        bool canCheckNow = seats[seatIndex].currentBet == currentHand.currentBet;
        _recordAction();

        if (canCheckNow) {
            currentHand.hasActed[seatIndex] = true;
            emit ForceTimeout(currentHandId, seatIndex, ActionType.CHECK);
            emit ActionTaken(currentHandId, seatIndex, ActionType.CHECK, 0, currentHand.pot);
            _advanceAction(seatIndex);
        } else {
            seats[seatIndex].isActive = false;
            emit ForceTimeout(currentHandId, seatIndex, ActionType.FOLD);
            emit ActionTaken(currentHandId, seatIndex, ActionType.FOLD, 0, currentHand.pot);

            (uint8 activeCount, uint8 lastActive) = _countActivePlayers();
            if (activeCount == 1) {
                _settleHand(lastActive);
            } else {
                _advanceAction(seatIndex);
            }
        }
    }

    // ============ Internal Betting Helpers ============

    function _recordAction() internal {
        lastActionBlock = block.number;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        currentHand.actionsInRound++;
    }

    function _advanceAction(uint8 actorSeat) internal {
        if (_isBettingRoundComplete()) {
            _completeBettingRound();
        } else {
            uint8 next = _nextActiveSeat(actorSeat);
            if (next == numSeats) {
                _completeBettingRound();
            } else {
                currentHand.actorSeat = next;
            }
        }
    }

    function _isBettingRoundComplete() internal view returns (bool) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive && !seats[i].isAllIn) {
                if (!currentHand.hasActed[i]) return false;
                if (seats[i].currentBet != currentHand.currentBet) return false;
            }
        }
        return true;
    }

    function _nextActiveSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 next = (fromSeat + i) % numSeats;
            if (seats[next].isActive && !seats[next].isAllIn) {
                return next;
            }
        }
        return numSeats;
    }

    function _countActivePlayers() internal view returns (uint8 count, uint8 lastActive) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                count++;
                lastActive = i;
            }
        }
    }

    function _countNonAllInActivePlayers() internal view returns (uint8 count) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive && !seats[i].isAllIn) count++;
        }
    }

    function _buildSidePots() internal {
        uint256[MAX_SEATS] memory levels;
        uint8 levelCount = 0;

        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive && seats[i].isAllIn && seats[i].totalHandBet > 0) {
                levels[levelCount++] = seats[i].totalHandBet;
            }
        }

        // Insertion sort ascending
        for (uint8 i = 1; i < levelCount; i++) {
            uint256 key = levels[i];
            uint8 j = i;
            while (j > 0 && levels[j - 1] > key) {
                levels[j] = levels[j - 1];
                j--;
            }
            levels[j] = key;
        }

        // Deduplicate
        uint256[MAX_SEATS] memory uniqueLevels;
        uint8 uniqueCount = 0;
        for (uint8 i = 0; i < levelCount; i++) {
            if (uniqueCount == 0 || uniqueLevels[uniqueCount - 1] != levels[i]) {
                uniqueLevels[uniqueCount++] = levels[i];
            }
        }

        uint256 maxBet = 0;
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].totalHandBet > maxBet) maxBet = seats[i].totalHandBet;
        }
        if (maxBet > 0 && (uniqueCount == 0 || uniqueLevels[uniqueCount - 1] < maxBet)) {
            uniqueLevels[uniqueCount++] = maxBet;
        }

        uint256 prevLevel = 0;
        uint8 potCount = 0;

        for (uint8 j = 0; j < uniqueCount; j++) {
            uint256 curLevel = uniqueLevels[j];
            uint256 potAmount = 0;
            bool[MAX_SEATS] memory eligible;

            for (uint8 i = 0; i < numSeats; i++) {
                uint256 bet = seats[i].totalHandBet;
                if (bet > prevLevel) {
                    uint256 cap = bet < curLevel ? bet : curLevel;
                    potAmount += cap - prevLevel;
                }
                if (seats[i].isActive && bet >= curLevel) {
                    eligible[i] = true;
                }
            }

            if (potAmount > 0) {
                sidePots[potCount].amount = potAmount;
                sidePots[potCount].eligible = eligible;
                potCount++;
            }
            prevLevel = curLevel;
        }

        currentHand.sidePotCount = potCount;
    }

    function _completeBettingRound() internal {
        GameState currentState = gameState;
        GameState nextState;

        if (gameState == GameState.BETTING_PRE) {
            nextState = GameState.WAITING_VRF_FLOP;
        } else if (gameState == GameState.BETTING_FLOP) {
            nextState = GameState.WAITING_VRF_TURN;
        } else if (gameState == GameState.BETTING_TURN) {
            nextState = GameState.WAITING_VRF_RIVER;
        } else if (gameState == GameState.BETTING_RIVER) {
            nextState = GameState.SHOWDOWN;
        } else {
            revert InvalidGameState();
        }

        emit BettingRoundComplete(currentHandId, currentState, nextState);

        if (nextState == GameState.SHOWDOWN) {
            _buildSidePots();
            gameState = GameState.SHOWDOWN;
            showdownStartTimestamp = block.timestamp;
        } else {
            gameState = nextState;
            showdownStartTimestamp = 0;

            uint256 requestId = 0;
            if (vrfAdapter != address(0)) {
                requestId = IVRFAdapter(vrfAdapter).requestRandomness(
                    tableId,
                    currentHandId,
                    uint8(nextState)
                );
                pendingVRFRequestId = requestId;
                vrfRequestTimestamp = block.timestamp;
            }

            emit VRFRequested(currentHandId, nextState, requestId);
        }
    }
}
