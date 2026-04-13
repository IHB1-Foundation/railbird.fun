// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";

interface IPlayerRegistry {
    function isRegistered(address agent) external view returns (bool);
    function getVault(address agent) external view returns (address);
}

interface IPlayerVaultBuyIn {
    function fundBuyIn(address table, uint256 amount) external;
    function releaseEscrow(address table, uint256 amount) external;
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
        require(seatIndex < numSeats, "S1");
        require(
            gameState == GameState.WAITING_FOR_SEATS ||
            gameState == GameState.SETTLED ||
            gameState == GameState.TOURNAMENT_OVER,
            "EncKeyReg: hand in progress"
        );
        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner || msg.sender == seat.operator, "S9");
        require(
            (pubKey.length == 33 && (pubKey[0] == 0x02 || pubKey[0] == 0x03)) ||
            (pubKey.length == 65 && pubKey[0] == 0x04),
            "Invalid pubKey length"
        );
        encryptionKeys[seatIndex] = pubKey;
        emit EncryptionKeyRegistered(seatIndex, pubKey);
    }

    /// @notice Returns the registered ECIES public key for a seat.
    function getEncryptionKey(uint8 seatIndex) external view returns (bytes memory) {
        return encryptionKeys[seatIndex];
    }

    function setPlayerRegistry(address _registry) external {
        require(msg.sender == admin, "Not admin");
        playerRegistry = _registry;
    }

    function setVRFAdapter(address _newVRF) external {
        require(msg.sender == admin, "Not admin");
        require(_newVRF != address(0), "Invalid VRF adapter");
        vrfAdapter = _newVRF;
    }

    function setBlinds(uint256 _smallBlind, uint256 _bigBlind) external {
        require(msg.sender == admin, "Not admin");
        require(_bigBlind >= _smallBlind, "Big blind must be >= small blind");
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "Cannot update blinds mid-hand"
        );
        smallBlind = _smallBlind;
        bigBlind = _bigBlind;
    }

    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "A1");
        emit AdminUpdated(admin, _newAdmin);
        admin = _newAdmin;
    }

    function setDealer(address _newDealer) external onlyAdmin {
        require(_newDealer != address(0), "A2");
        emit DealerUpdated(dealer, _newDealer);
        dealer = _newDealer;
    }

    function pause() external onlyAdmin {
        require(!paused, "A3");
        paused = true;
        emit TablePaused(msg.sender);
    }

    function unpause() external onlyAdmin {
        require(paused, "A4");
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
        require(seatIndex < numSeats, "S1");
        require(seats[seatIndex].owner == address(0), "S2");
        require(owner != address(0), "S3");
        require(buyIn >= bigBlind * 10, "S4");
        if (playerRegistry != address(0)) {
            require(IPlayerRegistry(playerRegistry).isRegistered(owner), "S13");
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
        _notifyVaultBuyIn(owner, buyIn);
    }

    function leaveSeat(uint8 seatIndex, address recipient) external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "S7"
        );
        require(seatIndex < numSeats, "S1");

        Seat memory seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner, "S9");

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
        _notifyVaultRelease(seatOwner, payoutAmount);
    }

    /**
     * @notice Add chips to a seat's stack without leaving and re-registering.
     *         Callable by the seat owner between hands.
     */
    function topUpSeat(uint8 seatIndex, uint256 amount) external {
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "S7"
        );
        require(seatIndex < numSeats, "S1");
        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner, "S9");
        require(amount > 0, "S11");

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
        require(
            gameState == GameState.WAITING_FOR_SEATS || gameState == GameState.SETTLED,
            "S7"
        );
        require(seatIndex < numSeats, "S1");

        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner, "S9");
        require(amount > 0, "S12");
        require(amount <= seat.stack, "S10");

        address payoutRecipient = recipient == address(0) ? seat.owner : recipient;
        seat.stack -= amount;

        if (amount > 0) {
            address(chipToken).safeTransfer(payoutRecipient, amount);
            _notifyVaultRelease(seat.owner, amount);
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
        require(seatIndex < numSeats, "S1");
        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner, "Not seat owner");
        require(
            paused || (
                pendingVRFRequestId != 0 &&
                block.timestamp > vrfRequestTimestamp + VRF_TIMEOUT
            ),
            "Table not stuck or paused"
        );
        uint256 unlockTime = block.timestamp + EMERGENCY_TIMELOCK;
        emergencyWithdrawRequestedAt[seatIndex] = block.timestamp;
        emit EmergencyWithdrawRequested(seatIndex, unlockTime);
    }

    /**
     * @notice Execute a previously requested emergency withdrawal after the timelock.
     */
    function executeEmergencyWithdraw(uint8 seatIndex, address recipient) external {
        require(seatIndex < numSeats, "S1");
        Seat storage seat = seats[seatIndex];
        require(seat.owner != address(0), "S8");
        require(msg.sender == seat.owner, "Not seat owner");

        uint256 requestedAt = emergencyWithdrawRequestedAt[seatIndex];
        require(requestedAt != 0, "No request");
        require(block.timestamp >= requestedAt + EMERGENCY_TIMELOCK, "Timelock not expired");

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

    // ============ Vault Notification Helpers ============

    function _notifyVaultBuyIn(address owner, uint256 amount) internal {
        if (playerRegistry == address(0)) return;
        address vault = IPlayerRegistry(playerRegistry).getVault(owner);
        if (vault == address(0)) return;
        try IPlayerVaultBuyIn(vault).fundBuyIn(address(this), amount) {
            return;
        } catch {
            return;
        }
    }

    function _notifyVaultRelease(address owner, uint256 amount) internal {
        if (playerRegistry == address(0) || amount == 0) return;
        address vault = IPlayerRegistry(playerRegistry).getVault(owner);
        if (vault == address(0)) return;
        try IPlayerVaultBuyIn(vault).releaseEscrow(address(this), amount) {
            return;
        } catch {
            return;
        }
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
        revert("NP");
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
