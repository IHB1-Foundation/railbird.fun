// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/mocks/MockVRFAdapter.sol";

/**
 * @title TrustlessDealerTest
 * @notice Tests for T1.1 (Encryption Key Registry).
 */
contract TrustlessDealerTest is Test {
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    ChipToken public chipToken;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;
    uint256 constant BUY_IN = 1000;
    uint256 constant TEST_RANDOMNESS = 0xdeadbeefdeadbeef;

    bytes constant COMPRESSED_PUBKEY =
        hex"0279be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798";
    bytes constant UNCOMPRESSED_PUBKEY =
        hex"0479be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8";
    bytes constant BAD_PUBKEY = hex"deadbeef"; // 4 bytes, invalid

    event EncryptionKeyRegistered(uint8 indexed seatIndex, bytes pubKey);

    function setUp() public {
        mockVRF = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chipToken));

        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);
    }

    // ============ T1.1: Encryption Key Registry ============

    function test_RegisterEncryptionKey_CompressedKey() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.expectEmit(true, false, false, true);
        emit EncryptionKeyRegistered(0, COMPRESSED_PUBKEY);

        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);

        bytes memory stored = pokerTable.getEncryptionKey(0);
        assertEq(stored, COMPRESSED_PUBKEY);
    }

    function test_RegisterEncryptionKey_UncompressedKey() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, UNCOMPRESSED_PUBKEY);

        bytes memory stored = pokerTable.getEncryptionKey(0);
        assertEq(stored, UNCOMPRESSED_PUBKEY);
    }

    function test_RegisterEncryptionKey_OperatorCanRegister() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.prank(operator1);
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);

        assertEq(pokerTable.getEncryptionKey(0), COMPRESSED_PUBKEY);
    }

    function test_RegisterEncryptionKey_RotationAllowedBetweenHands() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);

        // Start and complete a hand (old flow: BETTING_PRE directly)
        pokerTable.startHand();

        // SB (seat0 in heads-up) folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Now rotate key
        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, UNCOMPRESSED_PUBKEY);
        assertEq(pokerTable.getEncryptionKey(0), UNCOMPRESSED_PUBKEY);
    }

    function test_RegisterEncryptionKey_RevertInvalidLength() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.prank(owner1);
        vm.expectRevert("Invalid pubKey length");
        pokerTable.registerEncryptionKey(0, BAD_PUBKEY);
    }

    function test_RegisterEncryptionKey_RevertNotOwnerOrOperator() public {
        _registerSeat(0, owner1, operator1, BUY_IN);

        vm.prank(owner2);
        vm.expectRevert("Not owner or operator");
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);
    }

    function test_RegisterEncryptionKey_RevertDuringActiveHand() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        // Now in BETTING_PRE — hand in progress
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.BETTING_PRE)
        );

        vm.prank(owner1);
        vm.expectRevert("EncKeyReg: hand in progress");
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);
    }

    function test_GetEncryptionKey_ReturnsEmptyIfNotRegistered() public view {
        bytes memory key = pokerTable.getEncryptionKey(0);
        assertEq(key.length, 0);
    }

    // ============ Helpers ============

    function _registerSeat(uint8 seatIndex, address owner, address operator, uint256 buyIn) internal {
        vm.prank(owner);
        chipToken.approve(address(pokerTable), buyIn);
        vm.prank(owner);
        pokerTable.registerSeat(seatIndex, owner, operator, buyIn);
    }
}
