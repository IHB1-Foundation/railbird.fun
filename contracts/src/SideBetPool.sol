// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SideBetPool
 * @notice On-chain spectator side-betting pool for AI poker matches.
 *         Spectators bet native token on which seat wins a hand.
 *         Payouts are proportional: winner gets totalPool * (userBetOnWinner / seatTotals[winnerSeat]).
 *
 * Security:
 *   - Checks-effects-interactions pattern throughout.
 *   - Reentrancy guard on all state-modifying functions.
 *   - settled flag prevents duplicate settlement.
 *   - Bet.claimed flag prevents duplicate claims.
 */

interface IPokerTableView {
    function gameState() external view returns (uint8);
    function currentHandId() external view returns (uint256);
    function numSeats() external view returns (uint8);
    function handWinner(uint256 handId) external view returns (uint8);
    function handSettledFlag(uint256 handId) external view returns (bool);
}

contract SideBetPool {

    // ============ Types ============

    struct Pool {
        address table;
        uint256 handId;
        uint256 totalPool;
        uint8 winnerSeat;
        bool settled;
        uint256 createdAt;
    }

    struct Bet {
        uint8 seatIndex;
        uint256 amount;
        bool claimed;
    }

    // ============ GameState constants (mirrored from PokerTableBase) ============
    uint8 private constant STATE_WAITING_FOR_SEATS  = 0;
    uint8 private constant STATE_HAND_INIT          = 1;
    uint8 private constant STATE_BETTING_PRE        = 2;
    uint8 private constant STATE_WAITING_VRF_FLOP   = 3;
    uint8 private constant STATE_BETTING_FLOP       = 4;
    uint8 private constant STATE_WAITING_VRF_TURN   = 5;
    uint8 private constant STATE_BETTING_TURN       = 6;
    uint8 private constant STATE_WAITING_VRF_RIVER  = 7;
    uint8 private constant STATE_BETTING_RIVER      = 8;
    uint8 private constant STATE_SHOWDOWN           = 9;
    uint8 private constant STATE_SETTLED            = 10;
    uint8 private constant STATE_TOURNAMENT_OVER    = 11;

    // ============ Storage ============

    /// poolKey = keccak256(abi.encode(tableAddress, handId))
    mapping(bytes32 => Pool) public pools;

    /// seatTotals[poolKey][seatIndex] = total native token bet on that seat
    mapping(bytes32 => mapping(uint8 => uint256)) public seatTotals;

    /// userBets[poolKey][bettor] = list of bets placed by bettor
    mapping(bytes32 => mapping(address => Bet[])) public userBets;

    /// Reentrancy guard
    uint256 private _reentrancyStatus = 1;
    uint256 private constant _NOT_ENTERED = 1;
    uint256 private constant _ENTERED = 2;

    // ============ Events ============

    event BetPlaced(bytes32 indexed poolKey, address indexed bettor, uint8 seatIndex, uint256 amount);
    event PoolSettled(bytes32 indexed poolKey, uint8 winnerSeat, uint256 totalPool);
    event WinningsClaimed(bytes32 indexed poolKey, address indexed bettor, uint256 payout);
    event PoolCreated(bytes32 indexed poolKey, address indexed table, uint256 handId);

    // ============ Modifiers ============

    modifier nonReentrant() {
        require(_reentrancyStatus != _ENTERED, "Reentrant call");
        _reentrancyStatus = _ENTERED;
        _;
        _reentrancyStatus = _NOT_ENTERED;
    }

    // ============ Helpers ============

    function _poolKey(address table, uint256 handId) internal pure returns (bytes32) {
        return keccak256(abi.encode(table, handId));
    }

    function _isActiveBettingState(uint8 state) internal pure returns (bool) {
        return state >= STATE_HAND_INIT && state <= STATE_SHOWDOWN;
    }

    // ============ Core Functions ============

    /**
     * @notice Place a bet on a seat winning the current hand.
     * @param table     Address of the PokerTable contract.
     * @param handId    Hand ID to bet on.
     * @param seatIndex Seat index to bet on (must be valid for the table).
     */
    function placeBet(address table, uint256 handId, uint8 seatIndex) external payable nonReentrant {
        require(msg.value > 0, "Bet amount must be > 0");

        bytes32 key = _poolKey(table, handId);

        // Verify pool is not already settled
        require(!pools[key].settled, "Pool already settled");

        // Verify the hand is still active on the table
        IPokerTableView pokerTable = IPokerTableView(table);
        uint8 gs = pokerTable.gameState();
        uint256 currentHandId = pokerTable.currentHandId();
        require(currentHandId == handId, "Hand ID mismatch");
        require(_isActiveBettingState(gs), "Hand not in active betting state");

        // Verify seat index is valid
        uint8 numSeats = pokerTable.numSeats();
        require(seatIndex < numSeats, "Invalid seat index");

        // Create pool if it doesn't exist
        if (pools[key].table == address(0)) {
            pools[key] = Pool({
                table: table,
                handId: handId,
                totalPool: 0,
                winnerSeat: 0,
                settled: false,
                createdAt: block.timestamp
            });
            emit PoolCreated(key, table, handId);
        }

        // Effects before interactions
        pools[key].totalPool += msg.value;
        seatTotals[key][seatIndex] += msg.value;
        userBets[key][msg.sender].push(Bet({
            seatIndex: seatIndex,
            amount: msg.value,
            claimed: false
        }));

        emit BetPlaced(key, msg.sender, seatIndex, msg.value);
    }

    /**
     * @notice Settle the pool by reading the winner from the PokerTable.
     * @dev Callable by anyone once the hand is settled on-chain.
     * @param table  PokerTable address.
     * @param handId Hand ID to settle.
     */
    function settleBets(address table, uint256 handId) external nonReentrant {
        bytes32 key = _poolKey(table, handId);
        require(pools[key].table != address(0), "Pool does not exist");
        require(!pools[key].settled, "Pool already settled");

        IPokerTableView pokerTable = IPokerTableView(table);

        // Verify the hand is settled on-chain
        require(
            pokerTable.handSettledFlag(handId),
            "Hand not settled on-chain"
        );

        uint8 winnerSeat = pokerTable.handWinner(handId);

        // Effects
        pools[key].settled = true;
        pools[key].winnerSeat = winnerSeat;

        emit PoolSettled(key, winnerSeat, pools[key].totalPool);
    }

    /**
     * @notice Claim winnings for all winning bets by caller.
     * @param table  PokerTable address.
     * @param handId Hand ID.
     */
    function claimWinnings(address table, uint256 handId) external nonReentrant {
        bytes32 key = _poolKey(table, handId);
        require(pools[key].settled, "Pool not yet settled");

        uint8 winnerSeat = pools[key].winnerSeat;
        uint256 totalPool = pools[key].totalPool;
        uint256 winnerTotal = seatTotals[key][winnerSeat];

        require(winnerTotal > 0, "No bets on winning seat");

        Bet[] storage bets = userBets[key][msg.sender];
        uint256 totalPayout = 0;

        for (uint256 i = 0; i < bets.length; i++) {
            Bet storage bet = bets[i];
            if (bet.seatIndex == winnerSeat && !bet.claimed) {
                // proportional payout: userBet * totalPool / winnerTotal
                uint256 payout = (bet.amount * totalPool) / winnerTotal;
                bet.claimed = true;
                totalPayout += payout;
            }
        }

        require(totalPayout > 0, "No winnings to claim");

        // Interaction last (checks-effects-interactions)
        (bool ok, ) = msg.sender.call{value: totalPayout}("");
        require(ok, "Transfer failed");

        emit WinningsClaimed(key, msg.sender, totalPayout);
    }

    // ============ View Functions ============

    function getPoolInfo(address table, uint256 handId)
        external
        view
        returns (Pool memory pool)
    {
        return pools[_poolKey(table, handId)];
    }

    function getUserBets(address table, uint256 handId, address user)
        external
        view
        returns (Bet[] memory)
    {
        return userBets[_poolKey(table, handId)][user];
    }

    /**
     * @notice Returns implied odds (in basis points, 10000 = 1x) for each seat.
     *         odds[seat] = totalPool * 10000 / seatTotals[seat], or 0 if no bets.
     */
    function getSeatOdds(address table, uint256 handId)
        external
        view
        returns (uint256[] memory odds)
    {
        bytes32 key = _poolKey(table, handId);
        IPokerTableView pokerTable = IPokerTableView(table);
        uint8 numSeats = pokerTable.numSeats();

        odds = new uint256[](numSeats);
        uint256 totalPool = pools[key].totalPool;

        if (totalPool == 0) return odds;

        for (uint8 i = 0; i < numSeats; i++) {
            uint256 st = seatTotals[key][i];
            if (st > 0) {
                odds[i] = (totalPool * 10000) / st;
            }
        }
    }

    /**
     * @notice Returns seat totals for a pool.
     */
    function getSeatTotals(address table, uint256 handId)
        external
        view
        returns (uint256[] memory totals)
    {
        bytes32 key = _poolKey(table, handId);
        IPokerTableView pokerTable = IPokerTableView(table);
        uint8 numSeats = pokerTable.numSeats();

        totals = new uint256[](numSeats);
        for (uint8 i = 0; i < numSeats; i++) {
            totals[i] = seatTotals[key][i];
        }
    }
}
