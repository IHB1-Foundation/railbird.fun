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
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) {
            revert CannotStartHand();
        }
        _evictBustedSeats();
        if (gameState == GameState.TOURNAMENT_OVER) return;
        require(_countPlayableSeats() >= 2, "Need at least 2 funded seats");

        uint8 sbSeat;
        uint8 bbSeat;
        if (_countPlayableSeats() == 2 && _isSeatPlayable(buttonSeat)) {
            sbSeat = buttonSeat;
            bbSeat = _nextPlayableSeat(buttonSeat);
        } else {
            sbSeat = _nextPlayableSeat(buttonSeat);
            bbSeat = _nextPlayableSeat(sbSeat);
        }
        require(sbSeat != bbSeat, "Need at least 2 funded seats");

        currentHandId++;

        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].isActive = _isSeatPlayable(i);
            seats[i].currentBet = 0;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }

        for (uint8 i = 0; i < 5; i++) {
            communityCards[i] = UNDEALT;
        }
        pendingVRFRequestId = 0;
        pendingHoleCardVRFRequestId = 0;
        vrfRequestTimestamp = 0;
        showdownStartTimestamp = 0;

        uint256 sbPost = smallBlind < seats[sbSeat].stack ? smallBlind : seats[sbSeat].stack;
        seats[sbSeat].stack -= sbPost;
        seats[sbSeat].currentBet = sbPost;
        seats[sbSeat].totalHandBet += sbPost;
        if (seats[sbSeat].stack == 0) seats[sbSeat].isAllIn = true;

        uint256 bbPost = bigBlind < seats[bbSeat].stack ? bigBlind : seats[bbSeat].stack;
        seats[bbSeat].stack -= bbPost;
        seats[bbSeat].currentBet = bbPost;
        seats[bbSeat].totalHandBet += bbPost;
        if (seats[bbSeat].stack == 0) seats[bbSeat].isAllIn = true;

        uint256 initialPot = sbPost + bbPost;

        for (uint8 i = 0; i < numSeats; i++) {
            if (needsPostBlind[i] && seats[i].isActive && i != bbSeat && i != sbSeat) {
                uint256 postAmount = bigBlind < seats[i].stack ? bigBlind : seats[i].stack;
                seats[i].stack -= postAmount;
                seats[i].currentBet = postAmount;
                seats[i].totalHandBet += postAmount;
                if (seats[i].stack == 0) seats[i].isAllIn = true;
                initialPot += postAmount;
                emit PostBlindPosted(currentHandId, i, postAmount);
                emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
            }
            needsPostBlind[i] = false;
        }

        uint8 firstActor = _nextActiveSeat(bbSeat);
        bool[MAX_SEATS] memory initialHasActed;

        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bbPost,
            lastRaiseSize: bigBlind,
            actorSeat: firstActor,
            lastAggressor: bbSeat,
            actionsInRound: 0,
            sidePotCount: 0,
            hasActed: initialHasActed
        });

        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        lastActionBlock = block.number;

        emit HandStarted(currentHandId, smallBlind, bigBlind, buttonSeat);
        emit SeatUpdated(sbSeat, seats[sbSeat].owner, seats[sbSeat].operator, seats[sbSeat].stack);
        emit SeatUpdated(bbSeat, seats[bbSeat].owner, seats[bbSeat].operator, seats[bbSeat].stack);
        emit PotUpdated(currentHandId, initialPot);

        uint256 hcRequestId = 0;
        if (vrfAdapter != address(0)) {
            hcRequestId = IVRFAdapter(vrfAdapter).requestRandomness(
                tableId,
                currentHandId,
                uint8(GameState.WAITING_VRF_HOLECARDS)
            );
            pendingHoleCardVRFRequestId = hcRequestId;
            vrfRequestTimestamp = block.timestamp;
        }
        gameState = GameState.WAITING_VRF_HOLECARDS;

        emit VRFRequested(currentHandId, GameState.WAITING_VRF_HOLECARDS, hcRequestId);
    }

    /**
     * @notice Advance from WAITING_FOR_HOLECARDS to BETTING_PRE once all hole commits are submitted.
     * @dev Callable by anyone once the hole-card VRF has been fulfilled and all commits are on-chain.
     */
    function advanceToPreflop() external {
        require(gameState == GameState.WAITING_FOR_HOLECARDS, "Not waiting for hole cards");
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                require(holeCommits[currentHandId][i] != bytes32(0), "Missing hole commit");
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
        require(msg.sender == vrfAdapter, "Only VRF adapter");

        if (gameState == GameState.WAITING_VRF_HOLECARDS) {
            require(requestId == pendingHoleCardVRFRequestId, "Invalid request ID");
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
            "Not waiting for VRF"
        );
        require(requestId == pendingVRFRequestId, "Invalid request ID");

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
            "Not waiting for VRF"
        );
        require(vrfAdapter != address(0), "No VRF adapter");
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
        require(gameState == GameState.WAITING_VRF_HOLECARDS, "Not waiting for hole card VRF");
        require(vrfAdapter != address(0), "No VRF adapter");
        if (block.timestamp <= vrfRequestTimestamp + VRF_TIMEOUT) revert VRFTimeoutNotReached();

        uint256 handId = currentHandId;
        holeCardVRFRetryCount[handId]++;

        if (holeCardVRFRetryCount[handId] > MAX_HOLE_CARD_VRF_RETRIES) {
            _abortHandReturnBlinds("Max VRF retries exceeded");
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

    // ============ AI Decision Commitment ============

    /**
     * @notice Commit the hash of an AI decision before revealing it.
     * @dev Called by the operator before (or alongside) submitting an action.
     *      commitHash = keccak256(abi.encode(handId, seatIndex, action, reasoning, salt))
     *      A new commit overwrites any previous one for the same hand/seat (latest wins).
     * @param seatIndex     The seat index the operator controls.
     * @param commitHash    The precomputed commitment hash.
     * @param reasoningHash keccak256 of the full reasoning payload JSON (0 if not available).
     */
    function commitDecision(uint8 seatIndex, bytes32 commitHash, bytes32 reasoningHash) external {
        require(seatIndex < numSeats, "Invalid seat");
        _checkOperator(seatIndex);
        require(commitHash != bytes32(0), "Empty commitment");
        decisionCommits[currentHandId][seatIndex] = commitHash;
        reasoningHashes[currentHandId][seatIndex] = reasoningHash;
        emit DecisionCommitted(currentHandId, seatIndex, commitHash, reasoningHash);
    }

    /**
     * @notice Get the reasoning hash for a specific hand/seat decision.
     */
    function getReasoningHash(uint256 handId, uint8 seatIndex) external view returns (bytes32) {
        return reasoningHashes[handId][seatIndex];
    }

    /**
     * @notice Reveal and verify a previously committed AI decision.
     * @dev Only callable after the hand is SETTLED. Verifies the commitment and emits DecisionRevealed.
     * @param handId    The hand ID the decision was made in.
     * @param seatIndex The seat index.
     * @param action    The action string ("fold", "check", "call", "raise").
     * @param reasoning The natural-language reasoning string.
     * @param salt      The random salt used when computing commitHash.
     */
    function revealDecision(
        uint256 handId,
        uint8 seatIndex,
        string calldata action,
        string calldata reasoning,
        bytes32 salt
    ) external {
        require(gameState == GameState.SETTLED || gameState == GameState.WAITING_FOR_SEATS, "Hand not settled");
        bytes32 stored = decisionCommits[handId][seatIndex];
        require(stored != bytes32(0), "No commitment found");
        bytes32 expected = keccak256(abi.encode(handId, seatIndex, action, reasoning, salt));
        require(expected == stored, "Commitment mismatch");
        emit DecisionRevealed(handId, seatIndex, action, reasoning);
    }

    // ============ View Getters ============

    function getSeat(uint8 seatIndex) external view returns (Seat memory) {
        require(seatIndex < numSeats, "Invalid seat");
        return seats[seatIndex];
    }

    function getHandInfo() external view returns (
        uint256 handId,
        uint256 pot,
        uint256 currentBetAmount,
        uint8 actorSeat,
        GameState state
    ) {
        return (
            currentHand.handId,
            currentHand.pot,
            currentHand.currentBet,
            currentHand.actorSeat,
            gameState
        );
    }

    function getSidePotCount() external view returns (uint8) {
        return currentHand.sidePotCount;
    }

    function getSidePot(uint8 potIndex) external view returns (uint256 amount, bool[MAX_SEATS] memory eligible) {
        require(potIndex < currentHand.sidePotCount, "Invalid pot index");
        return (sidePots[potIndex].amount, sidePots[potIndex].eligible);
    }

    function getActionDeadline() external view returns (uint256) {
        return actionDeadline;
    }

    function canCheck(uint8 seatIndex) external view returns (bool) {
        if (seatIndex >= numSeats) return false;
        return seats[seatIndex].currentBet == currentHand.currentBet;
    }

    function getAmountToCall(uint8 seatIndex) external view returns (uint256) {
        if (seatIndex >= numSeats) return 0;
        if (seats[seatIndex].currentBet >= currentHand.currentBet) return 0;
        return currentHand.currentBet - seats[seatIndex].currentBet;
    }

    function getCommunityCards() external view returns (uint8[5] memory) {
        return communityCards;
    }

    function canStartHand() external view returns (bool) {
        if (gameState == GameState.TOURNAMENT_OVER) return false;
        if (gameState == GameState.WAITING_VRF_HOLECARDS) return false;
        if (gameState == GameState.WAITING_FOR_HOLECARDS) return false;
        if (!(gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED)) return false;
        return _countPlayableSeats() >= 2;
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
