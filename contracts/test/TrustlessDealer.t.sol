// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "../src/mocks/MockVRFAdapter.sol";

/**
 * @title TrustlessDealerTest
 * @notice Tests for T1.1 (Encryption Key Registry), T1.2 (Dealer Seed Commit/Reveal),
 *         and T1.3 (Hole Card VRF Request).
 */
contract TrustlessDealerTest is Test {
    PokerTable public pokerTable;
    MockVRFAdapter public mockVRF;
    ChipToken public chipToken;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public owner3 = address(0x3);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);
    address public operator3 = address(0x33);

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
    event DealerSeedCommitted(uint256 indexed handId, bytes32 commitment);
    event DealerSeedRevealed(uint256 indexed handId, bytes32 seed);
    event HoleCardVRFFulfilled(uint256 indexed handId, uint256 randomness);
    event HoleCardVRFReRequested(uint256 indexed handId, uint256 oldRequestId, uint256 newRequestId);
    event VRFRequested(uint256 indexed handId, PokerTable.GameState street, uint256 requestId);

    function setUp() public {
        mockVRF = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(mockVRF), address(chipToken), address(0));

        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);
        chipToken.mint(owner3, BUY_IN * 100);
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

        // Register, play a hand, then rotate key after settlement
        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);

        // Start and complete a hand
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        // SB (seat0 in heads-up) folds
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));

        // Now rotate key
        bytes memory newKey = UNCOMPRESSED_PUBKEY;
        vm.prank(owner1);
        pokerTable.registerEncryptionKey(0, newKey);

        assertEq(pokerTable.getEncryptionKey(0), newKey);
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
        // Now in WAITING_VRF_HOLECARDS — hand in progress
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_HOLECARDS)
        );

        vm.prank(owner1);
        vm.expectRevert("EncKeyReg: hand in progress");
        pokerTable.registerEncryptionKey(0, COMPRESSED_PUBKEY);
    }

    function test_GetEncryptionKey_ReturnsEmptyIfNotRegistered() public view {
        bytes memory key = pokerTable.getEncryptionKey(0);
        assertEq(key.length, 0);
    }

    // ============ T1.2: Dealer Seed Commit/Reveal ============

    function test_SubmitDealerSeedCommit_DuringWaitingVRF() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand(); // → WAITING_VRF_HOLECARDS

        bytes32 seed = bytes32(uint256(0x123abc));
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        vm.expectEmit(true, false, false, true);
        emit DealerSeedCommitted(1, commitment);

        pokerTable.submitDealerSeedCommit(1, commitment);

        assertEq(pokerTable.dealerSeedCommits(1), commitment);
    }

    function test_SubmitDealerSeedCommit_DuringWaitingForHoleCards() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS); // → WAITING_FOR_HOLECARDS

        bytes32 seed = bytes32(uint256(0x456def));
        bytes32 commitment = keccak256(abi.encodePacked(seed));
        pokerTable.submitDealerSeedCommit(1, commitment);

        assertEq(pokerTable.dealerSeedCommits(1), commitment);
    }

    function test_SubmitDealerSeedCommit_RevertDuplicateCommit() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();

        bytes32 commitment = keccak256(abi.encodePacked(bytes32(uint256(1))));
        pokerTable.submitDealerSeedCommit(1, commitment);

        vm.expectRevert("DealerSeed: already committed");
        pokerTable.submitDealerSeedCommit(1, keccak256(abi.encodePacked(bytes32(uint256(2)))));
    }

    function test_SubmitDealerSeedCommit_RevertEmptyCommitment() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();

        vm.expectRevert("Empty commitment");
        pokerTable.submitDealerSeedCommit(1, bytes32(0));
    }

    function test_RevealDealerSeed_AtShowdown() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        bytes32 seed = bytes32(uint256(0xaabbcc));
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        pokerTable.startHand();
        pokerTable.submitDealerSeedCommit(1, commitment);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        _playHeadsUpToShowdown();

        vm.expectEmit(true, false, false, true);
        emit DealerSeedRevealed(1, seed);

        pokerTable.revealDealerSeed(1, seed);

        assertEq(pokerTable.dealerSeedReveals(1), seed);
    }

    function test_RevealDealerSeed_RevertWrongSeed() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        bytes32 seed = bytes32(uint256(0xaabbcc));
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        pokerTable.startHand();
        pokerTable.submitDealerSeedCommit(1, commitment);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        _playHeadsUpToShowdown();

        vm.expectRevert("DealerSeed: commitment mismatch");
        pokerTable.revealDealerSeed(1, bytes32(uint256(0xdeadbeef)));
    }

    function test_RevealDealerSeed_RevertBeforeShowdown() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        bytes32 seed = bytes32(uint256(0xaabbcc));
        bytes32 commitment = keccak256(abi.encodePacked(seed));

        pokerTable.startHand();
        pokerTable.submitDealerSeedCommit(1, commitment);
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        // Still in BETTING_PRE — not showdown yet
        vm.expectRevert("DealerSeed: not in showdown");
        pokerTable.revealDealerSeed(1, seed);
    }

    function test_RevealDealerSeed_RevertNoCommitment() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        _playHeadsUpToShowdown();

        vm.expectRevert("DealerSeed: no commitment");
        pokerTable.revealDealerSeed(1, bytes32(uint256(0xaabbcc)));
    }

    // ============ T1.3: Hole Card VRF Request ============

    function test_StartHand_TransitionsToWaitingVRFHoleCards() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        vm.expectEmit(true, false, false, false);
        emit VRFRequested(1, PokerTable.GameState.WAITING_VRF_HOLECARDS, 1);

        pokerTable.startHand();

        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_VRF_HOLECARDS)
        );
        assertEq(pokerTable.pendingHoleCardVRFRequestId(), 1);
    }

    function test_FulfillHoleCardVRF_TransitionsToWaitingForHoleCards() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();

        vm.expectEmit(true, false, false, true);
        emit HoleCardVRFFulfilled(1, TEST_RANDOMNESS);

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_FOR_HOLECARDS)
        );
        assertEq(pokerTable.holeCardVRFRandomness(1), TEST_RANDOMNESS);
        assertEq(pokerTable.pendingHoleCardVRFRequestId(), 0);
    }

    function test_AdvanceToPreflop_TransitionsToBettingPre() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);

        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.WAITING_FOR_HOLECARDS)
        );

        pokerTable.advanceToPreflop();

        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.BETTING_PRE)
        );
    }

    function test_AdvanceToPreflop_RevertIfNotInCorrectState() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        // Still in WAITING_VRF_HOLECARDS, not WAITING_FOR_HOLECARDS
        vm.expectRevert("Not waiting for hole cards");
        pokerTable.advanceToPreflop();
    }

    function test_HoleCardVRF_DoesNotAffectCommunityCardVRF() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        // Hole card VRF gets requestId=1
        assertEq(pokerTable.pendingVRFRequestId(), 0); // community card VRF not pending yet

        mockVRF.fulfillLastRequest(TEST_RANDOMNESS); // fulfill hole card VRF
        pokerTable.advanceToPreflop();

        // Community card VRF still not pending
        assertEq(pokerTable.pendingVRFRequestId(), 0);

        // Complete pre-flop betting
        vm.prank(operator1); // SB folds in heads-up
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Hand settled (fold wins), no community card VRF needed
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SETTLED));
    }

    function test_HoleCardVRF_SecondHandUsesNewRandomness() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        // Hand 1
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS);
        pokerTable.advanceToPreflop();

        assertEq(pokerTable.holeCardVRFRandomness(1), TEST_RANDOMNESS);

        // Fold to settle
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.fold(0);

        // Hand 2
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 1);
        pokerTable.advanceToPreflop();

        assertEq(pokerTable.holeCardVRFRandomness(2), TEST_RANDOMNESS + 1);
        // Hand 1 randomness unchanged
        assertEq(pokerTable.holeCardVRFRandomness(1), TEST_RANDOMNESS);
    }

    function test_ReRequestHoleCardVRF_AfterTimeout() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        uint256 oldRequestId = pokerTable.pendingHoleCardVRFRequestId();
        assertEq(oldRequestId, 1);

        // Before timeout
        vm.expectRevert("VRF timeout not reached");
        pokerTable.reRequestHoleCardVRF();

        // After timeout
        vm.warp(block.timestamp + 6 minutes);

        vm.expectEmit(true, false, false, true);
        emit HoleCardVRFReRequested(1, oldRequestId, 2);

        pokerTable.reRequestHoleCardVRF();

        uint256 newRequestId = pokerTable.pendingHoleCardVRFRequestId();
        assertEq(newRequestId, 2);
        assertTrue(newRequestId != oldRequestId);
    }

    function test_ReRequestHoleCardVRF_OldIdRejected() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        uint256 oldRequestId = pokerTable.pendingHoleCardVRFRequestId();

        vm.warp(block.timestamp + 6 minutes);
        pokerTable.reRequestHoleCardVRF();

        // Old request fulfillment should fail (wrong request ID)
        vm.prank(address(mockVRF));
        vm.expectRevert("Invalid request ID");
        pokerTable.fulfillVRF(oldRequestId, TEST_RANDOMNESS);
    }

    function test_FulfillVRF_RevertForHoleCardIfNotInState() public {
        _registerSeat(0, owner1, operator1, BUY_IN);
        _registerSeat(1, owner2, operator2, BUY_IN);

        pokerTable.startHand();
        uint256 hcReqId = pokerTable.pendingHoleCardVRFRequestId();

        // Fulfill once (valid)
        mockVRF.fulfillRandomness(hcReqId, TEST_RANDOMNESS);
        // State now WAITING_FOR_HOLECARDS

        // Trying to fulfill again should fail (state is no longer WAITING_VRF_HOLECARDS)
        vm.prank(address(mockVRF));
        vm.expectRevert("Not waiting for VRF");
        pokerTable.fulfillVRF(hcReqId, TEST_RANDOMNESS + 1);
    }

    // ============ Helpers ============

    function _registerSeat(uint8 seatIndex, address owner, address operator, uint256 buyIn) internal {
        vm.prank(owner);
        chipToken.approve(address(pokerTable), buyIn);
        vm.prank(owner);
        pokerTable.registerSeat(seatIndex, owner, operator, buyIn);
    }

    /**
     * @dev Play a 2-player heads-up hand to SHOWDOWN by checking/calling all streets.
     */
    function _playHeadsUpToShowdown() internal {
        // Pre-flop: SB (seat0) calls, BB (seat1) checks
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);

        // Flop
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 10);
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // Turn
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 11);
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        // River
        mockVRF.fulfillLastRequest(TEST_RANDOMNESS + 12);
        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.check(1);
        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.check(0);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.SHOWDOWN));
    }
}
