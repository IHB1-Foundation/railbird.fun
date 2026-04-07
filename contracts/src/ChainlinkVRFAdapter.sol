// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IVRFAdapter.sol";

// ---------------------------------------------------------------------------
// Chainlink VRF V2 interface stubs
// In production, import from @chainlink/contracts:
//   import "@chainlink/contracts/src/v0.8/interfaces/VRFCoordinatorV2Interface.sol";
//   import "@chainlink/contracts/src/v0.8/VRFConsumerBaseV2.sol";
// ---------------------------------------------------------------------------

interface IVRFCoordinatorV2 {
    function requestRandomWords(
        bytes32 keyHash,
        uint64 subId,
        uint16 requestConfirmations,
        uint32 callbackGasLimit,
        uint32 numWords
    ) external returns (uint256 requestId);
}

/**
 * @title ChainlinkVRFAdapter
 * @notice Skeleton adapter that integrates Chainlink VRF V2 with the PokerTable via IVRFAdapter.
 *
 * ARCHITECTURE
 * ============
 * PokerTable ──requestRandomness()──▶ ChainlinkVRFAdapter
 *                                        │
 *                                        │  vrfCoordinator.requestRandomWords()
 *                                        ▼
 *                                    Chainlink VRF Coordinator
 *                                        │
 *                                        │  rawFulfillRandomWords() callback
 *                                        ▼
 *                                    ChainlinkVRFAdapter
 *                                        │
 *                                        │  table.fulfillVRF(internalId, randomness)
 *                                        ▼
 *                                    PokerTable
 *
 * MIGRATION FROM ProductionVRFAdapter
 * ====================================
 * 1. Deploy ChainlinkVRFAdapter with the Chainlink VRF Coordinator address, key hash,
 *    and a funded subscription ID.
 * 2. Add the adapter address as a consumer of your subscription in the Chainlink dashboard
 *    (or via IVRFCoordinatorV2.addConsumer()).
 * 3. Deploy PokerTable with `vrfAdapter = address(chainlinkVRFAdapter)`.
 *    No changes to PokerTable are required — the IVRFAdapter interface is identical.
 * 4. The ProductionVRFAdapter can remain deployed for dev/testnet environments.
 *
 * VERIFICATION NOTE
 * =================
 * Unlike ProductionVRFAdapter, Chainlink VRF provides on-chain cryptographic proof of
 * randomness. The proof is verified inside the coordinator before rawFulfillRandomWords()
 * is called, so the adapter does not need to perform additional verification.
 *
 * @dev Production deployment checklist (all items verifiable pre-deploy):
 *   1. Coordinator guard: this stub uses an explicit `onlyVRFCoordinator` modifier.
 *      When migrating to the official chainlink/contracts package, replace with
 *      `VRFConsumerBaseV2(coordinatorAddress)` and override `fulfillRandomWords`.
 *   2. Subscription funding: `requestRandomWords` will revert at the coordinator
 *      level if the subscription is underfunded — no additional guard is needed
 *      in this contract. Monitor subscription balance off-chain before deployment.
 *   3. REQUEST_CONFIRMATIONS and CALLBACK_GAS_LIMIT are exposed as public constants;
 *      tune them per target network before deployment.
 */
contract ChainlinkVRFAdapter is IVRFAdapter {
    // ============ Immutables ============
    address public immutable vrfCoordinator;
    bytes32 public immutable keyHash;
    uint64  public immutable subscriptionId;
    uint16  public constant  REQUEST_CONFIRMATIONS = 3;
    uint32  public constant  CALLBACK_GAS_LIMIT    = 200_000;
    uint32  public constant  NUM_WORDS             = 1;

    // ============ State ============
    address public owner;

    /// Internal request counter (matches ProductionVRFAdapter pattern).
    uint256 public nextInternalId = 1;

    struct Request {
        address table;
        uint256 tableId;
        uint256 handId;
        uint8   purpose;
        bool    fulfilled;
    }

    /// chainlinkRequestId → our internal request
    mapping(uint256 => Request) public requestsByChainlinkId;
    /// internalRequestId → chainlinkRequestId (for logging / debugging)
    mapping(uint256 => uint256) public chainlinkIdByInternal;
    /// chainlinkRequestId → internalRequestId (O(1) reverse lookup)
    mapping(uint256 => uint256) public internalIdByChainlink;

    // ============ Events ============
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
    event OwnerTransferred(address indexed oldOwner, address indexed newOwner);

    // ============ Modifiers ============
    modifier onlyOwner() {
        require(msg.sender == owner, "Only owner");
        _;
    }

    /// @dev In production replace this with VRFConsumerBaseV2's onlyVRFCoordinator modifier.
    modifier onlyVRFCoordinator() {
        require(msg.sender == vrfCoordinator, "Only VRF coordinator");
        _;
    }

    // ============ Constructor ============
    /**
     * @param _vrfCoordinator  Chainlink VRF V2 coordinator address for the target network.
     *                         Monad: TBD once Chainlink deploys there.
     * @param _keyHash         Gas lane key hash (controls max gas price for callbacks).
     * @param _subscriptionId  Funded Chainlink VRF subscription ID.
     */
    constructor(
        address _vrfCoordinator,
        bytes32 _keyHash,
        uint64  _subscriptionId
    ) {
        require(_vrfCoordinator != address(0), "Invalid coordinator");
        vrfCoordinator  = _vrfCoordinator;
        keyHash         = _keyHash;
        subscriptionId  = _subscriptionId;
        owner           = msg.sender;
    }

    // ============ IVRFAdapter ============

    /**
     * @notice Called by PokerTable when a betting round completes and randomness is needed.
     *         Forwards to Chainlink VRF coordinator and returns our internal request ID.
     */
    function requestRandomness(
        uint256 tableId,
        uint256 handId,
        uint8   purpose
    ) external override returns (uint256 internalRequestId) {
        // The coordinator reverts automatically when the subscription is underfunded.
        // Monitor subscription balance off-chain before production deployment.
        uint256 clRequestId = IVRFCoordinatorV2(vrfCoordinator).requestRandomWords(
            keyHash,
            subscriptionId,
            REQUEST_CONFIRMATIONS,
            CALLBACK_GAS_LIMIT,
            NUM_WORDS
        );

        internalRequestId = nextInternalId++;

        requestsByChainlinkId[clRequestId] = Request({
            table:     msg.sender,
            tableId:   tableId,
            handId:    handId,
            purpose:   purpose,
            fulfilled: false
        });
        chainlinkIdByInternal[internalRequestId] = clRequestId;
        internalIdByChainlink[clRequestId] = internalRequestId;

        emit RandomnessRequested(
            internalRequestId,
            clRequestId,
            msg.sender,
            tableId,
            handId,
            purpose
        );

        return internalRequestId;
    }

    // ============ Chainlink VRF Callback ============

    /**
     * @notice Called by the Chainlink VRF coordinator after randomness is generated and verified.
     * @dev In production, override VRFConsumerBaseV2.fulfillRandomWords() instead; the base
     *      contract provides the onlyVRFCoordinator guard automatically.
     *      Here we use an explicit modifier for the standalone stub.
     */
    function rawFulfillRandomWords(
        uint256 chainlinkRequestId,
        uint256[] calldata randomWords
    ) external onlyVRFCoordinator {
        Request storage req = requestsByChainlinkId[chainlinkRequestId];
        require(req.table != address(0), "Unknown request");
        require(!req.fulfilled,          "Already fulfilled");
        require(randomWords.length > 0,  "No random words");

        req.fulfilled = true;

        uint256 randomness = randomWords[0];

        // O(1) reverse lookup — previously this was a linear scan through all requests.
        uint256 internalId = internalIdByChainlink[chainlinkRequestId];
        require(internalId != 0, "Internal ID not found");

        emit RandomnessFulfilled(internalId, chainlinkRequestId, req.table, randomness);

        // Callback into PokerTable — identical to ProductionVRFAdapter.
        (bool success,) = req.table.call(
            abi.encodeWithSignature("fulfillVRF(uint256,uint256)", internalId, randomness)
        );
        require(success, "VRF callback failed");
    }

    // ============ Admin ============

    /// @notice Transfer ownership of this adapter to a new address.
    /// @param newOwner New owner address (must be non-zero).
    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Zero address");
        emit OwnerTransferred(owner, newOwner);
        owner = newOwner;
    }

    // ============ View Helpers ============

    /// @notice Check whether a Chainlink VRF request has been fulfilled.
    /// @param chainlinkRequestId The Chainlink-assigned request ID.
    /// @return True if the randomness has been delivered.
    function isRequestFulfilled(uint256 chainlinkRequestId) external view returns (bool) {
        return requestsByChainlinkId[chainlinkRequestId].fulfilled;
    }

}
