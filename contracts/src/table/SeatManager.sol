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
                address owner = seats[i].owner;
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
