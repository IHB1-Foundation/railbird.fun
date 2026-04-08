// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./PokerTableBase.sol";

/**
 * @title SeatManager
 * @notice Seat registration, top-up, cash-out, emergency withdrawal, encryption keys,
 *         and internal seat/button helpers.
 * @dev Abstract — inherited by PokerTable.
 */
abstract contract SeatManager is PokerTableBase {
    using SafeTransfer for address;

    // ============ Admin Functions ============

    function setAdmin(address _newAdmin) external onlyAdmin {
        require(_newAdmin != address(0), "Invalid admin");
        emit AdminUpdated(admin, _newAdmin);
        admin = _newAdmin;
    }

    function setDealer(address _newDealer) external onlyAdmin {
        require(_newDealer != address(0), "Invalid dealer");
        emit DealerUpdated(dealer, _newDealer);
        dealer = _newDealer;
    }

    function setVRFAdapter(address _newAdapter) external onlyAdmin {
        require(_newAdapter != address(0), "Invalid VRF adapter");
        emit VRFAdapterUpdated(vrfAdapter, _newAdapter);
        vrfAdapter = _newAdapter;
    }

    function setPlayerRegistry(address _registry) external onlyAdmin {
        emit PlayerRegistryUpdated(playerRegistry, _registry);
        playerRegistry = _registry;
    }

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

    function pause() external onlyAdmin {
        require(!paused, "Already paused");
        paused = true;
        emit TablePaused(msg.sender);
    }

    function unpause() external onlyAdmin {
        require(paused, "Not paused");
        paused = false;
        emit TableUnpaused(msg.sender);
    }

    // ============ Emergency Withdrawal ============

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

        seats[seatIndex].stack = 0;
        emergencyWithdrawRequestedAt[seatIndex] = 0;

        address(chipToken).safeTransfer(recipient, amount);
        emit EmergencyWithdrawExecuted(seatIndex, recipient, amount);
    }

    // ============ Seat Management ============

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
            stack: buyIn,
            isActive: false,
            currentBet: 0,
            isAllIn: false,
            totalHandBet: 0
        });

        if (gameState != GameState.WAITING_FOR_SEATS) {
            needsPostBlind[seatIndex] = true;
        }

        emit SeatUpdated(seatIndex, owner, operator == address(0) ? owner : operator, buyIn);
        _tryVaultFundBuyIn(owner, buyIn);
    }

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

        _tryVaultReleaseEscrow(seatOwner, amount);
    }

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

        _tryVaultReleaseEscrow(seatOwner, payoutAmount);
    }

    function allSeatsFilled() public view returns (bool) {
        for (uint8 i = 0; i < numSeats; i++) {
            if (seats[i].owner == address(0)) return false;
        }
        return true;
    }

    // ============ Encryption Key Registry ============

    function registerEncryptionKey(uint8 seatIndex, bytes calldata pubKey) external {
        require(seatIndex < numSeats, "Invalid seat");
        require(
            msg.sender == seats[seatIndex].owner || msg.sender == seats[seatIndex].operator,
            "Not owner or operator"
        );
        require(pubKey.length == 33 || pubKey.length == 65, "Invalid pubKey length");
        require(
            gameState == GameState.WAITING_FOR_SEATS ||
            gameState == GameState.SETTLED ||
            gameState == GameState.TOURNAMENT_OVER,
            "EncKeyReg: hand in progress"
        );

        encryptionKeys[seatIndex] = pubKey;
        emit EncryptionKeyRegistered(seatIndex, pubKey);
    }

    function getEncryptionKey(uint8 seatIndex) external view returns (bytes memory) {
        require(seatIndex < numSeats, "Invalid seat");
        return encryptionKeys[seatIndex];
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
        revert("No playable seat found");
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
                address owner = seats[i].owner;
                delete seats[i];
                needsPostBlind[i] = false;
                emit SeatUpdated(i, address(0), address(0), 0);
                emit SeatEvicted(i, owner);
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

    // ============ Vault Helpers ============

    function _getVaultForOwner(address seatOwner) internal view returns (address) {
        if (playerRegistry == address(0) || seatOwner == address(0)) return address(0);
        try IPlayerRegistry(playerRegistry).agents(seatOwner) returns (
            address vault, address, address, address, string memory, bool isReg
        ) {
            if (isReg && vault.code.length > 0) return vault;
        } catch {}
        return address(0);
    }

    function _tryVaultFundBuyIn(address seatOwner, uint256 amount) internal {
        address vault = _getVaultForOwner(seatOwner);
        if (vault == address(0)) return;
        try IPlayerVaultEscrow(vault).fundBuyIn(address(this), amount) {} catch {}
    }

    function _tryVaultReleaseEscrow(address seatOwner, uint256 amount) internal {
        if (amount == 0) return;
        address vault = _getVaultForOwner(seatOwner);
        if (vault == address(0)) return;
        try IPlayerVaultEscrow(vault).releaseEscrow(address(this), amount) {} catch {}
    }
}
