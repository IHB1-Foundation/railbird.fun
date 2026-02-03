// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";

/**
 * @title PokerTable
 * @notice Heads-up Hold'em table with on-chain betting and VRF-driven community cards.
 * @dev MVP: 2 seats, fixed blinds, simplified betting rounds.
 */
contract PokerTable {
    // ============ Constants ============
    uint8 public constant MAX_SEATS = 2;
    uint256 public constant ACTION_TIMEOUT = 30 minutes;

    // ============ Enums ============
    enum GameState {
        WAITING_FOR_SEATS,  // Waiting for both seats to be filled
        HAND_INIT,          // Hand starting, blinds to be posted
        BETTING_PRE,        // Pre-flop betting
        WAITING_VRF_FLOP,   // Waiting for VRF to deal flop
        BETTING_FLOP,       // Flop betting
        WAITING_VRF_TURN,   // Waiting for VRF to deal turn
        BETTING_TURN,       // Turn betting
        WAITING_VRF_RIVER,  // Waiting for VRF to deal river
        BETTING_RIVER,      // River betting
        SHOWDOWN,           // Waiting for hole card reveals
        SETTLED             // Hand complete, ready for next hand
    }

    enum ActionType {
        FOLD,
        CHECK,
        CALL,
        RAISE
    }

    // ============ Structs ============
    struct Seat {
        address owner;       // Wallet that owns this seat (receives hole cards)
        address operator;    // Wallet that submits actions (can be same as owner)
        uint256 stack;       // Current chip stack
        bool isActive;       // Still in the current hand (not folded)
        uint256 currentBet;  // Amount committed in current betting round
    }

    struct Hand {
        uint256 handId;
        uint256 pot;
        uint256 currentBet;          // Largest bet in current round
        uint8 actorSeat;             // Seat index that must act next
        uint8 lastAggressor;         // Last seat that raised (for betting round logic)
        uint8 actionsInRound;        // Number of actions in current betting round
        bool[2] hasActed;            // Whether each seat has acted in this round
    }

    // ============ Events ============
    event SeatUpdated(
        uint8 indexed seatIndex,
        address owner,
        address operator,
        uint256 stack
    );

    event HandStarted(
        uint256 indexed handId,
        uint256 smallBlind,
        uint256 bigBlind,
        uint8 buttonSeat
    );

    event ActionTaken(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        ActionType action,
        uint256 amount,
        uint256 potAfter
    );

    event PotUpdated(
        uint256 indexed handId,
        uint256 pot
    );

    event BettingRoundComplete(
        uint256 indexed handId,
        GameState fromState,
        GameState toState
    );

    event VRFRequested(
        uint256 indexed handId,
        GameState street,
        uint256 requestId
    );

    event CommunityCardsDealt(
        uint256 indexed handId,
        GameState street,
        uint8[] cards
    );

    event HandSettled(
        uint256 indexed handId,
        uint8 winnerSeat,
        uint256 potAmount
    );

    event ForceTimeout(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        ActionType forcedAction
    );

    event HoleCommitSubmitted(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        bytes32 commitment
    );

    event HoleCardsRevealed(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        uint8 card1,
        uint8 card2
    );

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;

    GameState public gameState;
    uint256 public currentHandId;
    uint8 public buttonSeat; // Dealer button position (0 or 1)

    Seat[MAX_SEATS] public seats;
    Hand public currentHand;

    uint256 public actionDeadline;    // Timestamp after which forceTimeout can be called
    uint256 public lastActionBlock;   // For one-action-per-block enforcement

    address public vrfAdapter;        // Address of VRF adapter contract
    uint256 public pendingVRFRequestId;  // Current pending VRF request ID

    // Community cards (0-51 card encoding, 255 = not dealt)
    // Index: 0-2 = flop, 3 = turn, 4 = river
    uint8[5] public communityCards;

    // Hole card commitments: handId => seatIndex => commitment
    mapping(uint256 => mapping(uint8 => bytes32)) public holeCommits;

    // Revealed hole cards: handId => seatIndex => [card1, card2]
    mapping(uint256 => mapping(uint8 => uint8[2])) internal _revealedHoleCards;

    // Track if hole cards are revealed: handId => seatIndex => revealed
    mapping(uint256 => mapping(uint8 => bool)) public isHoleCardsRevealed;

    // ============ Modifiers ============
    modifier onlyOperator(uint8 seatIndex) {
        require(seatIndex < MAX_SEATS, "Invalid seat");
        require(
            msg.sender == seats[seatIndex].operator || msg.sender == seats[seatIndex].owner,
            "Not operator"
        );
        _;
    }

    modifier inBettingState() {
        require(
            gameState == GameState.BETTING_PRE ||
            gameState == GameState.BETTING_FLOP ||
            gameState == GameState.BETTING_TURN ||
            gameState == GameState.BETTING_RIVER,
            "Not in betting state"
        );
        _;
    }

    modifier isActorTurn(uint8 seatIndex) {
        require(currentHand.actorSeat == seatIndex, "Not your turn");
        _;
    }

    modifier withinDeadline() {
        require(block.timestamp <= actionDeadline, "Action deadline passed");
        _;
    }

    modifier oneActionPerBlock() {
        require(block.number > lastActionBlock, "One action per block");
        _;
    }

    // ============ Constructor ============
    constructor(
        uint256 _tableId,
        uint256 _smallBlind,
        uint256 _bigBlind,
        address _vrfAdapter
    ) {
        require(_bigBlind >= _smallBlind, "Big blind must be >= small blind");
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        gameState = GameState.WAITING_FOR_SEATS;
    }

    // ============ Seat Management ============

    /**
     * @notice Register a seat at the table
     * @param seatIndex 0 or 1
     * @param owner Address that owns this seat
     * @param operator Address that can submit actions
     * @param buyIn Initial chip stack
     */
    function registerSeat(
        uint8 seatIndex,
        address owner,
        address operator,
        uint256 buyIn
    ) external {
        require(gameState == GameState.WAITING_FOR_SEATS, "Game already started");
        require(seatIndex < MAX_SEATS, "Invalid seat index");
        require(seats[seatIndex].owner == address(0), "Seat already taken");
        require(owner != address(0), "Owner cannot be zero");
        require(buyIn >= bigBlind * 10, "Buy-in too small");

        seats[seatIndex] = Seat({
            owner: owner,
            operator: operator == address(0) ? owner : operator,
            stack: buyIn,
            isActive: false,
            currentBet: 0
        });

        emit SeatUpdated(seatIndex, owner, operator == address(0) ? owner : operator, buyIn);
    }

    /**
     * @notice Check if both seats are filled
     */
    function bothSeatsFilled() public view returns (bool) {
        return seats[0].owner != address(0) && seats[1].owner != address(0);
    }

    // ============ Hand Lifecycle ============

    /**
     * @notice Start a new hand. Can be called by anyone when conditions are met.
     */
    function startHand() external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Cannot start hand now"
        );
        require(bothSeatsFilled(), "Need both seats filled");

        // Both seats must have enough chips for blinds
        uint8 sbSeat = buttonSeat;
        uint8 bbSeat = 1 - buttonSeat;
        require(seats[sbSeat].stack >= smallBlind, "SB seat has insufficient stack");
        require(seats[bbSeat].stack >= bigBlind, "BB seat has insufficient stack");

        currentHandId++;

        // Reset seats for new hand
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].isActive = true;
            seats[i].currentBet = 0;
        }

        // Reset community cards (255 = not dealt)
        for (uint8 i = 0; i < 5; i++) {
            communityCards[i] = 255;
        }
        pendingVRFRequestId = 0;

        // Post blinds
        seats[sbSeat].stack -= smallBlind;
        seats[sbSeat].currentBet = smallBlind;

        seats[bbSeat].stack -= bigBlind;
        seats[bbSeat].currentBet = bigBlind;

        uint256 initialPot = smallBlind + bigBlind;

        // Initialize hand state
        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bigBlind,
            actorSeat: sbSeat, // SB acts first pre-flop in heads-up
            lastAggressor: bbSeat, // BB is considered the aggressor (posted blind)
            actionsInRound: 0,
            hasActed: [false, false]
        });

        gameState = GameState.BETTING_PRE;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        lastActionBlock = block.number;

        emit HandStarted(currentHandId, smallBlind, bigBlind, buttonSeat);
        emit SeatUpdated(sbSeat, seats[sbSeat].owner, seats[sbSeat].operator, seats[sbSeat].stack);
        emit SeatUpdated(bbSeat, seats[bbSeat].owner, seats[bbSeat].operator, seats[bbSeat].stack);
        emit PotUpdated(currentHandId, initialPot);
    }

    // ============ Actions ============

    /**
     * @notice Fold - forfeit the hand
     */
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

        emit ActionTaken(
            currentHandId,
            seatIndex,
            ActionType.FOLD,
            0,
            currentHand.pot
        );

        // Opponent wins immediately
        uint8 winnerSeat = 1 - seatIndex;
        _settleHand(winnerSeat);
    }

    /**
     * @notice Check - pass action without betting (only if current bet is matched)
     */
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

        emit ActionTaken(
            currentHandId,
            seatIndex,
            ActionType.CHECK,
            0,
            currentHand.pot
        );

        _advanceAction(seatIndex);
    }

    /**
     * @notice Call - match the current bet
     */
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
        require(seats[seatIndex].stack >= toCall, "Insufficient stack");

        _recordAction();

        seats[seatIndex].stack -= toCall;
        seats[seatIndex].currentBet = currentHand.currentBet;
        currentHand.pot += toCall;
        currentHand.hasActed[seatIndex] = true;

        emit ActionTaken(
            currentHandId,
            seatIndex,
            ActionType.CALL,
            toCall,
            currentHand.pot
        );
        emit PotUpdated(currentHandId, currentHand.pot);
        emit SeatUpdated(seatIndex, seats[seatIndex].owner, seats[seatIndex].operator, seats[seatIndex].stack);

        _advanceAction(seatIndex);
    }

    /**
     * @notice Raise - increase the bet
     * @param raiseToAmount Total bet amount for this seat (not additional amount)
     */
    function raise(uint8 seatIndex, uint256 raiseToAmount)
        external
        onlyOperator(seatIndex)
        inBettingState
        isActorTurn(seatIndex)
        withinDeadline
        oneActionPerBlock
    {
        require(raiseToAmount > currentHand.currentBet, "Raise must exceed current bet");

        // Minimum raise is the big blind or the last raise amount
        uint256 minRaise = currentHand.currentBet + bigBlind;
        require(raiseToAmount >= minRaise, "Raise too small");

        uint256 additional = raiseToAmount - seats[seatIndex].currentBet;
        require(seats[seatIndex].stack >= additional, "Insufficient stack");

        _recordAction();

        seats[seatIndex].stack -= additional;
        seats[seatIndex].currentBet = raiseToAmount;
        currentHand.pot += additional;
        currentHand.currentBet = raiseToAmount;
        currentHand.lastAggressor = seatIndex;
        currentHand.hasActed[seatIndex] = true;

        // Reset opponent's hasActed since they need to respond to the raise
        currentHand.hasActed[1 - seatIndex] = false;

        emit ActionTaken(
            currentHandId,
            seatIndex,
            ActionType.RAISE,
            raiseToAmount,
            currentHand.pot
        );
        emit PotUpdated(currentHandId, currentHand.pot);
        emit SeatUpdated(seatIndex, seats[seatIndex].owner, seats[seatIndex].operator, seats[seatIndex].stack);

        _advanceAction(seatIndex);
    }

    // ============ Timeout Enforcement ============

    /**
     * @notice Force timeout when a player fails to act within the deadline.
     * @dev Anyone can call this after the action deadline has passed.
     *      If check is legal, auto-check. Otherwise, auto-fold.
     */
    function forceTimeout() external inBettingState oneActionPerBlock {
        require(block.timestamp > actionDeadline, "Deadline not passed");

        uint8 seatIndex = currentHand.actorSeat;

        // Determine if check is legal (current bet already matched)
        bool canCheckNow = seats[seatIndex].currentBet == currentHand.currentBet;

        _recordAction();

        if (canCheckNow) {
            // Auto-check
            currentHand.hasActed[seatIndex] = true;

            emit ForceTimeout(currentHandId, seatIndex, ActionType.CHECK);
            emit ActionTaken(
                currentHandId,
                seatIndex,
                ActionType.CHECK,
                0,
                currentHand.pot
            );

            _advanceAction(seatIndex);
        } else {
            // Auto-fold
            seats[seatIndex].isActive = false;

            emit ForceTimeout(currentHandId, seatIndex, ActionType.FOLD);
            emit ActionTaken(
                currentHandId,
                seatIndex,
                ActionType.FOLD,
                0,
                currentHand.pot
            );

            // Opponent wins immediately
            uint8 winnerSeat = 1 - seatIndex;
            _settleHand(winnerSeat);
        }
    }

    // ============ Internal Functions ============

    function _recordAction() internal {
        lastActionBlock = block.number;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        currentHand.actionsInRound++;
    }

    function _advanceAction(uint8 actorSeat) internal {
        uint8 opponentSeat = 1 - actorSeat;

        // Check if betting round is complete
        if (_isBettingRoundComplete()) {
            _completeBettingRound();
        } else {
            // Pass action to opponent
            currentHand.actorSeat = opponentSeat;
        }
    }

    function _isBettingRoundComplete() internal view returns (bool) {
        // Both players must have acted
        if (!currentHand.hasActed[0] || !currentHand.hasActed[1]) {
            return false;
        }
        // Both players must have matched the current bet
        if (seats[0].currentBet != currentHand.currentBet) return false;
        if (seats[1].currentBet != currentHand.currentBet) return false;
        return true;
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
            revert("Invalid state for betting round completion");
        }

        emit BettingRoundComplete(currentHandId, currentState, nextState);

        if (nextState == GameState.SHOWDOWN) {
            gameState = GameState.SHOWDOWN;
            // For MVP, we'll need a separate call to settle or auto-settle
            // In full version, this triggers showdown reveal process
        } else {
            gameState = nextState;

            // Request VRF for next street's community cards
            uint256 requestId = 0;
            if (vrfAdapter != address(0)) {
                requestId = IVRFAdapter(vrfAdapter).requestRandomness(
                    tableId,
                    currentHandId,
                    uint8(nextState)
                );
                pendingVRFRequestId = requestId;
            }

            emit VRFRequested(currentHandId, nextState, requestId);
        }
    }

    /**
     * @notice Called by VRF adapter to provide randomness and advance to next betting round.
     * @param requestId The VRF request ID being fulfilled
     * @param randomness The random value from VRF
     */
    function fulfillVRF(uint256 requestId, uint256 randomness) external {
        // In production: require(msg.sender == vrfAdapter, "Only VRF adapter");
        require(
            gameState == GameState.WAITING_VRF_FLOP ||
            gameState == GameState.WAITING_VRF_TURN ||
            gameState == GameState.WAITING_VRF_RIVER,
            "Not waiting for VRF"
        );

        // Verify request ID if adapter is set
        if (vrfAdapter != address(0)) {
            require(requestId == pendingVRFRequestId, "Invalid request ID");
        }

        // Derive community cards from randomness
        _dealCommunityCards(randomness);

        // Reset betting round state
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            currentHand.hasActed[i] = false;
        }
        currentHand.currentBet = 0;
        currentHand.actionsInRound = 0;

        // Post-flop: non-button (BB) acts first
        currentHand.actorSeat = 1 - buttonSeat;

        // Determine next betting state based on current VRF state
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
    }

    /**
     * @notice Derive and store community cards from VRF randomness.
     * @dev Cards are 0-51. We use simple mod-based derivation for MVP.
     *      In production, would need more sophisticated shuffle to avoid duplicates
     *      with hole cards and previously dealt community cards.
     */
    function _dealCommunityCards(uint256 randomness) internal {
        uint8[] memory newCards;

        if (gameState == GameState.WAITING_VRF_FLOP) {
            // Deal 3 flop cards
            newCards = new uint8[](3);
            for (uint8 i = 0; i < 3; i++) {
                communityCards[i] = uint8(uint256(keccak256(abi.encodePacked(randomness, i))) % 52);
                newCards[i] = communityCards[i];
            }
        } else if (gameState == GameState.WAITING_VRF_TURN) {
            // Deal turn card
            newCards = new uint8[](1);
            communityCards[3] = uint8(uint256(keccak256(abi.encodePacked(randomness, uint8(3)))) % 52);
            newCards[0] = communityCards[3];
        } else if (gameState == GameState.WAITING_VRF_RIVER) {
            // Deal river card
            newCards = new uint8[](1);
            communityCards[4] = uint8(uint256(keccak256(abi.encodePacked(randomness, uint8(4)))) % 52);
            newCards[0] = communityCards[4];
        }

        emit CommunityCardsDealt(currentHandId, gameState, newCards);
    }

    function _settleHand(uint8 winnerSeat) internal {
        require(winnerSeat < MAX_SEATS, "Invalid winner");

        uint256 potAmount = currentHand.pot;
        seats[winnerSeat].stack += potAmount;

        emit SeatUpdated(winnerSeat, seats[winnerSeat].owner, seats[winnerSeat].operator, seats[winnerSeat].stack);
        emit HandSettled(currentHandId, winnerSeat, potAmount);

        // Prepare for next hand
        gameState = GameState.SETTLED;
        buttonSeat = 1 - buttonSeat; // Move button

        // Reset hand state
        currentHand.pot = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
        }
    }

    /**
     * @notice Settle hand at showdown - for MVP, winner is passed in
     * @dev In production, this would verify hole card reveals and compute winner
     */
    function settleShowdown(uint8 winnerSeat) external {
        require(gameState == GameState.SHOWDOWN, "Not at showdown");
        // In production: verify hole card reveals here
        _settleHand(winnerSeat);
    }

    // ============ Hole Card Commit/Reveal ============

    /**
     * @notice Submit hole card commitment for a seat
     * @dev Should be called by dealer after dealing hole cards
     * @param handId The hand ID for which to submit commitment
     * @param seatIndex The seat index (0 or 1)
     * @param commitment The keccak256 hash of (handId, seatIndex, card1, card2, salt)
     */
    function submitHoleCommit(
        uint256 handId,
        uint8 seatIndex,
        bytes32 commitment
    ) external {
        require(seatIndex < MAX_SEATS, "Invalid seat");
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(commitment != bytes32(0), "Empty commitment");
        require(holeCommits[handId][seatIndex] == bytes32(0), "Commitment already exists");

        // Can only submit during active hand (not after settlement)
        // For current hand: allowed from BETTING_PRE onwards until showdown settlement
        if (handId == currentHandId) {
            require(
                gameState != GameState.WAITING_FOR_SEATS &&
                gameState != GameState.SETTLED,
                "Cannot submit commit now"
            );
        }

        holeCommits[handId][seatIndex] = commitment;

        emit HoleCommitSubmitted(handId, seatIndex, commitment);
    }

    /**
     * @notice Reveal hole cards at showdown
     * @dev Verifies the commitment matches the revealed cards
     * @param handId The hand ID
     * @param seatIndex The seat index
     * @param card1 First hole card (0-51)
     * @param card2 Second hole card (0-51)
     * @param salt The salt used in the commitment
     */
    function revealHoleCards(
        uint256 handId,
        uint8 seatIndex,
        uint8 card1,
        uint8 card2,
        bytes32 salt
    ) external {
        require(seatIndex < MAX_SEATS, "Invalid seat");
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(card1 < 52 && card2 < 52, "Invalid card value");
        require(card1 != card2, "Duplicate cards");

        bytes32 commitment = holeCommits[handId][seatIndex];
        require(commitment != bytes32(0), "No commitment found");
        require(!isHoleCardsRevealed[handId][seatIndex], "Already revealed");

        // For current hand, can only reveal at/after showdown
        if (handId == currentHandId) {
            require(
                gameState == GameState.SHOWDOWN || gameState == GameState.SETTLED,
                "Not at showdown"
            );
        }

        // Verify commitment
        bytes32 computedCommitment = keccak256(
            abi.encodePacked(handId, seatIndex, card1, card2, salt)
        );
        require(computedCommitment == commitment, "Invalid reveal");

        // Store revealed cards
        _revealedHoleCards[handId][seatIndex] = [card1, card2];
        isHoleCardsRevealed[handId][seatIndex] = true;

        emit HoleCardsRevealed(handId, seatIndex, card1, card2);
    }

    /**
     * @notice Get revealed hole cards for a hand/seat
     * @param handId The hand ID
     * @param seatIndex The seat index
     * @return card1 First hole card (255 if not revealed)
     * @return card2 Second hole card (255 if not revealed)
     */
    function getRevealedHoleCards(
        uint256 handId,
        uint8 seatIndex
    ) external view returns (uint8 card1, uint8 card2) {
        require(seatIndex < MAX_SEATS, "Invalid seat");

        if (!isHoleCardsRevealed[handId][seatIndex]) {
            return (255, 255);
        }

        return (_revealedHoleCards[handId][seatIndex][0], _revealedHoleCards[handId][seatIndex][1]);
    }

    // ============ View Functions ============

    function getSeat(uint8 seatIndex) external view returns (Seat memory) {
        require(seatIndex < MAX_SEATS, "Invalid seat");
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

    function getActionDeadline() external view returns (uint256) {
        return actionDeadline;
    }

    function canCheck(uint8 seatIndex) external view returns (bool) {
        if (seatIndex >= MAX_SEATS) return false;
        return seats[seatIndex].currentBet == currentHand.currentBet;
    }

    function getAmountToCall(uint8 seatIndex) external view returns (uint256) {
        if (seatIndex >= MAX_SEATS) return 0;
        if (seats[seatIndex].currentBet >= currentHand.currentBet) return 0;
        return currentHand.currentBet - seats[seatIndex].currentBet;
    }

    function getCommunityCards() external view returns (uint8[5] memory) {
        return communityCards;
    }
}
