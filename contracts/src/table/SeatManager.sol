// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";

interface IPlayerRegistry {
    function isRegistered(address agent) external view returns (bool);
}

/**
 * @title SeatManager
 * @notice Seat registration, top-up, cash-out, emergency withdrawal, encryption keys,
 *         and internal seat/button helpers.
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract SeatManager is PokerTableBase {
    using SafeTransfer for address;

    // ============ Admin Functions ============

    /**
     * @notice Register the ECIES public key for a seat so the dealer can encrypt hole cards.
     *         Accepts both compressed (33 bytes) and uncompressed (65 bytes) keys.
     */
    function registerEncryptionKey(uint8 seatIndex, bytes calldata pubKey) external {
        if (seatIndex >= numSeats) revert SeatError();
        if (
            gameState != GameState.WAITING_FOR_SEATS &&
            gameState != GameState.SETTLED &&
            gameState != GameState.TOURNAMENT_OVER
        ) revert InvalidState();
        Seat storage seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner && msg.sender != seat.operator) revert Unauthorized();
        if (!(
            (pubKey.length == 33 && (pubKey[0] == 0x02 || pubKey[0] == 0x03)) ||
            (pubKey.length == 65 && pubKey[0] == 0x04)
        )) revert InvalidParam();
        encryptionKeys[seatIndex] = pubKey;
        emit EncryptionKeyRegistered(seatIndex, pubKey);
    }

    function setPlayerRegistry(address _registry) external onlyAdmin {
        playerRegistry = _registry;
    }

    function setVRFAdapter(address _newVRF) external onlyAdmin {
        if (_newVRF == address(0)) revert InvalidParam();
        vrfAdapter = _newVRF;
    }

    function setBlinds(uint256 _smallBlind, uint256 _bigBlind) external onlyAdmin {
        if (_bigBlind < _smallBlind) revert InvalidParam();
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) revert InvalidState();
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
    }

    function setAdmin(address _newAdmin) external onlyAdmin {
        if (_newAdmin == address(0)) revert InvalidParam();
        emit AdminUpdated(admin, _newAdmin);
        admin = _newAdmin;
    }

    function setDealer(address _newDealer) external onlyAdmin {
        if (_newDealer == address(0)) revert InvalidParam();
        emit DealerUpdated(dealer, _newDealer);
        dealer = _newDealer;
    }

    function pause() external onlyAdmin {
        if (paused) revert InvalidState();
        paused = true;
        emit TablePaused(msg.sender);
    }

    function unpause() external onlyAdmin {
        if (!paused) revert InvalidState();
        paused = false;
        emit TableUnpaused(msg.sender);
    }

    // ============ Seat Management ============

    function registerSeat(
        uint8 seatIndex,
        address owner,
        address operator,
        uint256 buyIn
    ) external {
        if (seatIndex >= numSeats) revert SeatError();
        if (seats[seatIndex].owner != address(0)) revert SeatError();
        if (owner == address(0)) revert InvalidParam();
        if (buyIn < bigBlind * 10) revert InvalidParam();
        if (playerRegistry != address(0)) {
            if (!IPlayerRegistry(playerRegistry).isRegistered(owner)) revert Unauthorized();
        }
        address(chipToken).safeTransferFrom(msg.sender, address(this), buyIn);

        address op = operator == address(0) ? owner : operator;
        seats[seatIndex] = Seat({
            owner: owner,
            operator: op,
            stack: buyIn,
            isActive: false,
            currentBet: 0,
            isAllIn: false,
            totalHandBet: 0
        });

        if (gameState != GameState.WAITING_FOR_SEATS) {
            needsPostBlind[seatIndex] = true;
        }

        emit SeatUpdated(seatIndex, owner, op, buyIn);
    }

    function leaveSeat(uint8 seatIndex, address recipient) external {
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) revert InvalidState();
        if (seatIndex >= numSeats) revert SeatError();

        Seat memory seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner) revert Unauthorized();

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
    }

    /**
     * @notice Add chips to a seat's stack without leaving and re-registering.
     *         Callable by the seat owner between hands.
     */
    function topUpSeat(uint8 seatIndex, uint256 amount) external {
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) revert InvalidState();
        if (seatIndex >= numSeats) revert SeatError();
        Seat storage seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner) revert Unauthorized();
        if (amount == 0) revert InvalidParam();

        address(chipToken).safeTransferFrom(msg.sender, address(this), amount);
        seat.stack += amount;

        emit SeatUpdated(seatIndex, seat.owner, seat.operator, seat.stack);
    }

    /**
     * @notice Partially withdraw chips from a seat without removing it.
     *         The seat remains registered with a reduced (possibly zero) stack.
     *         Only callable when no hand is in progress.
     * @param seatIndex Seat to withdraw from.
     * @param amount    Chip amount to withdraw (must be <= seat.stack).
     * @param recipient Destination address for chips.
     */
    function cashOutSeat(uint8 seatIndex, uint256 amount, address recipient) external {
        if (gameState != GameState.WAITING_FOR_SEATS && gameState != GameState.SETTLED) revert InvalidState();
        if (seatIndex >= numSeats) revert SeatError();

        Seat storage seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner) revert Unauthorized();
        if (amount == 0) revert InvalidParam();
        if (amount > seat.stack) revert InvalidParam();

        address payoutRecipient = recipient == address(0) ? seat.owner : recipient;
        seat.stack -= amount;

        if (amount > 0) {
            address(chipToken).safeTransfer(payoutRecipient, amount);
        }

        emit SeatUpdated(seatIndex, seat.owner, seat.operator, seat.stack);
    }

    // ============ Emergency Withdrawal ============

    /**
     * @notice Request an emergency withdrawal for a stuck/paused table.
     *         Only callable by the seat owner when the table is paused or VRF has timed out.
     *         Starts a 7-day timelock.
     */
    function requestEmergencyWithdraw(uint8 seatIndex) external {
        if (seatIndex >= numSeats) revert SeatError();
        Seat storage seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner) revert Unauthorized();
        if (!(paused || (pendingVRFRequestId != 0 && block.timestamp > vrfRequestTimestamp + VRF_TIMEOUT))) revert InvalidState();
        uint256 unlockTime = block.timestamp + EMERGENCY_TIMELOCK;
        emergencyWithdrawRequestedAt[seatIndex] = block.timestamp;
        emit EmergencyWithdrawRequested(seatIndex, unlockTime);
    }

    /**
     * @notice Execute a previously requested emergency withdrawal after the timelock.
     */
    function executeEmergencyWithdraw(uint8 seatIndex, address recipient) external {
        if (seatIndex >= numSeats) revert SeatError();
        Seat storage seat = seats[seatIndex];
        if (seat.owner == address(0)) revert SeatError();
        if (msg.sender != seat.owner) revert Unauthorized();

        uint256 requestedAt = emergencyWithdrawRequestedAt[seatIndex];
        if (requestedAt == 0) revert InvalidState();
        if (block.timestamp < requestedAt + EMERGENCY_TIMELOCK) revert InvalidState();

        uint256 amount = seat.stack;
        address payoutRecipient = recipient == address(0) ? seat.owner : recipient;

        delete seats[seatIndex];
        emergencyWithdrawRequestedAt[seatIndex] = 0;

        if (amount > 0) {
            address(chipToken).safeTransfer(payoutRecipient, amount);
        }

        emit EmergencyWithdrawExecuted(seatIndex, payoutRecipient, amount);
        emit SeatUpdated(seatIndex, address(0), address(0), 0);
    }

    // ============ Internal Seat Helpers ============

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
        revert SeatError();
    }

    function _nextOccupiedSeat(uint8 fromSeat) internal view returns (uint8) {
        for (uint8 i = 1; i <= numSeats; i++) {
            uint8 next = (fromSeat + i) % numSeats;
            if (_isSeatOccupied(next)) return next;
        }
        return fromSeat;
    }

    function _advanceButton() internal override {
        buttonSeat = _nextOccupiedSeat(buttonSeat);
    }

    function _evictBustedSeats() internal override {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].owner != address(0) && seats[i].stack == 0) {
                delete seats[i];
                needsPostBlind[i] = false;
                emit SeatUpdated(i, address(0), address(0), 0);
            }
        }

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
