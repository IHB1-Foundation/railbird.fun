// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";

/**
 * @title ProductionVRFAdapter
 * @notice Production VRF adapter using a trusted operator for randomness fulfillment.
 * @dev The operator is a backend service that provides cryptographically secure randomness.
 *      Request tracking ensures each request is fulfilled exactly once.
 *      Future versions can integrate with decentralized VRF providers (e.g., Pyth, Gelato).
 */
contract ProductionVRFAdapter is IVRFAdapter {
    // ============ State Variables ============
    address public owner;
    address public operator;
    uint256 public nextRequestId = 1;

    struct VRFRequest {
        address table;
        uint256 tableId;
        uint256 handId;
        uint8 purpose;
        uint256 requestedAt;
        uint256 requestedBlock;
        bool fulfilled;
    }

    mapping(uint256 => VRFRequest) public requests;

    // ============ Events ============
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

    // ============ Modifiers ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    modifier onlyOperator() {
        require(msg.sender == operator, "Only operator");
        _;
    }

    // ============ Constructor ============
    constructor(address _operator) {
        require(_operator != address(0), "Operator cannot be zero");
        owner = msg.sender;
        operator = _operator;
    }

    // ============ IVRFAdapter ============

    /**
     * @notice Request randomness - called by PokerTable when betting round completes.
     */
    function requestRandomness(
        uint256 tableId,
        uint256 handId,
        uint8 purpose
    ) external override returns (uint256 requestId) {
        requestId = nextRequestId++;

        requests[requestId] = VRFRequest({
            table: msg.sender,
            tableId: tableId,
            handId: handId,
            purpose: purpose,
            requestedAt: block.timestamp,
            requestedBlock: block.number,
            fulfilled: false
        });

        emit RandomnessRequested(requestId, msg.sender, tableId, handId, purpose);

        return requestId;
    }

    /**
     * @notice Fulfill a VRF request with randomness.
     * @dev Only the designated operator can call this.
     * @param requestId The request to fulfill
     * @param randomness The random value to provide
     */
    function fulfillRandomness(uint256 requestId, uint256 randomness) external onlyOperator {
        VRFRequest storage req = requests[requestId];
        require(req.table != address(0), "Request not found");
        require(!req.fulfilled, "Already fulfilled");

        req.fulfilled = true;

        emit RandomnessFulfilled(requestId, req.table, randomness);

        // Callback to PokerTable
        (bool success,) = req.table.call(
            abi.encodeWithSignature("fulfillVRF(uint256,uint256)", requestId, randomness)
        );
        require(success, "VRF callback failed");
    }

    // ============ Admin Functions ============

    function setOperator(address _operator) external onlyOwner {
        require(_operator != address(0), "Operator cannot be zero");
        address old = operator;
        operator = _operator;
        emit OperatorUpdated(old, _operator);
    }

    function transferOwnership(address _newOwner) external onlyOwner {
        require(_newOwner != address(0), "Owner cannot be zero");
        address old = owner;
        owner = _newOwner;
        emit OwnerUpdated(old, _newOwner);
    }

    // ============ View Functions ============

    function getRequest(uint256 requestId) external view returns (
        address table,
        uint256 tableId,
        uint256 handId,
        uint8 purpose,
        uint256 requestedAt,
        uint256 requestedBlock,
        bool fulfilled
    ) {
        VRFRequest storage req = requests[requestId];
        return (
            req.table,
            req.tableId,
            req.handId,
            req.purpose,
            req.requestedAt,
            req.requestedBlock,
            req.fulfilled
        );
    }

    function isRequestPending(uint256 requestId) external view returns (bool) {
        VRFRequest storage req = requests[requestId];
        return req.table != address(0) && !req.fulfilled;
    }

    function isRequestTimedOut(uint256 requestId, uint256 timeout) external view returns (bool) {
        VRFRequest storage req = requests[requestId];
        if (req.table == address(0) || req.fulfilled) return false;
        return block.timestamp > req.requestedAt + timeout;
    }
}
