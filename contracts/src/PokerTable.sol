// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";
import "./interfaces/IERC20.sol";
import "./HandEvaluator.sol";

/**
 * @title PokerTable
 * @notice 4-player Hold'em table with on-chain betting and VRF-driven community cards.
 * @dev Supports 4 seats, fixed blinds, simplified betting rounds.
 */
contract PokerTable {
    // ============ Constants ============
    uint8 public constant MAX_SEATS = 4;
    uint256 public constant ACTION_TIMEOUT = 30 minutes;
    uint256 public constant VRF_TIMEOUT = 5 minutes;

    // ============ Enums ============
    enum GameState {
        WAITING_FOR_SEATS,  // Waiting for all seats to be filled
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
        bool[4] hasActed;            // Whether each seat has acted in this round
    }

    // ============ Events ============
    event SeatUpdated(
        uint8 indexed seatIndex,
        address owner,
        address operator,
        uint256 stack
    );

    event SeatTopUp(
        uint8 indexed seatIndex,
        address indexed owner,
        uint256 amount,
        uint256 stackAfter
    );

    event SeatCashOut(
        uint8 indexed seatIndex,
        address indexed owner,
        address indexed recipient,
        uint256 amount,
        uint256 stackAfter
    );

    event SeatClosed(
        uint8 indexed seatIndex,
        address indexed owner,
        address indexed recipient,
        uint256 amount
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

    event VRFReRequested(
        uint256 indexed handId,
        GameState street,
        uint256 oldRequestId,
        uint256 newRequestId
    );

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;
    address public chipToken;

    GameState public gameState;
    uint256 public currentHandId;
    uint8 public buttonSeat; // Dealer button position (0..3)

    Seat[MAX_SEATS] public seats;
    Hand public currentHand;

    uint256 public actionDeadline;    // Timestamp after which forceTimeout can be called
    uint256 public lastActionBlock;   // For one-action-per-block enforcement

    address public vrfAdapter;           // Address of VRF adapter contract
    uint256 public pendingVRFRequestId;  // Current pending VRF request ID
    uint256 public vrfRequestTimestamp;  // When VRF was last requested

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
        address _vrfAdapter,
        address _chipToken
    ) {
        require(_bigBlind >= _smallBlind, "Big blind must be >= small blind");
        require(_chipToken != address(0), "Invalid chip token");
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        chipToken = _chipToken;
        gameState = GameState.WAITING_FOR_SEATS;
    }

    // ============ Seat Management ============

    /**
     * @notice Register a seat at the table
     * @param seatIndex 0..3
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
        require(
            IERC20(chipToken).transferFrom(owner, address(this), buyIn),
            "Buy-in transfer failed"
        );

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
     * @notice Add more chips to an existing seat.
     * @dev Allowed only between hands.
     */
    function topUpSeat(uint8 seatIndex, uint256 amount) external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Top-up only between hands"
        );
        require(seatIndex < MAX_SEATS, "Invalid seat index");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");
        require(amount > 0, "Top-up amount is zero");
        require(
            IERC20(chipToken).transferFrom(msg.sender, address(this), amount),
            "Top-up transfer failed"
        );

        seat.stack += amount;

        emit SeatUpdated(seatIndex, seat.owner, seat.operator, seat.stack);
        emit SeatTopUp(seatIndex, seat.owner, amount, seat.stack);
    }

    /**
     * @notice Withdraw chips from an occupied seat.
     * @dev Allowed only between hands.
     */
    function cashOutSeat(uint8 seatIndex, uint256 amount, address recipient) external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Cash-out only between hands"
        );
        require(seatIndex < MAX_SEATS, "Invalid seat index");
        require(amount > 0, "Cash-out amount is zero");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");
        require(seat.stack >= amount, "Insufficient seat stack");

        seat.stack -= amount;
        address payoutRecipient = recipient == address(0) ? seat.owner : recipient;
        require(IERC20(chipToken).transfer(payoutRecipient, amount), "Cash-out transfer failed");

        emit SeatUpdated(seatIndex, seat.owner, seat.operator, seat.stack);
        emit SeatCashOut(seatIndex, seat.owner, payoutRecipient, amount, seat.stack);
    }

    /**
     * @notice Close a seat and withdraw the remaining full stack.
     * @dev Allowed only between hands.
     */
    function leaveSeat(uint8 seatIndex, address recipient) external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Cannot leave during hand"
        );
        require(seatIndex < MAX_SEATS, "Invalid seat index");

        Seat memory seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");

        uint256 payoutAmount = seat.stack;
        address payoutRecipient = recipient == address(0) ? seat.owner : recipient;

        delete seats[seatIndex];

        if (payoutAmount > 0) {
            require(IERC20(chipToken).transfer(payoutRecipient, payoutAmount), "Leave transfer failed");
        }

        emit SeatUpdated(seatIndex, address(0), address(0), 0);
        emit SeatClosed(seatIndex, seat.owner, payoutRecipient, payoutAmount);
    }

    /**
     * @notice Check if all seats are filled
     */
    function allSeatsFilled() public view returns (bool) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].owner == address(0)) return false;
        }
        return true;
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
        require(allSeatsFilled(), "Need all seats filled");

        // Positions: SB = button+1, BB = button+2
        uint8 sbSeat = (buttonSeat + 1) % MAX_SEATS;
        uint8 bbSeat = (buttonSeat + 2) % MAX_SEATS;
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
        vrfRequestTimestamp = 0;

        // Post blinds
        seats[sbSeat].stack -= smallBlind;
        seats[sbSeat].currentBet = smallBlind;

        seats[bbSeat].stack -= bigBlind;
        seats[bbSeat].currentBet = bigBlind;

        uint256 initialPot = smallBlind + bigBlind;

        // Pre-flop: UTG (seat after BB) acts first
        uint8 firstActor = (buttonSeat + 3) % MAX_SEATS;

        // Initialize hand state
        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bigBlind,
            actorSeat: firstActor,
            lastAggressor: bbSeat, // BB is considered the aggressor (posted blind)
            actionsInRound: 0,
            hasActed: [false, false, false, false]
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

        // Check if only one active player remains
        (uint8 activeCount, uint8 lastActive) = _countActivePlayers();
        if (activeCount == 1) {
            _settleHand(lastActive);
        } else {
            _advanceAction(seatIndex);
        }
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

        // Reset all other active players' hasActed since they need to respond
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (i != seatIndex && seats[i].isActive) {
                currentHand.hasActed[i] = false;
            }
        }

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

            // Check if only one active player remains
            (uint8 activeCount, uint8 lastActive) = _countActivePlayers();
            if (activeCount == 1) {
                _settleHand(lastActive);
            } else {
                _advanceAction(seatIndex);
            }
        }
    }

    // ============ Internal Functions ============

    function _recordAction() internal {
        lastActionBlock = block.number;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        currentHand.actionsInRound++;
    }

    function _advanceAction(uint8 actorSeat) internal {
        // Check if betting round is complete
        if (_isBettingRoundComplete()) {
            _completeBettingRound();
        } else {
            // Pass action to next active player
            currentHand.actorSeat = _nextActiveSeat(actorSeat);
        }
    }

    /**
     * @notice Check if the betting round is complete.
     * @dev All active players must have acted and matched the current bet.
     */
    function _isBettingRoundComplete() internal view returns (bool) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].isActive) {
                if (!currentHand.hasActed[i]) return false;
                if (seats[i].currentBet != currentHand.currentBet) return false;
            }
        }
        return true;
    }

    /**
     * @notice Find the next active seat clockwise from the given seat.
     */
    function _nextActiveSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 next = (fromSeat + i) % MAX_SEATS;
            if (seats[next].isActive) {
                return next;
            }
        }
        revert("No active seat found");
    }

    /**
     * @notice Count active players and track the last active seat index.
     */
    function _countActivePlayers() internal view returns (uint8 count, uint8 lastActive) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].isActive) {
                count++;
                lastActive = i;
            }
        }
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
                vrfRequestTimestamp = block.timestamp;
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
        require(msg.sender == vrfAdapter, "Only VRF adapter");
        require(
            gameState == GameState.WAITING_VRF_FLOP ||
            gameState == GameState.WAITING_VRF_TURN ||
            gameState == GameState.WAITING_VRF_RIVER,
            "Not waiting for VRF"
        );

        require(requestId == pendingVRFRequestId, "Invalid request ID");

        // Derive community cards from randomness
        _dealCommunityCards(randomness);

        // Reset betting round state
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            currentHand.hasActed[i] = false;
        }
        currentHand.currentBet = 0;
        currentHand.actionsInRound = 0;

        // Post-flop: first active player after button acts first
        currentHand.actorSeat = _firstActiveAfterButton();

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
     * @notice Re-request VRF when the original fulfillment is delayed.
     * @dev Anyone can call this after VRF_TIMEOUT has passed since the original request.
     *      Issues a new request to the adapter and updates the pending request ID.
     */
    function reRequestVRF() external {
        require(
            gameState == GameState.WAITING_VRF_FLOP ||
            gameState == GameState.WAITING_VRF_TURN ||
            gameState == GameState.WAITING_VRF_RIVER,
            "Not waiting for VRF"
        );
        require(vrfAdapter != address(0), "No VRF adapter");
        require(block.timestamp > vrfRequestTimestamp + VRF_TIMEOUT, "VRF timeout not reached");

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
     * @notice Find first active player after the button (clockwise).
     * @dev Used for post-flop action order.
     */
    function _firstActiveAfterButton() internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 seat = (buttonSeat + i) % MAX_SEATS;
            if (seats[seat].isActive) {
                return seat;
            }
        }
        revert("No active player");
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
        buttonSeat = (buttonSeat + 1) % MAX_SEATS; // Move button clockwise

        // Reset hand state
        currentHand.pot = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
        }
    }

    /**
     * @notice Settle hand at showdown by evaluating revealed hole cards.
     * @dev Active seats that have not revealed forfeit (cannot win).
     *      At least one active seat must have revealed.
     *      On tie, pot is split evenly; remainder goes to first winner clockwise from button.
     */
    function settleShowdown() external {
        require(gameState == GameState.SHOWDOWN, "Not at showdown");

        uint256 handId = currentHandId;

        // Evaluate revealed active seats
        uint8 revealedCount;
        uint8[4] memory revSeats;
        uint256[4] memory scores;

        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].isActive && isHoleCardsRevealed[handId][i]) {
                uint8 c1 = _revealedHoleCards[handId][i][0];
                uint8 c2 = _revealedHoleCards[handId][i][1];
                scores[revealedCount] = HandEvaluator.evaluate(communityCards, c1, c2);
                revSeats[revealedCount] = i;
                revealedCount++;
            }
        }

        require(revealedCount > 0, "No revealed hole cards");

        // Single revealed seat wins by default
        if (revealedCount == 1) {
            _settleHand(revSeats[0]);
            return;
        }

        // Find best score
        uint256 bestScore;
        for (uint8 i = 0; i < revealedCount; i++) {
            if (scores[i] > bestScore) bestScore = scores[i];
        }

        // Count winners
        uint8 winnerCount;
        for (uint8 i = 0; i < revealedCount; i++) {
            if (scores[i] == bestScore) winnerCount++;
        }

        // Single winner
        if (winnerCount == 1) {
            for (uint8 i = 0; i < revealedCount; i++) {
                if (scores[i] == bestScore) {
                    _settleHand(revSeats[i]);
                    return;
                }
            }
        }

        // Tie: split pot
        _settleHandSplit(revSeats, scores, revealedCount, bestScore, winnerCount);
    }

    /**
     * @notice Distribute pot among tied winners.
     * @dev Remainder (if any) goes to the first winner clockwise from button.
     */
    function _settleHandSplit(
        uint8[4] memory revSeats,
        uint256[4] memory scores,
        uint8 revealedCount,
        uint256 bestScore,
        uint8 winnerCount
    ) internal {
        uint256 potAmount = currentHand.pot;
        uint256 share = potAmount / winnerCount;
        uint256 remainder = potAmount % winnerCount;

        // Primary winner: first clockwise from button among tied seats
        uint8 primaryWinner = 255;
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 seat = (buttonSeat + i) % MAX_SEATS;
            for (uint8 j = 0; j < revealedCount; j++) {
                if (revSeats[j] == seat && scores[j] == bestScore) {
                    primaryWinner = seat;
                    break;
                }
            }
            if (primaryWinner != 255) break;
        }

        // Distribute shares
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

        emit HandSettled(currentHandId, primaryWinner, potAmount);

        // Prepare for next hand
        gameState = GameState.SETTLED;
        buttonSeat = (buttonSeat + 1) % MAX_SEATS;
        currentHand.pot = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
        }
    }

    // ============ Hole Card Commit/Reveal ============

    /**
     * @notice Submit hole card commitment for a seat
     * @dev Should be called by dealer after dealing hole cards
     * @param handId The hand ID for which to submit commitment
     * @param seatIndex The seat index (0..3)
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
