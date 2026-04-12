// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "../interfaces/IVRFAdapter.sol";
import "../interfaces/IERC20.sol";
import { SafeTransfer } from "../lib/SafeTransfer.sol";

/**
 * @title PokerTableBase
 * @notice Shared state, types, events, and modifiers for the PokerTable module family.
 * @dev Abstract base for SeatManager, BettingEngine, and SettlementEngine.
 */
abstract contract PokerTableBase {
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
        WAITING_FOR_SEATS,
        HAND_INIT,
        BETTING_PRE,
        WAITING_VRF_FLOP,
        BETTING_FLOP,
        WAITING_VRF_TURN,
        BETTING_TURN,
        WAITING_VRF_RIVER,
        BETTING_RIVER,
        SHOWDOWN,
        SETTLED,
        TOURNAMENT_OVER,
        WAITING_VRF_HOLECARDS,
        WAITING_FOR_HOLECARDS
    }

    enum ActionType {
        FOLD,
        CHECK,
        CALL,
        RAISE
    }

    // ============ Structs ============
    struct Seat {
        address owner;
        address operator;
        uint256 stack;
        bool isActive;
        uint256 currentBet;
        bool isAllIn;
        uint256 totalHandBet;
    }

    struct Hand {
        uint256 handId;
        uint256 pot;
        uint256 currentBet;
        uint256 lastRaiseSize;
        uint8 actorSeat;
        uint8 lastAggressor;
        uint8 actionsInRound;
        uint8 sidePotCount;
        bool[MAX_SEATS] hasActed;
    }

    struct SidePot {
        uint256 amount;
        bool[MAX_SEATS] eligible;
    }

    // ============ Events ============
    event SeatUpdated(uint8 indexed seatIndex, address owner, address operator, uint256 stack);
    event SeatClosed(uint8 indexed seatIndex, address indexed owner, address indexed recipient, uint256 amount);
    event HandStarted(uint256 indexed handId, uint256 smallBlind, uint256 bigBlind, uint8 buttonSeat);
    event ActionTaken(uint256 indexed handId, uint8 indexed seatIndex, ActionType action, uint256 amount, uint256 potAfter);
    event VRFRequested(uint256 indexed handId, GameState street, uint256 requestId);
    event CommunityCardsDealt(uint256 indexed handId, GameState street, uint8[] cards);
    event HandSettled(uint256 indexed handId, uint8 winnerSeat, uint256 potAmount);
    event HoleCommitSubmitted(uint256 indexed handId, uint8 indexed seatIndex, bytes32 commitment);
    event HoleCardsRevealed(uint256 indexed handId, uint8 indexed seatIndex, uint8 card1, uint8 card2);
    event VRFReRequested(uint256 indexed handId, GameState street, uint256 oldRequestId, uint256 newRequestId);
    event TournamentWinner(address indexed winner, uint8 indexed seatIndex, uint256 finalStack);
    event CardIntegrityViolation(uint256 indexed handId, uint8 indexed seatIndex, uint8 card, uint8 communityIndex);
    event HoleCardVRFFulfilled(uint256 indexed handId, bytes32 randomnessHash);
    event HoleCardVRFReRequested(uint256 indexed handId, uint256 oldRequestId, uint256 newRequestId);
    event PreflopStarted(uint256 indexed handId, uint8 actorSeat, uint256 actionDeadline);
    event HandAborted(uint256 indexed handId, string reason);
    event AdminUpdated(address indexed oldAdmin, address indexed newAdmin);
    event DealerUpdated(address indexed oldDealer, address indexed newDealer);
    event TablePaused(address indexed by);
    event TableUnpaused(address indexed by);
    /// @notice Emitted at settlement when the dealer committed a seed but never revealed it.
    event ShuffleUnverified(uint256 indexed handId);
    /// @notice Emitted when the shuffle is verified successfully.
    event ShuffleVerified(uint256 indexed handId, bytes32 dealerSeed);
    /// @notice Emitted when shuffle verification reveals a card integrity violation.
    event ShuffleIntegrityViolation(uint256 indexed handId, bytes32 dealerSeed);
    /// @notice Emitted when a seat registers its ECIES public key.
    event EncryptionKeyRegistered(uint8 indexed seatIndex, bytes pubKey);
    /// @notice Emitted when a dealer seed is committed to chain.
    event DealerSeedCommitted(uint256 indexed handId, bytes32 commitment);
    /// @notice Emitted when a dealer seed is revealed.
    event DealerSeedRevealed(uint256 indexed handId, bytes32 seed);
    /// @notice Emitted when an AI agent commits their decision hash before acting.
    event DecisionCommitted(uint256 indexed handId, uint8 indexed seatIndex, bytes32 commitHash, bytes32 reasoningHash);
    /// @notice Emitted when an AI agent reveals their decision after the hand is settled.
    event DecisionRevealed(uint256 indexed handId, uint8 indexed seatIndex, string action, string reasoning);
    /// @notice Emitted when a seat owner requests an emergency withdrawal.
    event EmergencyWithdrawRequested(uint8 indexed seatIndex, uint256 unlockTime);
    /// @notice Emitted when an emergency withdrawal is executed.
    event EmergencyWithdrawExecuted(uint8 indexed seatIndex, address indexed recipient, uint256 amount);

    // ============ Custom Errors ============
    error OneActionPerBlock();
    error InvalidGameState();
    error CannotStartHand();
    error VRFTimeoutNotReached();
    error ShowdownRevealWindowOpen();
    error CommitmentAlreadyExists();
    error NotYourTurn();

    // ============ State Variables ============
    uint256 public tableId;
    uint256 public smallBlind;
    uint256 public bigBlind;
    IERC20 public chipToken;

    GameState public gameState;
    uint256 public currentHandId;
    uint8 public buttonSeat;

    Seat[MAX_SEATS] public seats;
    Hand public currentHand;
    SidePot[MAX_SEATS] public sidePots;

    uint256 public actionDeadline;
    uint256 public lastActionBlock;

    address public vrfAdapter;
    uint256 public pendingVRFRequestId;
    uint256 public vrfRequestTimestamp;
    uint256 public showdownStartTimestamp;

    uint8[5] public communityCards;

    mapping(uint256 => mapping(uint8 => bytes32)) public holeCommits;
    mapping(uint256 => mapping(uint8 => uint8[2])) internal _revealedHoleCards;
    mapping(uint256 => mapping(uint8 => bool)) public isHoleCardsRevealed;
    mapping(uint8 => bool) public needsPostBlind;

    // ============ Trustless Dealer State ============
    mapping(uint256 => bytes32) public holeCardVRFRandomnessHash;
    uint256 public pendingHoleCardVRFRequestId;

    uint8 public constant MAX_HOLE_CARD_VRF_RETRIES = 3;
    mapping(uint256 => uint8) public holeCardVRFRetryCount;

    // ============ Hand Settlement Results ============
    /// @notice Winner seat index per settled hand (set at settlement time).
    mapping(uint256 => uint8) public handWinner;
    /// @notice True once a hand has been settled.
    mapping(uint256 => bool) public handSettledFlag;

    // ============ Shuffle Verification ============
    /// @notice Optional dealer seed commitment per hand (0 = not committed).
    /// @dev Exposed as both `dealerSeedCommitments` and `dealerSeedCommits` for API compatibility.
    mapping(uint256 => bytes32) public dealerSeedCommitments;
    /// @notice True if the dealer revealed their seed before settlement.
    mapping(uint256 => bool) public dealerSeedRevealed;
    /// @notice Actual dealer seed revealed per hand (0 = not revealed).
    mapping(uint256 => bytes32) public dealerSeedReveals;

    // ============ Encryption Key Registry ============
    /// @notice ECIES public keys per seat for hole card encryption.
    mapping(uint8 => bytes) public encryptionKeys;

    // ============ AI Decision Transparency ============
    /// @notice Commit hash per (handId, seatIndex) for AI decision transparency.
    mapping(uint256 => mapping(uint8 => bytes32)) public decisionCommits;
    /// @notice Reasoning hash per (handId, seatIndex) for storing reasoning JSON hash.
    mapping(uint256 => mapping(uint8 => bytes32)) public decisionReasoningHashes;

    // ============ Emergency Withdrawal ============
    uint256 public constant EMERGENCY_TIMELOCK = 7 days;
    /// @notice Timestamp when the emergency withdraw was requested for each seat (0 = not requested).
    mapping(uint8 => uint256) public emergencyWithdrawRequestedAt;

    address public admin;
    address public dealer;
    /// @notice Optional KYC Soul-Bound Token gate address (address(0) = disabled).
    address public kycSBT;
    /// @notice Optional PlayerRegistry gate (address(0) = no gate).
    address public playerRegistry;

    // ============ Pause State ============
    bool public paused;

    // ============ Modifiers ============
    function _checkOperator(uint8 seatIndex) internal view {
        require(seatIndex < numSeats, "S1");
        require(msg.sender == seats[seatIndex].operator || msg.sender == seats[seatIndex].owner, "OP");
    }
    modifier onlyOperator(uint8 seatIndex) { _checkOperator(seatIndex); _; }

    function _checkBettingState() internal view {
        require(
            gameState == GameState.BETTING_PRE ||
            gameState == GameState.BETTING_FLOP ||
            gameState == GameState.BETTING_TURN ||
            gameState == GameState.BETTING_RIVER,
            "BS"
        );
    }
    modifier inBettingState() { _checkBettingState(); _; }

    function _checkActorTurn(uint8 seatIndex) internal view {
        if (currentHand.actorSeat != seatIndex) revert NotYourTurn();
    }
    modifier isActorTurn(uint8 seatIndex) { _checkActorTurn(seatIndex); _; }

    function _checkDeadline() internal view {
        require(block.timestamp <= actionDeadline, "DL");
    }
    modifier withinDeadline() { _checkDeadline(); _; }

    function _checkOneActionPerBlock() internal view {
        if (block.number <= lastActionBlock) revert OneActionPerBlock();
    }
    modifier oneActionPerBlock() { _checkOneActionPerBlock(); _; }

    modifier onlyAdmin() { require(msg.sender == admin, "AD"); _; }
    modifier onlyDealer() { require(msg.sender == dealer, "DL2"); _; }
    modifier whenNotPaused() { require(!paused, "PA"); _; }

    // ============ Convenience View Helpers ============

    /// @notice Alias for `dealerSeedCommitments` (API compatibility).
    function dealerSeedCommits(uint256 handId) external view returns (bytes32) {
        return dealerSeedCommitments[handId];
    }

    /// @notice Returns a seat's full state. Convenience wrapper over the public `seats` array getter.
    function getSeat(uint8 i) external view returns (Seat memory) {
        return seats[i];
    }

    /// @notice Returns the five most-queried fields from the current hand + current game state.
    function getHandInfo() external view returns (
        uint256   handId,
        uint256   pot,
        uint256   currentBet,
        uint8     actorSeat,
        GameState state
    ) {
        Hand storage h = currentHand;
        return (h.handId, h.pot, h.currentBet, h.actorSeat, gameState);
    }

    /// @notice Returns true if seat `i` could legally check right now.
    function canCheck(uint8 i) external view returns (bool) {
        return seats[i].isActive && seats[i].currentBet == currentHand.currentBet;
    }

    /// @notice Returns how many chips seat `i` still needs to put in to call the current bet.
    ///         0 if the seat is already at the current bet or is all-in.
    function getAmountToCall(uint8 i) external view returns (uint256) {
        if (seats[i].isAllIn || !seats[i].isActive) return 0;
        uint256 owed = currentHand.currentBet;
        uint256 already = seats[i].currentBet;
        return owed > already ? owed - already : 0;
    }

    /// @notice Returns a copy of the five community cards (UNDEALT = 255 for undealt positions).
    function getCommunityCards() external view returns (uint8[5] memory) {
        return communityCards;
    }

    /// @notice Returns the two revealed hole cards for a seat in a given hand.
    function getRevealedHoleCards(uint256 handId, uint8 seatIndex)
        external view returns (uint8 card1, uint8 card2)
    {
        uint8[2] storage cards = _revealedHoleCards[handId][seatIndex];
        return (cards[0], cards[1]);
    }

    /// @notice Returns true when every seat slot (0 .. numSeats-1) is occupied.
    function allSeatsFilled() external view returns (bool) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].owner == address(0)) return false;
        }
        return true;
    }

    /// @notice Returns the number of currently active side pots.
    function getSidePotCount() external view returns (uint8) {
        return currentHand.sidePotCount;
    }

    /// @notice Returns the amount and eligibility array for a specific side pot.
    function getSidePot(uint8 index) external view returns (uint256 amount, bool[MAX_SEATS] memory eligible) {
        SidePot storage sp = sidePots[index];
        return (sp.amount, sp.eligible);
    }

    // ============ Abstract cross-module declarations ============
    // Declared here so sibling abstract contracts can call each other's implementations.
    function _settleHand(uint8 winnerSeat) internal virtual;
    function _evictBustedSeats() internal virtual;
    function _advanceButton() internal virtual;

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
        require(_tableId > 0, "P1");
        require(_smallBlind > 0, "P2");
        require(_bigBlind >= _smallBlind, "P3");
        require(_vrfAdapter != address(0), "P4");
        require(_chipToken != address(0), "P5");
        require(_actionTimeout >= 1 minutes && _actionTimeout <= 60 minutes, "P6");
        require(_vrfTimeout >= 30 seconds && _vrfTimeout <= 30 minutes, "P7");
        require(_showdownTimeout >= 1 minutes && _showdownTimeout <= 60 minutes, "P8");
        require(_numSeats >= 2 && _numSeats <= MAX_SEATS, "P9");
        require(_dealer != address(0), "P10");
        kycSBT = _kycSBT;
        tableId = _tableId;
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
        vrfAdapter = _vrfAdapter;
        chipToken = IERC20(_chipToken);
        ACTION_TIMEOUT = _actionTimeout;
        VRF_TIMEOUT = _vrfTimeout;
        SHOWDOWN_TIMEOUT = _showdownTimeout;
        numSeats = _numSeats;
        admin = msg.sender;
        dealer = _dealer;
        gameState = GameState.WAITING_FOR_SEATS;
    }
}
