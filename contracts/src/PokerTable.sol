// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";
import "./interfaces/IERC20.sol";
import "./interfaces/IKYCSBTChecker.sol";
import "./HandEvaluator.sol";
import { ShuffleVerifier, SeatReveal } from "./ShuffleVerifier.sol";
import { SafeTransfer } from "./lib/SafeTransfer.sol";

/// @dev Minimal interface for PlayerRegistry ownership/operator lookups.
interface IPlayerRegistry {
    function agents(address agent) external view returns (
        address vault,
        address table,
        address owner,
        address operator,
        string memory metaURI,
        bool isRegistered
    );
}

/// @dev Minimal interface for vault settlement callbacks.
interface IPlayerVaultMinimal {
    function onSettlement(uint256 handId, int256 pnl) external;
}

/// @dev Minimal interface for vault escrow tracking.
interface IPlayerVaultEscrow {
    function fundBuyIn(address table, uint256 amount) external;
    function releaseEscrow(address table, uint256 amount) external;
}

/**
 * @title PokerTable
 * @notice 9-player Hold'em table with on-chain betting and VRF-driven community cards.
 * @dev Supports up to 9 seats, fixed blinds, simplified betting rounds.
 */
contract PokerTable {
    using SafeTransfer for address;

    // ============ Constants ============
    /// @dev Maximum array size — arrays are always sized to 9; unused slots are ignored.
    uint8 public constant MAX_SEATS = 9;
    /// @dev Sentinel value for an undealt card slot.
    uint8 public constant UNDEALT = 255;
    /// @dev Standard 52-card deck size.
    uint8 public constant DECK_SIZE = 52;

    // ============ Immutable Seat Config ============
    /// @notice Active seat count for this table (2–MAX_SEATS). Set at deploy.
    uint8 public immutable numSeats;

    // ============ Immutable Timeout Config ============
    /// @notice Per-action deadline (set at deploy). Range: 1 min – 60 min.
    uint256 public immutable ACTION_TIMEOUT;
    /// @notice VRF fulfillment deadline (set at deploy). Range: 30 s – 30 min.
    uint256 public immutable VRF_TIMEOUT;
    /// @notice Showdown reveal deadline (set at deploy). Range: 1 min – 60 min.
    uint256 public immutable SHOWDOWN_TIMEOUT;

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
        SHOWDOWN,              // Waiting for hole card reveals
        SETTLED,               // Hand complete, ready for next hand
        TOURNAMENT_OVER,       // Only one player with chips remains — tournament ended
        WAITING_VRF_HOLECARDS, // Waiting for VRF to seed hole card shuffle
        WAITING_FOR_HOLECARDS  // VRF received; waiting for dealer to submit hole commits
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
        uint256 lastRaiseSize;       // Size of the last raise (for min-raise enforcement)
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
    event PostBlindPosted(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        uint256 amount
    );

    event CardIntegrityViolation(
        uint256 indexed handId,
        uint8 indexed seatIndex,
        uint8 card,
        uint8 communityIndex
    );

    /// @notice Emitted when a seat registration passes the KYC SBT check
    event KYCCheckPassed(address indexed player, uint8 seatIndex);

    // ============ Trustless Dealer Events ============

    /// @notice Emitted when a seat registers its ECIES encryption public key
    event EncryptionKeyRegistered(uint8 indexed seatIndex, bytes pubKey);

    /// @notice Emitted when the dealer commits to its per-hand seed
    event DealerSeedCommitted(uint256 indexed handId, bytes32 commitment);

    /// @notice Emitted when the dealer reveals its seed at showdown
    event DealerSeedRevealed(uint256 indexed handId, bytes32 seed);

    /// @notice Emitted when hole-card VRF randomness is received; emits hash only (not raw value)
    event HoleCardVRFFulfilled(uint256 indexed handId, bytes32 randomnessHash);

    /// @notice Emitted when VRF re-request is issued for hole cards
    event HoleCardVRFReRequested(
        uint256 indexed handId,
        uint256 oldRequestId,
        uint256 newRequestId
    );

    /// @notice Emitted when BETTING_PRE begins (after advanceToPreflop).
    event PreflopStarted(uint256 indexed handId, uint8 actorSeat, uint256 actionDeadline);

    /// @notice Emitted when settlement occurs without a dealer seed reveal (soft enforcement)
    event ShuffleUnverified(uint256 indexed handId);

    /// @notice Emitted when dealer seed is revealed but shuffle verification fails
    event ShuffleIntegrityViolation(uint256 indexed handId, bytes32 dealerSeed);

    /// @notice Emitted when shuffle verification succeeds after dealer seed reveal
    event ShuffleVerified(uint256 indexed handId, bytes32 dealerSeed);

    /// @notice Emitted when admin address is updated
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);

    /// @notice Emitted when dealer address is updated
    event DealerUpdated(address indexed oldDealer, address indexed newDealer);

    /// @notice Emitted when the table is paused
    event TablePaused(address indexed by);

    /// @notice Emitted when the table is unpaused
    event TableUnpaused(address indexed by);

    /// @notice Emitted when an emergency withdrawal is requested (starts timelock)
    event EmergencyWithdrawRequested(uint8 indexed seatIndex, uint256 unlockAt);

    /// @notice Emitted when an emergency withdrawal is executed
    event EmergencyWithdrawExecuted(uint8 indexed seatIndex, address indexed recipient, uint256 amount);

    /// @notice Emitted when the VRF adapter is updated
    event VRFAdapterUpdated(address indexed oldAdapter, address indexed newAdapter);

    /// @notice Emitted when the player registry is updated
    event PlayerRegistryUpdated(address indexed oldRegistry, address indexed newRegistry);

    /// @notice Emitted when blind levels are updated
    event BlindsUpdated(uint256 oldSmallBlind, uint256 oldBigBlind, uint256 newSmallBlind, uint256 newBigBlind);

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;
    IERC20 public chipToken;

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

    // Post blind: seats that joined mid-game must post BB as live blind on first hand
    mapping(uint8 => bool) public needsPostBlind;

    // ============ Trustless Dealer State ============

    // T1.1: Per-seat ECIES encryption public key (compressed secp256k1, 33 bytes)
    mapping(uint8 => bytes) public encryptionKeys;

    // T1.2: Dealer seed commit/reveal per hand
    mapping(uint256 => bytes32) public dealerSeedCommits;  // handId => keccak256(seed)
    mapping(uint256 => bytes32) public dealerSeedReveals;  // handId => revealed seed

    // T1.3: Hole card VRF randomness per hand — hash only; raw value stays off-chain
    mapping(uint256 => bytes32) public holeCardVRFRandomnessHash;  // handId => keccak256(randomness)
    uint256 public pendingHoleCardVRFRequestId;                     // current pending hole-card VRF

    /// @notice HashKey Chain KYC SBT checker. address(0) = KYC gate disabled.
    address public kycSBT;
    /// @notice Optional PlayerRegistry for cross-contract auth. address(0) = disabled.
    address public playerRegistry;

    /// @notice Admin address — can update dealer and other params.
    address public admin;
    /// @notice Authorized dealer address — the only address that may submit hole commits and seed commits.
    address public dealer;

    // ============ Pause / Emergency State ============
    /// @notice When true, new hands cannot be started but settlements and withdrawals proceed.
    bool public paused;
    /// @notice Emergency withdrawal timelock delay (7 days).
    uint256 public constant EMERGENCY_TIMELOCK = 7 days;
    /// @notice Per-seat emergency withdrawal request timestamp. 0 = not requested.
    mapping(uint8 => uint256) public emergencyWithdrawRequestedAt;

    // ============ Modifiers ============
    function _checkOperator(uint8 seatIndex) internal view {
        require(seatIndex < numSeats, "Invalid seat");
        if (msg.sender == seats[seatIndex].operator || msg.sender == seats[seatIndex].owner) return;
        // If registry is set, also accept the operator registered there for this seat owner.
        if (playerRegistry != address(0)) {
            (,,, address regOperator, , bool isRegistered) = IPlayerRegistry(playerRegistry).agents(seats[seatIndex].owner);
            if (isRegistered && msg.sender == regOperator) return;
        }
        revert("Not operator");
    }
    modifier onlyOperator(uint8 seatIndex) {
        _checkOperator(seatIndex);
        _;
    }

    function _checkBettingState() internal view {
        require(
            gameState == GameState.BETTING_PRE ||
            gameState == GameState.BETTING_FLOP ||
            gameState == GameState.BETTING_TURN ||
            gameState == GameState.BETTING_RIVER,
            "Not in betting state"
        );
    }
    modifier inBettingState() {
        _checkBettingState();
        _;
    }

    function _checkActorTurn(uint8 seatIndex) internal view {
        require(currentHand.actorSeat == seatIndex, "Not your turn");
    }
    modifier isActorTurn(uint8 seatIndex) {
        _checkActorTurn(seatIndex);
        _;
    }

    function _checkDeadline() internal view {
        require(block.timestamp <= actionDeadline, "Action deadline passed");
    }
    modifier withinDeadline() {
        _checkDeadline();
        _;
    }

    function _checkOneActionPerBlock() internal view {
        require(block.number > lastActionBlock, "One action per block");
    }
    modifier oneActionPerBlock() {
        _checkOneActionPerBlock();
        _;
    }

    modifier onlyAdmin() {
        require(msg.sender == admin, "Not admin");
        _;
    }

    modifier onlyDealer() {
        require(msg.sender == dealer, "Not dealer");
        _;
    }

    modifier whenNotPaused() {
        require(!paused, "Table paused");
        _;
    }

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
    ) {
        require(_tableId > 0, "Table ID must be > 0");
        require(_smallBlind > 0, "Small blind must be > 0");
        require(_bigBlind >= _smallBlind, "Big blind must be >= small blind");
        require(_vrfAdapter != address(0), "Invalid VRF adapter");
        require(_chipToken != address(0), "Invalid chip token");
        require(_actionTimeout >= 1 minutes && _actionTimeout <= 60 minutes, "actionTimeout out of range");
        require(_vrfTimeout >= 30 seconds && _vrfTimeout <= 30 minutes, "vrfTimeout out of range");
        require(_showdownTimeout >= 1 minutes && _showdownTimeout <= 60 minutes, "showdownTimeout out of range");
        require(_numSeats >= 2 && _numSeats <= MAX_SEATS, "numSeats out of range (2-9)");
        require(_dealer != address(0), "Invalid dealer");
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        chipToken = IERC20(_chipToken);
        kycSBT = _kycSBT;
        ACTION_TIMEOUT = _actionTimeout;
        VRF_TIMEOUT = _vrfTimeout;
        SHOWDOWN_TIMEOUT = _showdownTimeout;
        numSeats = _numSeats;
        admin = msg.sender;
        dealer = _dealer;
        gameState = GameState.WAITING_FOR_SEATS;
    }

    // ============ Admin Functions ============

    /// @notice Transfer admin role to a new address.
    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid admin");
        emit AdminUpdated(admin, _newAdmin);
        admin = _newAdmin;
    }

    /// @notice Update the authorized dealer address.
    function setDealer(address _newDealer) external onlyAdmin {
        require(_newDealer != address(0), "Invalid dealer");
        emit DealerUpdated(dealer, _newDealer);
        dealer = _newDealer;
    }

    /// @notice Update the VRF adapter (e.g., to migrate from ProductionVRFAdapter to Chainlink).
    function setVRFAdapter(address _newAdapter) external onlyAdmin {
        require(_newAdapter != address(0), "Invalid VRF adapter");
        emit VRFAdapterUpdated(vrfAdapter, _newAdapter);
        vrfAdapter = _newAdapter;
    }

    /// @notice Update the PlayerRegistry address used for seat registration auth (address(0) to disable).
    function setPlayerRegistry(address _registry) external onlyAdmin {
        emit PlayerRegistryUpdated(playerRegistry, _registry);
        playerRegistry = _registry;
    }

    /// @notice Update blind levels. Only allowed between hands (WAITING_FOR_SEATS or SETTLED).
    function setBlinds(uint256 _newSmallBlind, uint256 _newBigBlind) external onlyAdmin {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Cannot update blinds mid-hand"
        );
        require(_newSmallBlind > 0, "Small blind must be > 0");
        require(_newBigBlind >= _newSmallBlind, "Big blind must be >= small blind");
        emit BlindsUpdated(smallBlind, bigBlind, _newSmallBlind, _newBigBlind);
        smallBlind = _newSmallBlind;
        bigBlind = _newBigBlind;
    }

    /// @notice Pause the table — prevents new hands from starting.
    /// @dev Existing hands continue to run and settle normally.
    function pause() external onlyAdmin {
        require(!paused, "Already paused");
        paused = true;
        emit TablePaused(msg.sender);
    }

    /// @notice Resume normal operation after a pause.
    function unpause() external onlyAdmin {
        require(paused, "Not paused");
        paused = false;
        emit TableUnpaused(msg.sender);
    }

    /**
     * @notice Request an emergency withdrawal for a seat (starts 7-day timelock).
     * @dev May only be called by the seat owner. Table must be paused or stuck
     *      (no active hand progressing for more than the action timeout).
     * @param seatIndex Seat to withdraw from.
     */
    function requestEmergencyWithdraw(uint8 seatIndex) external {
        require(seatIndex < numSeats, "Invalid seat");
        require(seats[seatIndex].owner == msg.sender, "Not seat owner");
        require(seats[seatIndex].stack > 0, "Nothing to withdraw");
        require(
            paused ||
            (actionDeadline > 0 && block.timestamp > actionDeadline + EMERGENCY_TIMELOCK),
            "Table not stuck or paused"
        );
        require(emergencyWithdrawRequestedAt[seatIndex] == 0, "Already requested");

        uint256 unlockAt = block.timestamp + EMERGENCY_TIMELOCK;
        emergencyWithdrawRequestedAt[seatIndex] = block.timestamp;
        emit EmergencyWithdrawRequested(seatIndex, unlockAt);
    }

    /**
     * @notice Execute a previously requested emergency withdrawal after the timelock.
     * @param seatIndex Seat to withdraw from.
     * @param recipient Address to receive the chips.
     */
    function executeEmergencyWithdraw(uint8 seatIndex, address recipient) external {
        require(seatIndex < numSeats, "Invalid seat");
        require(seats[seatIndex].owner == msg.sender, "Not seat owner");
        require(emergencyWithdrawRequestedAt[seatIndex] > 0, "Not requested");
        require(
            block.timestamp >= emergencyWithdrawRequestedAt[seatIndex] + EMERGENCY_TIMELOCK,
            "Timelock not expired"
        );
        require(recipient != address(0), "Invalid recipient");

        uint256 amount = seats[seatIndex].stack;
        require(amount > 0, "Nothing to withdraw");

        // Clear state before transfer
        seats[seatIndex].stack = 0;
        emergencyWithdrawRequestedAt[seatIndex] = 0;

        address(chipToken).safeTransfer(recipient, amount);
        emit EmergencyWithdrawExecuted(seatIndex, recipient, amount);
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
        address operator,
        uint256 buyIn
    ) external {
        require(seatIndex < numSeats, "Invalid seat index");
        require(seats[seatIndex].owner == address(0), "Seat already taken");
        require(owner != address(0), "Owner cannot be zero");
        require(buyIn >= bigBlind * 10, "Buy-in too small");
        if (playerRegistry != address(0)) {
            (,,, , , bool isRegistered) = IPlayerRegistry(playerRegistry).agents(owner);
            require(isRegistered, "Agent not registered in PlayerRegistry");
        }
        if (kycSBT != address(0)) {
            require(IKYCSBTChecker(kycSBT).isHuman(msg.sender), "KYC required");
            emit KYCCheckPassed(msg.sender, seatIndex);
        }
        address(chipToken).safeTransferFrom(msg.sender, address(this), buyIn);

        seats[seatIndex] = Seat({
            owner: owner,
            operator: operator == address(0) ? owner : operator,
            // Mid-hand registrations are queued for the next hand.
            stack: buyIn,
            isActive: false,
            currentBet: 0,
            isAllIn: false,
            totalHandBet: 0
        });

        // Mid-game joiners must post BB as live blind on their first hand
        if (gameState != GameState.WAITING_FOR_SEATS) {
            needsPostBlind[seatIndex] = true;
        }

        emit SeatUpdated(seatIndex, owner, operator == address(0) ? owner : operator, buyIn);

        // Notify vault of the buy-in so it can track chip escrow for NAV accounting
        _tryVaultFundBuyIn(owner, buyIn);
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
        require(seatIndex < numSeats, "Invalid seat index");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");
        require(amount > 0, "Top-up amount is zero");
        address(chipToken).safeTransferFrom(msg.sender, address(this), amount);

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
        require(seatIndex < numSeats, "Invalid seat index");
        require(amount > 0, "Cash-out amount is zero");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");
        require(seat.stack >= amount, "Insufficient seat stack");

        address seatOwner = seat.owner;
        seat.stack -= amount;
        address payoutRecipient = recipient == address(0) ? seatOwner : recipient;
        address(chipToken).safeTransfer(payoutRecipient, amount);

        emit SeatUpdated(seatIndex, seatOwner, seat.operator, seat.stack);
        emit SeatCashOut(seatIndex, seatOwner, payoutRecipient, amount, seat.stack);

        // Release vault escrow for cashed-out chips
        _tryVaultReleaseEscrow(seatOwner, amount);
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
        require(seatIndex < numSeats, "Invalid seat index");

        Seat memory seat = seats[seatIndex];
        require(seat.owner != address(0), "Seat not occupied");
        require(msg.sender == seat.owner, "Not seat owner");

        uint256 payoutAmount = seat.stack;
        address seatOwner = seat.owner;
        address payoutRecipient = recipient == address(0) ? seatOwner : recipient;

        delete seats[seatIndex];
        needsPostBlind[seatIndex] = false;

        if (payoutAmount > 0) {
            address(chipToken).safeTransfer(payoutRecipient, payoutAmount);
        }

        emit SeatUpdated(seatIndex, address(0), address(0), 0);
        emit SeatClosed(seatIndex, seatOwner, payoutRecipient, payoutAmount);

        // Release vault escrow for all chips returned when leaving
        _tryVaultReleaseEscrow(seatOwner, payoutAmount);
    }

    /**
     * @notice Check if all seats are filled
     */
    function allSeatsFilled() public view returns (bool) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].owner == address(0)) return false;
        }
        return true;
    }

    // ============ Encryption Key Registry (T1.1) ============

    /**
     * @notice Register a secp256k1 ECIES encryption public key for a seat.
     * @dev Only the seat owner or operator may call. Key rotation is allowed between hands only.
     * @param seatIndex The seat index (0..MAX_SEATS-1)
     * @param pubKey Compressed (33 bytes) or uncompressed (65 bytes) secp256k1 public key
     */
    function registerEncryptionKey(uint8 seatIndex, bytes calldata pubKey) external {
        require(seatIndex < numSeats, "Invalid seat");
        require(
            msg.sender == seats[seatIndex].owner || msg.sender == seats[seatIndex].operator,
            "Not owner or operator"
        );
        require(pubKey.length == 33 || pubKey.length == 65, "Invalid pubKey length");
        // Key rotation blocked while a hand is in progress
        require(
            gameState == GameState.WAITING_FOR_SEATS ||
            gameState == GameState.SETTLED ||
            gameState == GameState.TOURNAMENT_OVER,
            "EncKeyReg: hand in progress"
        );

        encryptionKeys[seatIndex] = pubKey;
        emit EncryptionKeyRegistered(seatIndex, pubKey);
    }

    /**
     * @notice Get the encryption public key registered for a seat.
     */
    function getEncryptionKey(uint8 seatIndex) external view returns (bytes memory) {
        require(seatIndex < numSeats, "Invalid seat");
        return encryptionKeys[seatIndex];
    }

    // ============ Dealer Seed Commit/Reveal (T1.2) ============

    /**
     * @notice Dealer commits to its per-hand randomness seed.
     * @dev Must be called before or right after hole card VRF, not after betting starts.
     * @param handId The hand ID
     * @param commitment keccak256(dealerSeed)
     */
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

    /**
     * @notice Dealer reveals its seed at showdown, enabling post-hoc shuffle verification.
     * @dev keccak256(seed) must match the stored commitment.
     * @param handId The hand ID
     * @param seed The original dealer seed
     */
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

    /**
     * @notice Verify shuffle integrity at showdown. Can be called by anyone after
     *         the dealer seed has been revealed on-chain.
     *
     * @dev The caller provides the per-seat reveal data (cards + salts + commitments).
     *      VRF randomness is read from on-chain storage. Dealer seed is read from on-chain storage.
     *      Emits ShuffleVerified on success, ShuffleIntegrityViolation on failure.
     *      This is a soft-enforcement: settlement is not affected by the outcome.
     *
     * @param handId    The hand ID to verify
     * @param seatCount Number of seats that were dealt
     * @param reveals   Per-seat reveal data (card1, card2, salt, commitment)
     */
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
        }
    }

    // ============ Hand Lifecycle ============

    /**
     * @notice Start a new hand. Can be called by anyone when conditions are met.
     */
    function startHand() external whenNotPaused {
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
        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].isActive = _isSeatPlayable(i);
            seats[i].currentBet = 0;
            seats[i].isAllIn = false;
            seats[i].totalHandBet = 0;
        }

        // Reset community cards (255 = not dealt)
        for (uint8 i = 0; i < 5; i++) {
            communityCards[i] = UNDEALT;
        }
        pendingVRFRequestId = 0;
        pendingHoleCardVRFRequestId = 0;
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

        // Post blinds for mid-game joiners (live blind = BB, counts as currentBet)
        // BB/SB seats already posted their blinds, so skip them.
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

        // Pre-flop: first active seat after BB acts first.
        uint8 firstActor = _nextActiveSeat(bbSeat);

        bool[MAX_SEATS] memory initialHasActed;

        // Initialize hand state
        currentHand = Hand({
            handId: currentHandId,
            pot: initialPot,
            currentBet: bbPost,   // actual amount posted (may be less than bigBlind if BB is all-in)
            lastRaiseSize: bigBlind, // initial min-raise size is one big blind
            actorSeat: firstActor,
            lastAggressor: bbSeat, // BB is considered the aggressor (posted blind)
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

        // Request VRF for hole card shuffle seed (separate from community card VRF)
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
            // Minimum raise: previous bet + last raise size (standard poker rules)
            uint256 minRaise = currentHand.currentBet + currentHand.lastRaiseSize;
            require(raiseToAmount >= minRaise, "Raise too small");
            require(stack >= additional, "Insufficient stack");
        } else {
            // All-in raise: raiseToAmount is capped at currentBet + stack
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

        // Reset all other active players' hasActed since they need to respond
        for (uint8 i = 0; i < numSeats; i++) {
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

        // All-in players cannot act — just advance past them (defensive guard).
        // _nextActiveSeat() already skips all-in players, but this prevents incorrect
        // auto-folds if an all-in seat is somehow the current actor.
        if (seats[seatIndex].isAllIn) {
            _recordAction();
            _advanceAction(seatIndex);
            return;
        }

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
            if (next == numSeats) {
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
        for (uint8 i = 0; i < numSeats; i++) {
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
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 next = (fromSeat + i) % numSeats;
            if (seats[next].isActive && !seats[next].isAllIn) {
                return next;
            }
        }
        return numSeats; // sentinel: no eligible actor
    }

    /**
     * @notice Count active players and track the last active seat index.
     */
    function _countActivePlayers() internal view returns (uint8 count, uint8 lastActive) {
        for (uint8 i = 0; i < numSeats; i++) {
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
        for (uint8 i = 0; i < numSeats; i++) {
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

        // Add the maximum totalHandBet as the final level (captures non-all-in bets)
        uint256 maxBet = 0;
        for (uint8 i = 0; i < numSeats; i++) {
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

            for (uint8 i = 0; i < numSeats; i++) {
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

        // Route: hole card VRF
        if (gameState == GameState.WAITING_VRF_HOLECARDS) {
            require(requestId == pendingHoleCardVRFRequestId, "Invalid request ID");
            bytes32 randomnessHash = keccak256(abi.encodePacked(randomness));
            holeCardVRFRandomnessHash[currentHandId] = randomnessHash;
            pendingHoleCardVRFRequestId = 0;
            gameState = GameState.WAITING_FOR_HOLECARDS;
            emit HoleCardVRFFulfilled(currentHandId, randomnessHash);
            return;
        }

        // Route: community card VRF
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
        for (uint8 i = 0; i < numSeats; i++) {
            seats[i].currentBet = 0;
            currentHand.hasActed[i] = false;
        }
        currentHand.currentBet = 0;
        currentHand.lastRaiseSize = bigBlind;
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
     * @notice Re-request hole card VRF when the original fulfillment is delayed.
     * @dev Anyone can call after VRF_TIMEOUT has passed.
     */
    function reRequestHoleCardVRF() external {
        require(gameState == GameState.WAITING_VRF_HOLECARDS, "Not waiting for hole card VRF");
        require(vrfAdapter != address(0), "No VRF adapter");
        require(block.timestamp > vrfRequestTimestamp + VRF_TIMEOUT, "VRF timeout not reached");

        uint256 oldRequestId = pendingHoleCardVRFRequestId;
        uint256 newRequestId = IVRFAdapter(vrfAdapter).requestRandomness(
            tableId,
            currentHandId,
            uint8(GameState.WAITING_VRF_HOLECARDS)
        );
        pendingHoleCardVRFRequestId = newRequestId;
        vrfRequestTimestamp = block.timestamp;

        emit HoleCardVRFReRequested(currentHandId, oldRequestId, newRequestId);
    }

    /**
     * @notice Advance from WAITING_FOR_HOLECARDS to BETTING_PRE.
     * @dev Callable by anyone once the hole-card VRF has been fulfilled.
     *      Dealers should submit commitments before calling this, but it is not enforced
     *      here — commitment verification happens at showdown reveal time.
     *      Mirrors the permissionless design of startHand().
     */
    function advanceToPreflop() external {
        require(gameState == GameState.WAITING_FOR_HOLECARDS, "Not waiting for hole cards");
        // All active seats must have hole card commitments before betting begins
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].isActive) {
                require(holeCommits[currentHandId][i] != bytes32(0), "Missing hole commit");
            }
        }
        gameState = GameState.BETTING_PRE;
        // T-R1-04: Set action deadline so forceTimeout works from the very first preflop action
        actionDeadline = block.timestamp + ACTION_TIMEOUT;
        // T-R1-05: Emit state transition so the indexer can track this transition
        emit PreflopStarted(currentHandId, currentHand.actorSeat, actionDeadline);
        // If all players are all-in from blind posting, skip pre-flop betting
        if (_countNonAllInActivePlayers() == 0) {
            _completeBettingRound();
        }
    }

    /**
     * @dev Notify each seat's PlayerVault of its net PnL for the settled hand.
     *      `won[i]` = chips received from the pot by seat i.
     *      PnL = won[i] - totalHandBet[i].
     *      Gracefully skips: if playerRegistry unset, vault unset, not registered, or call reverts.
     */
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
                // Guard: skip EOAs and precompiles — only call deployed contracts
                if (vault.code.length == 0) continue;
                try IPlayerVaultMinimal(vault).onSettlement(handId, pnl) {} catch {}
            } catch {}
        }
    }

    /// @dev Look up the vault address for a seat owner via the PlayerRegistry. Returns address(0) if not found.
    function _getVaultForOwner(address seatOwner) internal view returns (address) {
        if (playerRegistry == address(0) || seatOwner == address(0)) return address(0);
        try IPlayerRegistry(playerRegistry).agents(seatOwner) returns (
            address vault, address, address, address, string memory, bool isReg
        ) {
            if (isReg && vault.code.length > 0) return vault;
        } catch {}
        return address(0);
    }

    /// @dev Notify vault of a buy-in so it can track chip escrow. Silently skips if vault not found.
    function _tryVaultFundBuyIn(address seatOwner, uint256 amount) internal {
        address vault = _getVaultForOwner(seatOwner);
        if (vault == address(0)) return;
        try IPlayerVaultEscrow(vault).fundBuyIn(address(this), amount) {} catch {}
    }

    /// @dev Notify vault that chips have been cashed out / released from escrow. Silently skips.
    function _tryVaultReleaseEscrow(address seatOwner, uint256 amount) internal {
        if (amount == 0) return;
        address vault = _getVaultForOwner(seatOwner);
        if (vault == address(0)) return;
        try IPlayerVaultEscrow(vault).releaseEscrow(address(this), amount) {} catch {}
    }

    /**
     * @notice Find first active, non-all-in player after the button (clockwise).
     * @dev Used for post-flop action order. Returns MAX_SEATS if everyone is all-in.
     */
    function _firstActiveAfterButton() internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 seat = (buttonSeat + i) % numSeats;
            if (seats[seat].isActive && !seats[seat].isAllIn) {
                return seat;
            }
        }
        return numSeats; // sentinel: all players are all-in
    }

    /**
     * @notice Derive and store community cards from VRF randomness using Fisher-Yates partial shuffle.
     * @dev Guarantees no duplicate community cards across all streets.
     *      Previously dealt cards are excluded from the shuffle by placing them at the front of the deck.
     */
    function _dealCommunityCards(uint256 randomness) internal {
        // Build deck of 52 cards
        uint8[DECK_SIZE] memory deck;
        for (uint8 i = 0; i < DECK_SIZE; i++) deck[i] = i;

        // Move already-dealt community cards to the front (indices 0..alreadyDealt-1)
        uint8 alreadyDealt = 0;
        for (uint8 i = 0; i < 5; i++) {
            if (communityCards[i] != UNDEALT) {
                // Swap communityCards[i] to deck[alreadyDealt]
                uint8 cardVal = communityCards[i];
                // Find cardVal in deck (it's still at its natural position since we only swap forward)
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
            uint8 available = DECK_SIZE - deckStart - i;
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
        require(winnerSeat < numSeats, "Invalid winner");

        // T4.2: Soft enforcement — emit ShuffleUnverified if dealer seed was never revealed
        uint256 handId = currentHandId;
        if (dealerSeedCommits[handId] != bytes32(0) && dealerSeedReveals[handId] == bytes32(0)) {
            emit ShuffleUnverified(handId);
        }

        uint256 potAmount = currentHand.pot;
        seats[winnerSeat].stack += potAmount;

        emit SeatUpdated(winnerSeat, seats[winnerSeat].owner, seats[winnerSeat].operator, seats[winnerSeat].stack);
        emit HandSettled(currentHandId, winnerSeat, potAmount);

        // Notify vaults of PnL before resetting hand state
        {
            uint256[MAX_SEATS] memory won;
            won[winnerSeat] = potAmount;
            _notifyVaultsOfSettlement(handId, won);
        }

        // Prepare for next hand
        gameState = GameState.SETTLED;
        showdownStartTimestamp = 0;
        _advanceButton(); // Move button clockwise to next occupied seat

        // Reset hand state
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
        uint8 firstWinner = numSeats;
        uint256[MAX_SEATS] memory won;

        for (uint8 p = 0; p < potCount; p++) {
            uint256 potAmount = sidePots[p].amount;
            bool[MAX_SEATS] memory eligible = sidePots[p].eligible;

            // Find eligible AND revealed seats for this pot
            uint8 eligCount = 0;
            uint256 bestScore = 0;

            for (uint8 i = 0; i < numSeats; i++) {
                if (eligible[i] && revealedBySeat[i]) {
                    eligCount++;
                    if (scoresBySeat[i] > bestScore) bestScore = scoresBySeat[i];
                }
            }

            if (eligCount == 0) continue; // skip unwinnable pot (edge case)

            // Count tied winners
            uint8 winnerCount = 0;
            for (uint8 i = 0; i < numSeats; i++) {
                if (eligible[i] && revealedBySeat[i] && scoresBySeat[i] == bestScore) winnerCount++;
            }

            uint256 share = potAmount / winnerCount;
            uint256 remainder = potAmount % winnerCount;

            // Primary winner for remainder: first clockwise from button
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

        // Notify vaults of PnL before resetting hand state
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

        // Distribute shares
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

        // Notify vaults of PnL before resetting hand state
        _notifyVaultsOfSettlement(currentHandId, won);

        // Prepare for next hand
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

    /**
     * @notice Liveness fallback when no hole cards are revealed during showdown.
     * @dev After SHOWDOWN_TIMEOUT, split pot equally among active seats.
     *      Remainder goes to the first active seat clockwise from button.
     */
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
            if (seatIndex == primaryWinner) {
                payout += remainder;
            }
            seats[seatIndex].stack += payout;
            won[seatIndex] = payout;
            emit SeatUpdated(
                seatIndex,
                seats[seatIndex].owner,
                seats[seatIndex].operator,
                seats[seatIndex].stack
            );
        }

        emit ShowdownTimedOut(currentHandId, activeCount, potAmount);
        emit HandSettled(currentHandId, primaryWinner, potAmount);

        // Notify vaults of PnL before resetting hand state
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

    // ============ Hole Card Commit/Reveal ============

    /**
     * @notice Submit hole card commitment for a seat
     * @dev Only the authorized dealer may call this. Commitments are only accepted for the
     *      current active hand while it is in the WAITING_FOR_HOLECARDS state.
     * @param handId The hand ID — must equal currentHandId
     * @param seatIndex The seat index (0..MAX_SEATS-1)
     * @param commitment The keccak256 hash of (handId, seatIndex, card1, card2, salt)
     */
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
        require(holeCommits[handId][seatIndex] == bytes32(0), "Commitment already exists");

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
        require(seatIndex < numSeats, "Invalid seat");
        require(handId > 0 && handId <= currentHandId, "Invalid hand ID");
        require(card1 < DECK_SIZE && card2 < DECK_SIZE, "Invalid card value");
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

        // Hard integrity check: if hole cards duplicate any community card, void this reveal.
        // The seat cannot win — it will be treated as having not revealed at showdown.
        for (uint8 ci = 0; ci < 5; ci++) {
            if (communityCards[ci] == UNDEALT) continue;
            if (card1 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card1, ci);
                return; // forfeit: do NOT mark as revealed
            }
            if (card2 == communityCards[ci]) {
                emit CardIntegrityViolation(handId, seatIndex, card2, ci);
                return; // forfeit: do NOT mark as revealed
            }
        }

        // Cards are clean — store the reveal
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
        require(seatIndex < numSeats, "Invalid seat");

        if (!isHoleCardsRevealed[handId][seatIndex]) {
            return (UNDEALT, UNDEALT);
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

    function _isSeatOccupied(uint8 seatIndex) internal view returns (bool) {
        return seats[seatIndex].owner != address(0);
    }

    function _isSeatPlayable(uint8 seatIndex) internal view returns (bool) {
        return _isSeatOccupied(seatIndex) && seats[seatIndex].stack > 0;
    }

    function _countPlayableSeats() internal view returns (uint8 count) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (_isSeatPlayable(i)) count++;
        }
    }

    function _nextPlayableSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 next = (fromSeat + i) % numSeats;
            if (_isSeatPlayable(next)) return next;
        }
        revert("No playable seat found");
    }

    function _nextOccupiedSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 next = (fromSeat + i) % numSeats;
            if (_isSeatOccupied(next)) return next;
        }
        return fromSeat;
    }

    function _advanceButton() internal {
        buttonSeat = _nextOccupiedSeat(buttonSeat);
    }

    function _evictBustedSeats() internal {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].owner != address(0) && seats[i].stack == 0) {
                address owner = seats[i].owner;
                delete seats[i];
                needsPostBlind[i] = false;
                emit SeatUpdated(i, address(0), address(0), 0);
                emit SeatEvicted(i, owner);
            }
        }

        // Tournament winner check: exactly 1 player with chips remains
        uint8 playableCount = _countPlayableSeats();
        if (playableCount == 1) {
            for (uint8 i = 0; i < numSeats; i++) {
                if (_isSeatPlayable(i)) {
                    gameState = GameState.TOURNAMENT_OVER;
                    emit TournamentWinner(seats[i].owner, i, seats[i].stack);
                    break;
                }
            }
        }
    }
}
