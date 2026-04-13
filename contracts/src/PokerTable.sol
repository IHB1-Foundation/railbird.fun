// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./table/SeatManager.sol";
import "./table/BettingEngine.sol";
import "./table/SettlementEngine.sol";

/**
 * @title PokerTable
 * @notice Composition root for the modular PokerTable system.
 * @dev Inherits seat management, betting engine, and settlement engine from sub-modules.
 *      This contract adds only the hand-lifecycle orchestration:
 *        startHand, fulfillVRF, reRequestVRF, reRequestHoleCardVRF, advanceToPreflop.
 *
 *      Inheritance chain (C3 linearization):
 *        PokerTable → SeatManager → BettingEngine → SettlementEngine → PokerTableBase
 */
contract PokerTable is SeatManager, BettingEngine, SettlementEngine {

    // ============ Constructor ============

    constructor(
        uint256 _tableId,
        uint256 _smallBlind,
        uint256 _bigBlind,
        address _vrfAdapter,
        address _chipToken,
        address _kycSBT,
        uint256 _actionTimeout,
        uint256 _vrfTimeout,
        uint256 _showdownTimeout,
        uint8 _numSeats,
        address _dealer
    ) PokerTableBase(
        _tableId,
        _smallBlind,
        _bigBlind,
        _vrfAdapter,
        _chipToken,
        _kycSBT,
        _actionTimeout,
        _vrfTimeout,
        _showdownTimeout,
        _numSeats,
        _dealer
    ) {}

    // ============ Hand Lifecycle ============

    /**
     * @notice Start a new hand: post blinds, initialize state, request hole card VRF.
     * @dev Callable by anyone once game is WAITING_FOR_SEATS or SETTLED.
     *      Evicts bust seats first; aborts silently if tournament is over.
     */
    function startHand() external whenNotPaused {
        uint8 playableCount = _prepareHandStart();
        if (playableCount == 0) return;

        (uint8 sbSeat, uint8 bbSeat) = _resolveBlindSeats(playableCount);
        require(sbSeat != bbSeat, "N2");

        uint256 bbPost = _postBlind(bbSeat, bigBlind);
        uint256 initialPot = _postBlind(sbSeat, smallBlind) + bbPost;
        initialPot += _collectDeferredPosts(sbSeat, bbSeat);

        _initializeCurrentHand(bbSeat, bbPost, initialPot);

        emit HandStarted(currentHandId, smallBlind, bigBlind, buttonSeat);

        uint256 hcRequestId = _requestHoleCardRandomness();
        gameState = GameState.WAITING_VRF_HOLECARDS;
        emit VRFRequested(currentHandId, GameState.WAITING_VRF_HOLECARDS, hcRequestId);
    }

    function _prepareHandStart() internal returns (uint8 playableCount) {
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) {
            revert CannotStartHand();
        }

        _evictBustedSeats();
        if (gameState == GameState.TOURNAMENT_OVER) {
            return 0;
        }

        playableCount = _countPlayableSeats();
        require(playableCount >= 2, "N2");

        currentHandId++;
        _resetSeatHandState();
        _resetBoardAndVrfState();
    }

    function _resetSeatHandState() internal {
        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].isActive = _isSeatPlayable(i);
            seats[i].currentBet = 0;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
    }

    function _resetBoardAndVrfState() internal {
        for (uint8 i = 0; i < 5; i++) {
            communityCards[i] = UNDEALT;
        }
        pendingVRFRequestId = 0;
        pendingHoleCardVRFRequestId = 0;
        vrfRequestTimestamp = 0;
        showdownStartTimestamp = 0;
    }

    function _resolveBlindSeats(uint8 playableCount) internal view returns (uint8 sbSeat, uint8 bbSeat) {
        if (playableCount == 2 && _isSeatPlayable(buttonSeat)) {
            sbSeat = buttonSeat;
            bbSeat = _nextPlayableSeat(buttonSeat);
            return (sbSeat, bbSeat);
        }

        sbSeat = _nextPlayableSeat(buttonSeat);
        bbSeat = _nextPlayableSeat(sbSeat);
    }

    function _postBlind(uint8 seatIndex, uint256 blindAmount) internal returns (uint256 postAmount) {
        postAmount = blindAmount < seats[seatIndex].stack ? blindAmount : seats[seatIndex].stack;
        seats[seatIndex].stack -= postAmount;
        seats[seatIndex].currentBet = postAmount;
        seats[seatIndex].totalHandBet += postAmount;
        if (seats[seatIndex].stack == 0) {
            seats[seatIndex].isAllIn = true;
        }
    }

    function _collectDeferredPosts(uint8 sbSeat, uint8 bbSeat) internal returns (uint256 extraPot) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (needsPostBlind[i] && seats[i].isActive && i != bbSeat && i != sbSeat) {
                extraPot += _postBlind(i, bigBlind);
            }
            needsPostBlind[i] = false;
        }
    }

    function _initializeCurrentHand(uint8 bbSeat, uint256 bbPost, uint256 initialPot) internal {
        bool[MAX_SEATS] memory initialHasActed;
        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bbPost,
            lastRaiseSize: bigBlind,
            actorSeat: _nextActiveSeat(bbSeat),
            lastAggressor: bbSeat,
            actionsInRound: 0,
            sidePotCount: 0,
            hasActed: initialHasActed
        });

        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        lastActionBlock = block.number;
    }

    function _requestHoleCardRandomness() internal returns (uint256 requestId) {
        if (vrfAdapter == address(0)) {
            return 0;
        }

        requestId = IVRFAdapter(vrfAdapter).requestRandomness(
            tableId,
            currentHandId,
            uint8(GameState.WAITING_VRF_HOLECARDS)
        );
        pendingHoleCardVRFRequestId = requestId;
        vrfRequestTimestamp = block.timestamp;
    }

    /**
     * @notice Advance from WAITING_FOR_HOLECARDS to BETTING_PRE once all hole commits are submitted.
     * @dev Callable by anyone once the hole-card VRF has been fulfilled and all commits are on-chain.
     */
    function advanceToPreflop() external {
        require(gameState == GameState.WAITING_FOR_HOLECARDS, "HC");
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                require(holeCommits[currentHandId][i] != bytes32(0), "MC");
            }
        }
        gameState = GameState.BETTING_PRE;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        emit PreflopStarted(currentHandId, currentHand.actorSeat, actionDeadline);
        if (_countNonAllInActivePlayers() == 0) {
            _completeBettingRound();
        }
    }

    // ============ VRF Fulfillment ============

    /**
     * @notice Called by the VRF adapter to deliver randomness and advance game state.
     * @param requestId  The request ID being fulfilled.
     * @param randomness The random value from VRF.
     */
    function fulfillVRF(uint256 requestId, uint256 randomness) external {
        require(msg.sender == vrfAdapter, "V1");

        if (gameState == GameState.WAITING_VRF_HOLECARDS) {
            require(requestId == pendingHoleCardVRFRequestId, "V2");
            bytes32 randomnessHash = keccak256(abi.encodePacked(randomness));
            holeCardVRFRandomnessHash[currentHandId] = randomnessHash;
            pendingHoleCardVRFRequestId = 0;
            gameState = GameState.WAITING_FOR_HOLECARDS;
            emit HoleCardVRFFulfilled(currentHandId, randomnessHash);
            return;
        }

        require(
            gameState == GameState.WAITING_VRF_FLOP ||
            gameState == GameState.WAITING_VRF_TURN ||
            gameState == GameState.WAITING_VRF_RIVER,
            "V3"
        );
        require(requestId == pendingVRFRequestId, "V2");

        _dealCommunityCards(randomness);

        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].currentBet = 0;
            currentHand.hasActed[i] = false;
        }
        currentHand.currentBet = 0;
        currentHand.lastRaiseSize = bigBlind;
        currentHand.actionsInRound = 0;

        uint8 firstActor = _firstActiveAfterButton();
        currentHand.actorSeat = firstActor;

        GameState nextBettingState;
        if (gameState == GameState.WAITING_VRF_FLOP) {
            nextBettingState = GameState.BETTING_FLOP;
        } else if (gameState == GameState.WAITING_VRF_TURN) {
            nextBettingState = GameState.BETTING_TURN;
        } else {
            nextBettingState = GameState.BETTING_RIVER;
        }

        gameState = nextBettingState;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        pendingVRFRequestId = 0;
        showdownStartTimestamp = 0;

        if (_countNonAllInActivePlayers() <= 1) {
            _completeBettingRound();
        }
    }

    /**
     * @notice Re-request community card VRF after a timeout.
     * @dev Anyone can call after VRF_TIMEOUT has elapsed since the last request.
     */
    function reRequestVRF() external {
        require(
            gameState == GameState.WAITING_VRF_FLOP ||
            gameState == GameState.WAITING_VRF_TURN ||
            gameState == GameState.WAITING_VRF_RIVER,
            "V3"
        );
        require(vrfAdapter != address(0), "V4");
        if (block.timestamp <= vrfRequestTimestamp + VRF_TIMEOUT) revert VRFTimeoutNotReached();

        uint256 oldRequestId = pendingVRFRequestId;
        uint256 newRequestId = IVRFAdapter(vrfAdapter).requestRandomness(
            tableId,
            currentHandId,
            uint8(gameState)
        );
        pendingVRFRequestId = newRequestId;
        vrfRequestTimestamp = block.timestamp;

        emit VRFReRequested(currentHandId, gameState, oldRequestId, newRequestId);
    }

    /**
     * @notice Re-request hole card VRF after a timeout.
     * @dev Auto-aborts the hand if MAX_HOLE_CARD_VRF_RETRIES is exceeded.
     */
    function reRequestHoleCardVRF() external {
        require(gameState == GameState.WAITING_VRF_HOLECARDS, "V5");
        require(vrfAdapter != address(0), "V4");
        if (block.timestamp <= vrfRequestTimestamp + VRF_TIMEOUT) revert VRFTimeoutNotReached();

        uint256 handId = currentHandId;
        holeCardVRFRetryCount[handId]++;

        if (holeCardVRFRetryCount[handId] > MAX_HOLE_CARD_VRF_RETRIES) {
            _abortHandReturnBlinds("V6");
            return;
        }

        uint256 oldRequestId = pendingHoleCardVRFRequestId;
        uint256 newRequestId = IVRFAdapter(vrfAdapter).requestRandomness(
            tableId,
            handId,
            uint8(GameState.WAITING_VRF_HOLECARDS)
        );
        pendingHoleCardVRFRequestId = newRequestId;
        vrfRequestTimestamp = block.timestamp;

        emit HoleCardVRFReRequested(handId, oldRequestId, newRequestId);
    }

    // ============ Internal Hand Helpers ============

    /**
     * @notice Abort the current hand and return each seat's posted bets.
     * @dev Called when hole card VRF fails permanently (max retries exceeded).
     */
    function _abortHandReturnBlinds(string memory reason) internal {
        uint256 handId = currentHandId;

        for (uint8 i = 0; i < numSeats; i++) {
            uint256 betAmount = seats[i].totalHandBet;
            if (betAmount > 0) {
                seats[i].stack += betAmount;
                emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
            }
        }

        emit HandAborted(handId, reason);

        gameState = GameState.SETTLED;
        pendingHoleCardVRFRequestId = 0;
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

    /**
     * @notice Find first active, non-all-in player clockwise after the button.
     * @dev Used for post-flop action order. Returns numSeats if all-in situation.
     */
    function _firstActiveAfterButton() internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 seat = (buttonSeat + i) % numSeats;
            if (seats[seat].isActive && !seats[seat].isAllIn) {
                return seat;
            }
        }
        return numSeats;
    }

    /**
     * @notice Deal community cards from VRF randomness using Fisher-Yates partial shuffle.
     * @dev Excludes already-dealt community cards. Deals 3 (flop), 1 (turn), or 1 (river).
     */
    function _dealCommunityCards(uint256 randomness) internal {
        uint8[DECK_SIZE] memory deck;
        for (uint8 i = 0; i < DECK_SIZE; i++) deck[i] = i;

        uint8 alreadyDealt = 0;
        for (uint8 i = 0; i < 5; i++) {
            if (communityCards[i] != UNDEALT) {
                uint8 cardVal = communityCards[i];
                for (uint8 j = alreadyDealt; j < DECK_SIZE; j++) {
                    if (deck[j] == cardVal) {
                        deck[j] = deck[alreadyDealt];
                        deck[alreadyDealt] = cardVal;
                        break;
                    }
                }
                alreadyDealt++;
            }
        }

        uint8 newCount;
        uint8 startIndex;
        if (gameState == GameState.WAITING_VRF_FLOP) {
            newCount = 3;
            startIndex = 0;
        } else if (gameState == GameState.WAITING_VRF_TURN) {
            newCount = 1;
            startIndex = 3;
        } else {
            newCount = 1;
            startIndex = 4;
        }

        uint8 deckStart = alreadyDealt;
        uint8[] memory newCards = new uint8[](newCount);
        for (uint8 i = 0; i < newCount; i++) {
            uint256 hash = uint256(keccak256(abi.encodePacked(randomness, i)));
            uint8 available = DECK_SIZE - deckStart - i;
            uint8 pick = uint8(hash % available);
            uint8 j = deckStart + i + pick;
            uint8 tmp = deck[deckStart + i];
            deck[deckStart + i] = deck[j];
            deck[j] = tmp;
            communityCards[startIndex + i] = deck[deckStart + i];
            newCards[i] = deck[deckStart + i];
        }

        emit CommunityCardsDealt(currentHandId, gameState, newCards);
    }
}
