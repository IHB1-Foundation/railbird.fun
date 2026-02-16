// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ProductionVRFAdapter.sol";
import "../src/PokerTable.sol";
import "../src/RailbirdChip.sol";

contract ProductionVRFAdapterTest is Test {
    ProductionVRFAdapter public adapter;
    PokerTable public pokerTable;
    RailbirdChip public chip;

    address public deployerOwner = address(this);
    address public vrfOperator = address(0xBEEF);
    address public randomUser = address(0xCAFE);

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);
    address public owner3 = address(0x3);
    address public owner4 = address(0x4);
    address public operator1 = address(0x11);
    address public operator2 = address(0x22);
    address public operator3 = address(0x33);
    address public operator4 = address(0x44);

    uint256 constant BUY_IN = 1000;
    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND = 20;

    event RandomnessRequested(
        uint256 indexed requestId,
        address indexed table,
        uint256 tableId,
        uint256 handId,
        uint8 purpose
    );

    event RandomnessFulfilled(
        uint256 indexed requestId,
        address indexed table,
        uint256 randomness
    );

    event OperatorUpdated(address indexed oldOperator, address indexed newOperator);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    function setUp() public {
        adapter = new ProductionVRFAdapter(vrfOperator);
        chip = new RailbirdChip(address(this));
        _fundOwners();
    }

    // ============ Constructor Tests ============

    function test_Constructor_SetsOwnerAndOperator() public view {
        assertEq(adapter.owner(), deployerOwner);
        assertEq(adapter.operator(), vrfOperator);
    }

    function test_Constructor_RevertZeroOperator() public {
        vm.expectRevert("Operator cannot be zero");
        new ProductionVRFAdapter(address(0));
    }

    // ============ requestRandomness Tests ============

    function test_RequestRandomness_StoresRequest() public {
        vm.prank(address(0xAA));
        uint256 reqId = adapter.requestRandomness(1, 5, 3);
        assertEq(reqId, 1);

        (address table, uint256 tableId, uint256 handId, uint8 purpose, uint256 requestedAt, uint256 requestedBlock, bool fulfilled) =
            adapter.getRequest(reqId);

        assertEq(table, address(0xAA));
        assertEq(tableId, 1);
        assertEq(handId, 5);
        assertEq(purpose, 3);
        assertEq(requestedAt, block.timestamp);
        assertEq(requestedBlock, block.number);
        assertFalse(fulfilled);
    }

    function test_RequestRandomness_EmitsEvent() public {
        vm.prank(address(0xAA));
        vm.expectEmit(true, true, false, true);
        emit RandomnessRequested(1, address(0xAA), 1, 5, 3);
        adapter.requestRandomness(1, 5, 3);
    }

    function test_RequestRandomness_IncrementsId() public {
        vm.prank(address(0xAA));
        uint256 id1 = adapter.requestRandomness(1, 1, 3);
        vm.prank(address(0xAA));
        uint256 id2 = adapter.requestRandomness(1, 2, 5);

        assertEq(id1, 1);
        assertEq(id2, 2);
    }

    // ============ fulfillRandomness Tests ============

    function test_FulfillRandomness_SuccessAsOperator() public {
        vm.prank(address(0xAA));
        uint256 reqId = adapter.requestRandomness(1, 1, 3);

        // Need a contract that accepts fulfillVRF callback
        _setupPokerTableForFulfillment();

        // Request via poker table
        _startHandAndGetToVRF();
        uint256 tableReqId = pokerTable.pendingVRFRequestId();

        vm.prank(vrfOperator);
        adapter.fulfillRandomness(tableReqId, 999);

        (, , , , , , bool fulfilled) = adapter.getRequest(tableReqId);
        assertTrue(fulfilled);
    }

    function test_FulfillRandomness_RevertIfNotOperator() public {
        vm.prank(address(0xAA));
        adapter.requestRandomness(1, 1, 3);

        vm.prank(randomUser);
        vm.expectRevert("Only operator");
        adapter.fulfillRandomness(1, 999);
    }

    function test_FulfillRandomness_RevertIfNotFound() public {
        vm.prank(vrfOperator);
        vm.expectRevert("Request not found");
        adapter.fulfillRandomness(999, 123);
    }

    function test_FulfillRandomness_RevertIfAlreadyFulfilled() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();
        uint256 reqId = pokerTable.pendingVRFRequestId();

        vm.prank(vrfOperator);
        adapter.fulfillRandomness(reqId, 999);

        vm.prank(vrfOperator);
        vm.expectRevert("Already fulfilled");
        adapter.fulfillRandomness(reqId, 111);
    }

    function test_FulfillRandomness_EmitsEvent() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();
        uint256 reqId = pokerTable.pendingVRFRequestId();

        vm.prank(vrfOperator);
        vm.expectEmit(true, true, false, true);
        emit RandomnessFulfilled(reqId, address(pokerTable), 999);
        adapter.fulfillRandomness(reqId, 999);
    }

    // ============ Admin Tests ============

    function test_SetOperator_Success() public {
        address newOp = address(0xDEAD);

        vm.expectEmit(true, true, false, false);
        emit OperatorUpdated(vrfOperator, newOp);
        adapter.setOperator(newOp);

        assertEq(adapter.operator(), newOp);
    }

    function test_SetOperator_RevertIfNotOwner() public {
        vm.prank(randomUser);
        vm.expectRevert("Only owner");
        adapter.setOperator(address(0xDEAD));
    }

    function test_SetOperator_RevertZeroAddress() public {
        vm.expectRevert("Operator cannot be zero");
        adapter.setOperator(address(0));
    }

    function test_TransferOwnership_Success() public {
        address newOwner = address(0xDEAD);

        vm.expectEmit(true, true, false, false);
        emit OwnerUpdated(deployerOwner, newOwner);
        adapter.transferOwnership(newOwner);

        assertEq(adapter.owner(), newOwner);
    }

    function test_TransferOwnership_RevertIfNotOwner() public {
        vm.prank(randomUser);
        vm.expectRevert("Only owner");
        adapter.transferOwnership(address(0xDEAD));
    }

    function test_TransferOwnership_RevertZeroAddress() public {
        vm.expectRevert("Owner cannot be zero");
        adapter.transferOwnership(address(0));
    }

    // ============ View Function Tests ============

    function test_IsRequestPending_True() public {
        vm.prank(address(0xAA));
        uint256 reqId = adapter.requestRandomness(1, 1, 3);
        assertTrue(adapter.isRequestPending(reqId));
    }

    function test_IsRequestPending_FalseForUnknown() public view {
        assertFalse(adapter.isRequestPending(999));
    }

    function test_IsRequestTimedOut_TrueAfterTimeout() public {
        vm.prank(address(0xAA));
        uint256 reqId = adapter.requestRandomness(1, 1, 3);

        vm.warp(block.timestamp + 6 minutes);
        assertTrue(adapter.isRequestTimedOut(reqId, 5 minutes));
    }

    function test_IsRequestTimedOut_FalseBeforeTimeout() public {
        vm.prank(address(0xAA));
        uint256 reqId = adapter.requestRandomness(1, 1, 3);

        vm.warp(block.timestamp + 2 minutes);
        assertFalse(adapter.isRequestTimedOut(reqId, 5 minutes));
    }

    // ============ Integration: ProductionVRFAdapter + PokerTable ============

    function test_Integration_FullHandWithProductionAdapter() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();

        // Verify table is waiting for VRF
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.WAITING_VRF_FLOP));

        // Operator fulfills VRF
        uint256 reqId = pokerTable.pendingVRFRequestId();
        vm.prank(vrfOperator);
        adapter.fulfillRandomness(reqId, 12345);

        // Table should now be in BETTING_FLOP
        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));

        // Verify community cards were dealt
        uint8[5] memory cards = pokerTable.getCommunityCards();
        assertTrue(cards[0] < 52);
        assertTrue(cards[1] < 52);
        assertTrue(cards[2] < 52);
        assertEq(cards[3], 255); // Turn not yet dealt
        assertEq(cards[4], 255); // River not yet dealt
    }

    function test_Integration_FulfillVRF_RevertIfNotAdapter() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();

        uint256 reqId = pokerTable.pendingVRFRequestId();

        // Random address cannot call fulfillVRF
        vm.prank(randomUser);
        vm.expectRevert("Only VRF adapter");
        pokerTable.fulfillVRF(reqId, 999);
    }

    function test_Integration_ReRequestVRF_AfterTimeout() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();

        uint256 oldReqId = pokerTable.pendingVRFRequestId();

        // Wait for VRF timeout
        vm.warp(block.timestamp + 6 minutes);

        // Re-request VRF
        pokerTable.reRequestVRF();

        uint256 newReqId = pokerTable.pendingVRFRequestId();
        assertTrue(newReqId != oldReqId);
        assertTrue(newReqId > oldReqId);

        // Fulfill the new request
        vm.prank(vrfOperator);
        adapter.fulfillRandomness(newReqId, 54321);

        assertEq(uint256(pokerTable.gameState()), uint256(PokerTable.GameState.BETTING_FLOP));
    }

    function test_Integration_ReRequestVRF_RevertBeforeTimeout() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();

        vm.expectRevert("VRF timeout not reached");
        pokerTable.reRequestVRF();
    }

    function test_Integration_OldRequestRejectedAfterReRequest() public {
        _setupPokerTableForFulfillment();
        _startHandAndGetToVRF();

        uint256 oldReqId = pokerTable.pendingVRFRequestId();

        // Re-request after timeout
        vm.warp(block.timestamp + 6 minutes);
        pokerTable.reRequestVRF();

        // Old request fulfillment should fail (wrong request ID)
        vm.prank(vrfOperator);
        vm.expectRevert("VRF callback failed");
        adapter.fulfillRandomness(oldReqId, 999);
    }

    // ============ Helpers ============

    function _setupPokerTableForFulfillment() internal {
        pokerTable = new PokerTable(1, SMALL_BLIND, BIG_BLIND, address(adapter), address(chip));
        _approveOwnersForCurrentTable();
        pokerTable.registerSeat(0, owner1, operator1, BUY_IN);
        pokerTable.registerSeat(1, owner2, operator2, BUY_IN);
        pokerTable.registerSeat(2, owner3, operator3, BUY_IN);
        pokerTable.registerSeat(3, owner4, operator4, BUY_IN);
    }

    function _fundOwners() internal {
        chip.mint(owner1, BUY_IN * 1000);
        chip.mint(owner2, BUY_IN * 1000);
        chip.mint(owner3, BUY_IN * 1000);
        chip.mint(owner4, BUY_IN * 1000);
    }

    function _approveOwnersForCurrentTable() internal {
        vm.prank(owner1);
        chip.approve(address(pokerTable), type(uint256).max);
        vm.prank(owner2);
        chip.approve(address(pokerTable), type(uint256).max);
        vm.prank(owner3);
        chip.approve(address(pokerTable), type(uint256).max);
        vm.prank(owner4);
        chip.approve(address(pokerTable), type(uint256).max);
    }

    function _operatorFor(uint8 seat) internal view returns (address) {
        if (seat == 0) return operator1;
        if (seat == 1) return operator2;
        if (seat == 2) return operator3;
        return operator4;
    }

    function _startHandAndGetToVRF() internal {
        pokerTable.startHand();

        // Complete pre-flop: UTG(3) calls, BTN(0) calls, SB(1) calls, BB(2) checks
        vm.prank(operator4);
        vm.roll(block.number + 1);
        pokerTable.call(3);

        vm.prank(operator1);
        vm.roll(block.number + 1);
        pokerTable.call(0);

        vm.prank(operator2);
        vm.roll(block.number + 1);
        pokerTable.call(1);

        vm.prank(operator3);
        vm.roll(block.number + 1);
        pokerTable.check(2);
        // Now in WAITING_VRF_FLOP
    }
}
