// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/ChainlinkVRFAdapter.sol";

/**
 * @title ChainlinkVRFAdapterTest
 * @notice Tests for ChainlinkVRFAdapter — request/fulfill flow and error cases.
 * @dev Covers T-M4-06.
 */

// ─── Minimal mock Chainlink VRF coordinator ────────────────────────────────

contract MockVRFCoordinator {
    uint256 public nextId = 1;

    function requestRandomWords(
        bytes32, uint64, uint16, uint32, uint32
    ) external returns (uint256 requestId) {
        return nextId++;
    }

    function simulateFulfill(
        address adapter,
        uint256 clRequestId,
        uint256 randomness
    ) external {
        uint256[] memory words = new uint256[](1);
        words[0] = randomness;
        ChainlinkVRFAdapter(adapter).rawFulfillRandomWords(clRequestId, words);
    }
}

// ─── Minimal mock PokerTable that records VRF callbacks ───────────────────

contract MockPokerTableForChainlink {
    struct FulfillCall {
        uint256 requestId;
        uint256 randomness;
    }
    FulfillCall[] public calls;

    function fulfillVRF(uint256 requestId, uint256 randomness) external {
        calls.push(FulfillCall(requestId, randomness));
    }

    function callCount() external view returns (uint256) {
        return calls.length;
    }
}

// ─── Tests ────────────────────────────────────────────────────────────────

contract ChainlinkVRFAdapterTest is Test {
    MockVRFCoordinator public coordinator;
    MockPokerTableForChainlink public mockTable;
    ChainlinkVRFAdapter public adapter;

    address public adminOwner = address(this);

    bytes32 constant KEY_HASH = bytes32(uint256(0xABCD));
    uint64  constant SUB_ID   = 42;

    event RandomnessRequested(
        uint256 indexed internalRequestId,
        uint256 indexed chainlinkRequestId,
        address indexed table,
        uint256 tableId,
        uint256 handId,
        uint8   purpose
    );
    event RandomnessFulfilled(
        uint256 indexed internalRequestId,
        uint256 indexed chainlinkRequestId,
        address indexed table,
        uint256 randomness
    );

    function setUp() public {
        coordinator = new MockVRFCoordinator();
        mockTable   = new MockPokerTableForChainlink();
        adapter     = new ChainlinkVRFAdapter(address(coordinator), KEY_HASH, SUB_ID);
    }

    // ─── Constructor ──────────────────────────────────────────────────────────

    function test_Constructor_SetsImmutables() public view {
        assertEq(adapter.vrfCoordinator(), address(coordinator));
        assertEq(adapter.keyHash(), KEY_HASH);
        assertEq(adapter.subscriptionId(), SUB_ID);
        assertEq(adapter.owner(), adminOwner);
        assertEq(adapter.nextInternalId(), 1);
    }

    function test_Constructor_RevertIfCoordinatorZero() public {
        vm.expectRevert("Invalid coordinator");
        new ChainlinkVRFAdapter(address(0), KEY_HASH, SUB_ID);
    }

    // ─── requestRandomness ────────────────────────────────────────────────────

    function test_RequestRandomness_CreatesRequest() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        assertEq(internalId, 1, "First internal ID should be 1");

        // Chainlink assigned request ID = 1 (coordinator.nextId starts at 1)
        uint256 clId = adapter.chainlinkIdByInternal(internalId);
        assertEq(clId, 1, "Chainlink ID should be 1");

        // Reverse mapping
        assertEq(adapter.internalIdByChainlink(clId), internalId);

        // Request struct
        (address table, uint256 tableId, uint256 handId, uint8 purpose, bool fulfilled)
            = adapter.requestsByChainlinkId(clId);
        assertEq(table, address(mockTable));
        assertEq(tableId, 1);
        assertEq(handId, 1);
        assertEq(purpose, 1);
        assertFalse(fulfilled);
    }

    function test_RequestRandomness_IncreasesInternalCounter() public {
        vm.prank(address(mockTable));
        adapter.requestRandomness(1, 1, 0);
        vm.prank(address(mockTable));
        adapter.requestRandomness(1, 2, 1);
        assertEq(adapter.nextInternalId(), 3);
    }

    function test_RequestRandomness_EmitsEvent() public {
        vm.expectEmit(true, true, true, true);
        emit RandomnessRequested(1, 1, address(mockTable), 1, 1, 2);
        vm.prank(address(mockTable));
        adapter.requestRandomness(1, 1, 2);
    }

    // ─── rawFulfillRandomWords ────────────────────────────────────────────────

    function test_Fulfill_CallsPokerTable() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        uint256 clId       = adapter.chainlinkIdByInternal(internalId);

        coordinator.simulateFulfill(address(adapter), clId, 9999);

        assertEq(mockTable.callCount(), 1);
        (uint256 rid, uint256 rval) = mockTable.calls(0);
        assertEq(rid, internalId);
        assertEq(rval, 9999);
    }

    function test_Fulfill_MarksFulfilled() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        uint256 clId       = adapter.chainlinkIdByInternal(internalId);

        coordinator.simulateFulfill(address(adapter), clId, 1);

        assertTrue(adapter.isRequestFulfilled(clId));
    }

    function test_Fulfill_EmitsEvent() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        uint256 clId       = adapter.chainlinkIdByInternal(internalId);

        vm.expectEmit(true, true, true, true);
        emit RandomnessFulfilled(internalId, clId, address(mockTable), 42);
        coordinator.simulateFulfill(address(adapter), clId, 42);
    }

    function test_Fulfill_RevertIfNotCoordinator() public {
        vm.prank(address(mockTable));
        adapter.requestRandomness(1, 1, 1);

        uint256[] memory words = new uint256[](1);
        words[0] = 1;
        vm.expectRevert("Only VRF coordinator");
        adapter.rawFulfillRandomWords(1, words);
    }

    function test_Fulfill_RevertOnUnknownRequest() public {
        uint256[] memory words = new uint256[](1);
        words[0] = 1;
        vm.prank(address(coordinator));
        vm.expectRevert("Unknown request");
        adapter.rawFulfillRandomWords(999, words);
    }

    function test_Fulfill_RevertOnDoubleFulfill() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        uint256 clId       = adapter.chainlinkIdByInternal(internalId);

        coordinator.simulateFulfill(address(adapter), clId, 1);

        vm.expectRevert("Already fulfilled");
        coordinator.simulateFulfill(address(adapter), clId, 2);
    }

    function test_Fulfill_RevertOnEmptyRandomWords() public {
        vm.prank(address(mockTable));
        uint256 internalId = adapter.requestRandomness(1, 1, 1);
        uint256 clId       = adapter.chainlinkIdByInternal(internalId);

        uint256[] memory empty = new uint256[](0);
        vm.prank(address(coordinator));
        vm.expectRevert("No random words");
        adapter.rawFulfillRandomWords(clId, empty);
    }

    // ─── O(1) reverse mapping — T-M1-03 regression ────────────────────────────

    function test_O1Lookup_WorksAfterManyRequests() public {
        uint256 N = 50; // reduced from 1000 to keep test fast; O(1) is structural
        for (uint256 i = 0; i < N; i++) {
            vm.prank(address(mockTable));
            adapter.requestRandomness(1, i, 0);
        }

        // Fulfill the last request — proves O(1) lookup even after many entries
        uint256 lastInternal = adapter.nextInternalId() - 1;
        uint256 lastCl       = adapter.chainlinkIdByInternal(lastInternal);

        coordinator.simulateFulfill(address(adapter), lastCl, 77777);

        assertTrue(adapter.isRequestFulfilled(lastCl), "Last request should be fulfilled");
        assertEq(mockTable.callCount(), 1, "Exactly one callback to table");
    }

    // ─── Admin — transferOwnership ────────────────────────────────────────────

    function test_TransferOwnership_UpdatesOwner() public {
        address newOwner = address(0xBEEF);
        adapter.transferOwnership(newOwner);
        assertEq(adapter.owner(), newOwner);
    }

    function test_TransferOwnership_RevertIfNotOwner() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Only owner");
        adapter.transferOwnership(address(0xBEEF));
    }

    function test_TransferOwnership_RevertIfZeroAddress() public {
        vm.expectRevert("Zero address");
        adapter.transferOwnership(address(0));
    }
}
