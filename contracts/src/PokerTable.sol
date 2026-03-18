// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";
import "./HandEvaluator.sol";

/**
 * @title PokerTable
 * @notice 9-player Hold'em table with on-chain betting and VRF-driven community cards.
 * @dev Supports up to 9 seats, fixed blinds, simplified betting rounds.
 */
contract PokerTable {
    // ============ Constants ============
    uint8 public constant MAX_SEATS = 9;
    uint256 public constant ACTION_TIMEOUT = 30 minutes;
    uint256 public constant VRF_TIMEOUT = 5 minutes;
    uint256 public constant SHOWDOWN_TIMEOUT = 10 minutes;

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
        SETTLED,            // Hand complete, ready for next hand
        TOURNAMENT_OVER     // Only one player with chips remains — tournament ended
    }

    enum ActionType {
        FOLD,
        CHECK,
        CALL,
        RAISE
    }

    // ============ Structs ============
    struct Seat {
        address owner;          // Wallet that owns this seat (receives hole cards)
        address operator;       // Wallet that submits actions (can be same as owner)
        uint256 stack;          // Current chip stack
        bool isActive;          // Still in the current hand (not folded)
        uint256 currentBet;     // Amount committed in current betting round
        bool isAllIn;           // True when player has committed their entire stack
        uint256 totalHandBet;   // Cumulative chips committed this hand (all streets)
    }

    struct Hand {
        uint256 handId;
        uint256 pot;
        uint256 currentBet;          // Largest bet in current round
        uint8 actorSeat;             // Seat index that must act next
        uint8 lastAggressor;         // Last seat that raised (for betting round logic)
        uint8 actionsInRound;        // Number of actions in current betting round
        uint8 sidePotCount;          // Number of active side pots
        bool[MAX_SEATS] hasActed;    // Whether each seat has acted in this round
    }

    struct SidePot {
        uint256 amount;
        bool[MAX_SEATS] eligible;    // Which seats are eligible for this pot
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
    event SeatEvicted(
        uint8 indexed seatIndex,
        address indexed owner
    );

    event SeatAllIn(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        uint256 totalBet
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
    event ShowdownTimedOut(
        uint256 indexed handId,
        uint8 activePlayers,
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

    /**
     * @notice Emitted when only one player remains with chips — tournament winner.
     */
    event TournamentWinner(
        address indexed winner,
        uint8 indexed seatIndex,
        uint256 finalStack
    );

    /**
     * @notice Emitted when a revealed hole card duplicates a community card.
     * @dev Indicates dealer integrity violation. Settlement proceeds regardless,
     *      but this event allows off-chain monitoring/auditing.
     */
    event CardIntegrityViolation(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        uint8 card,
        uint8 communityIndex
    );

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;

    GameState public gameState;
    uint256 public currentHandId;
    uint8 public buttonSeat; // Dealer button position (0..MAX_SEATS-1)

    Seat[MAX_SEATS] public seats;
    Hand public currentHand;
    SidePot[MAX_SEATS] public sidePots;   // At most MAX_SEATS side pots

    uint256 public actionDeadline;    // Timestamp after which forceTimeout can be called
    uint256 public lastActionBlock;   // For one-action-per-block enforcement

    address public vrfAdapter;           // Address of VRF adapter contract
    uint256 public pendingVRFRequestId;  // Current pending VRF request ID
    uint256 public vrfRequestTimestamp;  // When VRF was last requested
    uint256 public showdownStartTimestamp; // When showdown started (for liveness timeout)

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
        require(_tableId > 0, "Table ID must be > 0");
        require(_smallBlind > 0, "Small blind must be > 0");
        require(_bigBlind >= _smallBlind, "Big blind must be >= small blind");
        require(_vrfAdapter != address(0), "Invalid VRF adapter");
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        gameState = GameState.WAITING_FOR_SEATS;
    }

    // ============ Seat Management ============

    /**
     * @notice Register a seat at the table
     * @param seatIndex 0..MAX_SEATS-1
     * @param owner Address that owns this seat
     * @param operator Address that can submit actions
     */
    function registerSeat(
        uint8 seatIndex,
        address owner,
        address operator
    ) external payable {
        require(seatIndex < MAX_SEATS, "Invalid seat index");
        require(seats[seatIndex].owner == address(0), "Seat already taken");
        require(owner != address(0), "Owner cannot be zero");
        require(msg.value >= bigBlind * 10, "Buy-in too small");

        seats[seatIndex] = Seat({
            owner: owner,
            operator: operator == address(0) ? owner : operator,
            // Mid-hand registrations are queued for the next hand.
            stack: msg.value,
            isActive: false,
            currentBet: 0,
            isAllIn: false,
            totalHandBet: 0
        });

        emit SeatUpdated(seatIndex, owner, operator == address(0) ? owner : operator, msg.value);
    }

    /**
     * @notice Add more chips to an existing seat.
     * @dev Allowed only between hands.
     */
    function topUpSeat(uint8 seatIndex) external payable {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Top-up only between hands"
        );
        require(seatIndex < MAX_SEATS, "Invalid seat index");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");
        require(msg.value > 0, "Top-up amount is zero");

        seat.stack += msg.value;

        emit SeatUpdated(seatIndex, seat.owner, seat.operator, seat.stack);
        emit SeatTopUp(seatIndex, seat.owner, msg.value, seat.stack);
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
        (bool success, ) = payable(payoutRecipient).call{value: amount}("");
        require(success, "Cash-out transfer failed");

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
            (bool success, ) = payable(payoutRecipient).call{value: payoutAmount}("");
            require(success, "Leave transfer failed");
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
        _evictBustedSeats();
        if (gameState == GameState.TOURNAMENT_OVER) return; // winner already declared
        require(_countPlayableSeats() >= 2, "Need at least 2 funded seats");

        // Positions:
        //   Heads-up (2 players): button = SB, opponent = BB (standard heads-up rule).
        //     If buttonSeat is not playable (evicted), advance to first playable seat.
        //   3+ players: SB = first playable seat clockwise from button, BB = next.
        uint8 sbSeat;
        uint8 bbSeat;
        if (_countPlayableSeats() == 2 && _isSeatPlayable(buttonSeat)) {
            // Heads-up: button IS the SB
            sbSeat = buttonSeat;
            bbSeat = _nextPlayableSeat(buttonSeat);
        } else {
            sbSeat = _nextPlayableSeat(buttonSeat);
            bbSeat = _nextPlayableSeat(sbSeat);
        }
        require(sbSeat != bbSeat, "Need at least 2 funded seats");

        currentHandId++;

        // Reset seats for new hand
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].isActive = _isSeatPlayable(i);
            seats[i].currentBet = 0;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }

        // Reset community cards (255 = not dealt)
        for (uint8 i = 0; i < 5; i++) {
            communityCards[i] = 255;
        }
        pendingVRFRequestId = 0;
        vrfRequestTimestamp = 0;
        showdownStartTimestamp = 0;

        // Post blinds (all-in if stack < blind amount)
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

        // Pre-flop: first active seat after BB acts first.
        uint8 firstActor = _nextActiveSeat(bbSeat);

        bool[MAX_SEATS] memory initialHasActed;

        // Initialize hand state
        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bigBlind,
            actorSeat: firstActor,
            lastAggressor: bbSeat, // BB is considered the aggressor (posted blind)
            actionsInRound: 0,
            sidePotCount: 0,
            hasActed: initialHasActed
        });

        gameState = GameState.BETTING_PRE;
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        lastActionBlock = block.number;

        emit HandStarted(currentHandId, smallBlind, bigBlind, buttonSeat);
        emit SeatUpdated(sbSeat, seats[sbSeat].owner, seats[sbSeat].operator, seats[sbSeat].stack);
        emit SeatUpdated(bbSeat, seats[bbSeat].owner, seats[bbSeat].operator, seats[bbSeat].stack);
        emit PotUpdated(currentHandId, initialPot);

        // If all players are all-in from blind posting, auto-skip pre-flop betting
        if (_countNonAllInActivePlayers() == 0) {
            _completeBettingRound();
        }
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

        // All-in call: if stack < toCall, commit remaining stack
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
        uint256 stack = seats[seatIndex].stack;
        uint256 additional = raiseToAmount - seats[seatIndex].currentBet;

        // All-in: if stack <= additional, commit entire stack regardless of minRaise
        bool isAllInRaise = stack <= additional;

        if (!isAllInRaise) {
            require(raiseToAmount > currentHand.currentBet, "Raise must exceed current bet");
            // Minimum raise is the big blind or the last raise amount
            uint256 minRaise = currentHand.currentBet == 0 ? bigBlind * 2 : currentHand.currentBet * 2;
            require(raiseToAmount >= minRaise, "Raise too small");
            require(stack >= additional, "Insufficient stack");
        } else {
            // All-in raise: raiseToAmount is capped at currentBet + stack
            additional = stack;
            raiseToAmount = seats[seatIndex].currentBet + stack;
            require(raiseToAmount > currentHand.currentBet, "Raise must exceed current bet");
        }

        _recordAction();

        seats[seatIndex].stack -= additional;
        seats[seatIndex].currentBet = raiseToAmount;
        seats[seatIndex].totalHandBet += additional;
        currentHand.pot += additional;
        currentHand.currentBet = raiseToAmount;
        currentHand.lastAggressor = seatIndex;
        currentHand.hasActed[seatIndex] = true;

        if (seats[seatIndex].stack == 0) {
            seats[seatIndex].isAllIn = true;
            emit SeatAllIn(currentHandId, seatIndex, seats[seatIndex].currentBet);
        }

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
            // Pass action to next active, non-all-in player
            uint8 next = _nextActiveSeat(actorSeat);
            if (next == MAX_SEATS) {
                // All remaining active players are all-in → round is complete
                _completeBettingRound();
            } else {
                currentHand.actorSeat = next;
            }
        }
    }

    /**
     * @notice Check if the betting round is complete.
     * @dev All-in players are excluded from the check (they cannot act further).
     *      Round is complete when all non-all-in active players have acted and matched currentBet.
     */
    function _isBettingRoundComplete() internal view returns (bool) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].isActive && !seats[i].isAllIn) {
                if (!currentHand.hasActed[i]) return false;
                if (seats[i].currentBet != currentHand.currentBet) return false;
            }
        }
        return true;
    }

    /**
     * @notice Find the next active, non-all-in seat clockwise from the given seat.
     * @dev Returns MAX_SEATS (invalid) if no such seat exists (all remaining are all-in).
     */
    function _nextActiveSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 next = (fromSeat + i) % MAX_SEATS;
            if (seats[next].isActive && !seats[next].isAllIn) {
                return next;
            }
        }
        return MAX_SEATS; // sentinel: no eligible actor
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

    /**
     * @notice Count active players who can still act (not all-in).
     */
    function _countNonAllInActivePlayers() internal view returns (uint8 count) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].isActive && !seats[i].isAllIn) count++;
        }
    }

    /**
     * @notice Build side pots based on each player's total hand commitment.
     * @dev Called when transitioning to SHOWDOWN. Uses all seats' totalHandBet
     *      (including folded players) to compute pots, but only active seats are eligible.
     *      Side pot levels correspond to each unique all-in amount, plus the max bet.
     */
    function _buildSidePots() internal {
        // Collect all-in levels from active players
        uint256[MAX_SEATS] memory levels;
        uint8 levelCount = 0;

        for (uint8 i = 0; i < MAX_SEATS; i++) {
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

        // Add the maximum totalHandBet as the final level (captures non-all-in bets)
        uint256 maxBet = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].totalHandBet > maxBet) maxBet = seats[i].totalHandBet;
        }
        if (maxBet > 0 && (uniqueCount == 0 || uniqueLevels[uniqueCount - 1] < maxBet)) {
            uniqueLevels[uniqueCount++] = maxBet;
        }

        // Build side pots
        uint256 prevLevel = 0;
        uint8 potCount = 0;

        for (uint8 j = 0; j < uniqueCount; j++) {
            uint256 curLevel = uniqueLevels[j];
            uint256 potAmount = 0;
            bool[MAX_SEATS] memory eligible;

            for (uint8 i = 0; i < MAX_SEATS; i++) {
                uint256 bet = seats[i].totalHandBet;
                if (bet > prevLevel) {
                    uint256 cap = bet < curLevel ? bet : curLevel;
                    potAmount += cap - prevLevel;
                }
                // Eligible: seat is active AND committed at least curLevel
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
            revert("Invalid state for betting round completion");
        }

        emit BettingRoundComplete(currentHandId, currentState, nextState);

        if (nextState == GameState.SHOWDOWN) {
            _buildSidePots();
            gameState = GameState.SHOWDOWN;
            showdownStartTimestamp = block.timestamp;
        } else {
            gameState = nextState;
            showdownStartTimestamp = 0;

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

        // Post-flop: first active, non-all-in player after button acts first
        uint8 firstActor = _firstActiveAfterButton();
        currentHand.actorSeat = firstActor;

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
        showdownStartTimestamp = 0;

        // If ≤1 non-all-in active players remain, skip betting (community cards still dealt)
        if (_countNonAllInActivePlayers() <= 1) {
            _completeBettingRound();
        }
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
     * @notice Find first active, non-all-in player after the button (clockwise).
     * @dev Used for post-flop action order. Returns MAX_SEATS if everyone is all-in.
     */
    function _firstActiveAfterButton() internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 seat = (buttonSeat + i) % MAX_SEATS;
            if (seats[seat].isActive && !seats[seat].isAllIn) {
                return seat;
            }
        }
        return MAX_SEATS; // sentinel: all players are all-in
    }

    /**
     * @notice Derive and store community cards from VRF randomness using Fisher-Yates partial shuffle.
     * @dev Guarantees no duplicate community cards across all streets.
     *      Previously dealt cards are excluded from the shuffle by placing them at the front of the deck.
     */
    function _dealCommunityCards(uint256 randomness) internal {
        // Build deck of 52 cards
        uint8[52] memory deck;
        for (uint8 i = 0; i < 52; i++) deck[i] = i;

        // Move already-dealt community cards to the front (indices 0..alreadyDealt-1)
        uint8 alreadyDealt = 0;
        for (uint8 i = 0; i < 5; i++) {
            if (communityCards[i] != 255) {
                // Swap communityCards[i] to deck[alreadyDealt]
                uint8 cardVal = communityCards[i];
                // Find cardVal in deck (it's still at its natural position since we only swap forward)
                for (uint8 j = alreadyDealt; j < 52; j++) {
                    if (deck[j] == cardVal) {
                        deck[j] = deck[alreadyDealt];
                        deck[alreadyDealt] = cardVal;
                        break;
                    }
                }
                alreadyDealt++;
            }
        }

        // Determine how many new cards to deal
        uint8 newCount;
        uint8 startIndex;
        if (gameState == GameState.WAITING_VRF_FLOP) {
            newCount = 3;
            startIndex = 0;
        } else if (gameState == GameState.WAITING_VRF_TURN) {
            newCount = 1;
            startIndex = 3;
        } else { // WAITING_VRF_RIVER
            newCount = 1;
            startIndex = 4;
        }

        // Fisher-Yates partial shuffle for the new cards
        uint8 deckStart = alreadyDealt; // available cards start here
        uint8[] memory newCards = new uint8[](newCount);
        for (uint8 i = 0; i < newCount; i++) {
            uint256 hash = uint256(keccak256(abi.encodePacked(randomness, i)));
            uint8 available = 52 - deckStart - i;
            uint8 pick = uint8(hash % available);
            uint8 j = deckStart + i + pick;
            // Swap deck[deckStart+i] with deck[j]
            uint8 tmp = deck[deckStart + i];
            deck[deckStart + i] = deck[j];
            deck[j] = tmp;
            communityCards[startIndex + i] = deck[deckStart + i];
            newCards[i] = deck[deckStart + i];
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
        showdownStartTimestamp = 0;
        _advanceButton(); // Move button clockwise to next occupied seat

        // Reset hand state
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
        _evictBustedSeats();
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

        // Build score map indexed by seatIndex
        uint256[MAX_SEATS] memory scoresBySeat;
        bool[MAX_SEATS] memory revealedBySeat;
        uint8 revealedCount;
        uint8[MAX_SEATS] memory revSeats; // sequential list

        for (uint8 i = 0; i < MAX_SEATS; i++) {
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
            require(
                showdownStartTimestamp != 0 &&
                block.timestamp > showdownStartTimestamp + SHOWDOWN_TIMEOUT,
                "Showdown reveal window open"
            );
            _settleUnrevealedShowdown();
            return;
        }

        // Use side pot settlement if any side pots were built
        if (currentHand.sidePotCount > 0) {
            _settleShowdownWithSidePots(scoresBySeat, revealedBySeat, revSeats[0]);
            return;
        }

        // ── Single-pot settlement (no side pots) ──
        // Build sequential scores for backward-compat with _settleHandSplit
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

    /**
     * @notice Settle showdown with side pots.
     * @dev Each pot is awarded to the eligible revealed seat with the best hand.
     *      If only 1 eligible seat → that seat wins that pot (handles unmatched bet return).
     */
    function _settleShowdownWithSidePots(
        uint256[MAX_SEATS] memory scoresBySeat,
        bool[MAX_SEATS] memory revealedBySeat,
        uint8 fallbackWinner
    ) internal {
        uint8 potCount = currentHand.sidePotCount;
        uint8 firstWinner = MAX_SEATS;

        for (uint8 p = 0; p < potCount; p++) {
            uint256 potAmount = sidePots[p].amount;
            bool[MAX_SEATS] memory eligible = sidePots[p].eligible;

            // Find eligible AND revealed seats for this pot
            uint8 eligCount = 0;
            uint256 bestScore = 0;

            for (uint8 i = 0; i < MAX_SEATS; i++) {
                if (eligible[i] && revealedBySeat[i]) {
                    eligCount++;
                    if (scoresBySeat[i] > bestScore) bestScore = scoresBySeat[i];
                }
            }

            if (eligCount == 0) continue; // skip unwinnable pot (edge case)

            // Count tied winners
            uint8 winnerCount = 0;
            for (uint8 i = 0; i < MAX_SEATS; i++) {
                if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) winnerCount++;
            }

            uint256 share = potAmount / winnerCount;
            uint256 remainder = potAmount % winnerCount;

            // Primary winner for remainder: first clockwise from button
            uint8 primaryWinner = MAX_SEATS;
            for (uint8 i = 1; i <= MAX_SEATS; i++) {
                uint8 seat = (buttonSeat + i) % MAX_SEATS;
                if (eligible[seat] && revealedBySeat[seat] && scoresBySeat[seat] == bestScore) {
                    primaryWinner = seat;
                    break;
                }
            }

            for (uint8 i = 0; i < MAX_SEATS; i++) {
                if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) {
                    uint256 amount = share + (i == primaryWinner ? remainder : 0);
                    seats[i].stack += amount;
                    if (firstWinner == MAX_SEATS) firstWinner = i;
                    emit SeatUpdated(i, seats[i].owner, seats[i].operator, seats[i].stack);
                }
            }
        }

        if (firstWinner == MAX_SEATS) firstWinner = fallbackWinner;

        emit HandSettled(currentHandId, firstWinner, currentHand.pot);

        gameState = GameState.SETTLED;
        showdownStartTimestamp = 0;
        _advanceButton();
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
        _evictBustedSeats();
    }

    /**
     * @notice Distribute pot among tied winners.
     * @dev Remainder (if any) goes to the first winner clockwise from button.
     */
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
        showdownStartTimestamp = 0;
        _advanceButton();
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
        _evictBustedSeats();
    }

    /**
     * @notice Liveness fallback when no hole cards are revealed during showdown.
     * @dev After SHOWDOWN_TIMEOUT, split pot equally among active seats.
     *      Remainder goes to the first active seat clockwise from button.
     */
    function _settleUnrevealedShowdown() internal {
        uint8 activeCount;
        uint8[MAX_SEATS] memory activeSeats;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
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

        uint8 primaryWinner = 255;
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 seat = (buttonSeat + i) % MAX_SEATS;
            for (uint8 j = 0; j < activeCount; j++) {
                if (activeSeats[j] == seat) {
                    primaryWinner = seat;
                    break;
                }
            }
            if (primaryWinner != 255) break;
        }
        require(primaryWinner != 255, "No active players");

        for (uint8 i = 0; i < activeCount; i++) {
            uint8 seatIndex = activeSeats[i];
            uint256 payout = share;
            if (seatIndex == primaryWinner) {
                payout += remainder;
            }
            seats[seatIndex].stack += payout;
            emit SeatUpdated(
                seatIndex,
                seats[seatIndex].owner,
                seats[seatIndex].operator,
                seats[seatIndex].stack
            );
        }

        emit ShowdownTimedOut(currentHandId, activeCount, potAmount);
        emit HandSettled(currentHandId, primaryWinner, potAmount);

        gameState = GameState.SETTLED;
        showdownStartTimestamp = 0;
        _advanceButton();
        currentHand.pot = 0;
        currentHand.sidePotCount = 0;
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            seats[i].currentBet = 0;
            seats[i].isActive = false;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }
        _evictBustedSeats();
    }

    // ============ Hole Card Commit/Reveal ============

    /**
     * @notice Submit hole card commitment for a seat
     * @dev Should be called by dealer after dealing hole cards
     * @param handId The hand ID for which to submit commitment
     * @param seatIndex The seat index (0..MAX_SEATS-1)
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

        // Post-hoc integrity check: verify hole cards don't duplicate community cards.
        // Emits CardIntegrityViolation if a conflict is found (dealer integrity violation).
        // Settlement proceeds regardless — this only provides an auditable signal.
        for (uint8 ci = 0; ci < 5; ci++) {
            if (communityCards[ci] == 255) continue;
            if (card1 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card1, ci);
            }
            if (card2 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card2, ci);
            }
        }
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

    function getSidePotCount() external view returns (uint8) {
        return currentHand.sidePotCount;
    }

    function getSidePot(uint8 potIndex) external view returns (uint256 amount, bool[MAX_SEATS] memory eligible) {
        require(potIndex < currentHand.sidePotCount, "Invalid pot index");
        return (sidePots[potIndex].amount, sidePots[potIndex].eligible);
    }

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

    function canStartHand() external view returns (bool) {
        if (gameState == GameState.TOURNAMENT_OVER) return false;
        if (!(gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED)) return false;
        return _countPlayableSeats() >= 2;
    }

    function _isSeatOccupied(uint8 seatIndex) internal view returns (bool) {
        return seats[seatIndex].owner != address(0);
    }

    function _isSeatPlayable(uint8 seatIndex) internal view returns (bool) {
        return _isSeatOccupied(seatIndex) && seats[seatIndex].stack > 0;
    }

    function _countPlayableSeats() internal view returns (uint8 count) {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (_isSeatPlayable(i)) count++;
        }
    }

    function _nextPlayableSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 next = (fromSeat + i) % MAX_SEATS;
            if (_isSeatPlayable(next)) return next;
        }
        revert("No playable seat found");
    }

    function _nextOccupiedSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= MAX_SEATS; i++) {
            uint8 next = (fromSeat + i) % MAX_SEATS;
            if (_isSeatOccupied(next)) return next;
        }
        return fromSeat;
    }

    function _advanceButton() internal {
        buttonSeat = _nextOccupiedSeat(buttonSeat);
    }

    function _evictBustedSeats() internal {
        for (uint8 i = 0; i < MAX_SEATS; i++) {
            if (seats[i].owner != address(0) && seats[i].stack == 0) {
                address owner = seats[i].owner;
                delete seats[i];
                emit SeatUpdated(i, address(0), address(0), 0);
                emit SeatEvicted(i, owner);
            }
        }

        // Tournament winner check: exactly 1 player with chips remains
        uint8 playableCount = _countPlayableSeats();
        if (playableCount == 1) {
            for (uint8 i = 0; i < MAX_SEATS; i++) {
                if (_isSeatPlayable(i)) {
                    gameState = GameState.TOURNAMENT_OVER;
                    emit TournamentWinner(seats[i].owner, i, seats[i].stack);
                    break;
                }
            }
        }
    }
}
