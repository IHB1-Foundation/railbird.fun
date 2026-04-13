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
            "CK"
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
        require(toCall > 0, "NC");

        uint256 actualCall = toCall < seats[seatIndex].stack ? toCall : seats[seatIndex].stack;

        _recordAction();

        seats[seatIndex].stack -= actualCall;
        seats[seatIndex].currentBet += actualCall;
        seats[seatIndex].totalHandBet += actualCall;
        currentHand.pot += actualCall;
        currentHand.hasActed[seatIndex] = true;

        if (seats[seatIndex].stack == 0) seats[seatIndex].isAllIn = true;

        emit ActionTaken(currentHandId, seatIndex, ActionType.CALL, toCall, currentHand.pot);

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
            require(raiseToAmount > currentHand.currentBet, "R1");
            uint256 minRaise = currentHand.currentBet + currentHand.lastRaiseSize;
            require(raiseToAmount >= minRaise, "R2");
            require(stack >= additional, "R3");
        } else {
            additional = stack;
            raiseToAmount = seats[seatIndex].currentBet + stack;
            require(raiseToAmount > currentHand.currentBet, "R1");
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

        if (seats[seatIndex].stack == 0) seats[seatIndex].isAllIn = true;

        for (uint8 i = 0; i < numSeats; i++) {
            if (i != seatIndex && seats[i].isActive) {
                currentHand.hasActed[i] = false;
            }
        }

        emit ActionTaken(currentHandId, seatIndex, ActionType.RAISE, raiseToAmount, currentHand.pot);

        _advanceAction(seatIndex);
    }

    function forceTimeout() external inBettingState oneActionPerBlock {
        require(block.timestamp > actionDeadline, "DP");

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
            emit ActionTaken(currentHandId, seatIndex, ActionType.CHECK, 0, currentHand.pot);
            _advanceAction(seatIndex);
        } else {
            seats[seatIndex].isActive = false;
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
        (uint256[MAX_SEATS] memory uniqueLevels, uint8 uniqueCount) = _collectUniqueSidePotLevels();

        uint256 prevLevel = 0;
        uint8 potCount = 0;

        for (uint8 i = 0; i < uniqueCount; i++) {
            (uint256 potAmount, bool[MAX_SEATS] memory eligible) = _describeSidePot(
                prevLevel,
                uniqueLevels[i]
            );
            if (potAmount > 0) {
                sidePots[potCount].amount = potAmount;
                sidePots[potCount].eligible = eligible;
                potCount++;
            }
            prevLevel = uniqueLevels[i];
        }

        currentHand.sidePotCount = potCount;
    }

    function _collectUniqueSidePotLevels()
        internal
        view
        returns (uint256[MAX_SEATS] memory uniqueLevels, uint8 uniqueCount)
    {
        uint256[MAX_SEATS] memory levels;
        uint8 levelCount = _collectAllInLevels(levels);
        _sortLevelsAscending(levels, levelCount);
        uniqueCount = _dedupeLevels(levels, levelCount, uniqueLevels);

        uint256 maxBet = _getMaxTotalHandBet();
        if (maxBet > 0 && (uniqueCount == 0 || uniqueLevels[uniqueCount - 1] < maxBet)) {
            uniqueLevels[uniqueCount] = maxBet;
            uniqueCount++;
        }
    }

    function _collectAllInLevels(uint256[MAX_SEATS] memory levels) internal view returns (uint8 levelCount) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive && seats[i].isAllIn && seats[i].totalHandBet > 0) {
                levels[levelCount] = seats[i].totalHandBet;
                levelCount++;
            }
        }
    }

    function _sortLevelsAscending(uint256[MAX_SEATS] memory levels, uint8 levelCount) internal pure {
        for (uint8 i = 1; i < levelCount; i++) {
            uint256 key = levels[i];
            uint8 j = i;
            while (j > 0 && levels[j - 1] > key) {
                levels[j] = levels[j - 1];
                j--;
            }
            levels[j] = key;
        }
    }

    function _dedupeLevels(
        uint256[MAX_SEATS] memory levels,
        uint8 levelCount,
        uint256[MAX_SEATS] memory uniqueLevels
    ) internal pure returns (uint8 uniqueCount) {
        for (uint8 i = 0; i < levelCount; i++) {
            if (uniqueCount == 0 || uniqueLevels[uniqueCount - 1] != levels[i]) {
                uniqueLevels[uniqueCount] = levels[i];
                uniqueCount++;
            }
        }
    }

    function _getMaxTotalHandBet() internal view returns (uint256 maxBet) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].totalHandBet > maxBet) {
                maxBet = seats[i].totalHandBet;
            }
        }
    }

    function _describeSidePot(uint256 prevLevel, uint256 curLevel)
        internal
        view
        returns (uint256 potAmount, bool[MAX_SEATS] memory eligible)
    {
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
    }

    function _completeBettingRound() internal {
        GameState fromState = gameState;
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

        emit BettingRoundComplete(currentHandId, fromState, nextState);

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
