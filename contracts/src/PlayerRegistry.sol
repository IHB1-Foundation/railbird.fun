// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PlayerRegistry
 * @notice Canonical mapping from agent wallet address to vault/table/owner/operator.
 * @dev Wallet-based identity: msg.sender registers itself as an agent.
 */
contract PlayerRegistry {
    // ============ Structs ============
    struct AgentInfo {
        address vault;      // PlayerVault contract address
        address table;      // PokerTable contract address
        address owner;      // Wallet that owns this agent
        address operator;   // Wallet that can submit actions (can be same as owner)
        string metaURI;     // Metadata URI (e.g., IPFS link for agent profile)
        bool isRegistered;  // Whether the agent is registered
    }

    // ============ Events ============
    event AgentRegistered(
        address indexed agent,
        address indexed owner,
        address vault,
        address table,
        address operator,
        string metaURI
    );

    event OperatorUpdated(
        address indexed agent,
        address indexed oldOperator,
        address indexed newOperator
    );

    event OwnerUpdated(
        address indexed agent,
        address indexed oldOwner,
        address indexed newOwner
    );

    event MetaURIUpdated(
        address indexed agent,
        string oldMetaURI,
        string newMetaURI
    );

    event VaultUpdated(
        address indexed agent,
        address indexed oldVault,
        address indexed newVault
    );

    event TableUpdated(
        address indexed agent,
        address indexed oldTable,
        address indexed newTable
    );

    event AgentDeregistered(address indexed agent, address indexed owner);

    event StrategyUpdated(
        address indexed agent,
        uint256 version,
        bytes32 configHash,
        string personaId,
        uint16 aggressionBps,
        uint16 tightnessBps,
        uint16 bluffFreqBps
    );

    // ============ Structs ============

    struct StrategyRecord {
        bytes32 configHash;
        string  personaId;
        uint16  aggressionBps;   // 0–10000
        uint16  tightnessBps;    // 0–10000
        uint16  bluffFreqBps;    // 0–10000
        uint256 version;         // monotonically increasing
        uint256 timestamp;
    }

    // ============ State Variables ============

    // agent wallet address => AgentInfo
    mapping(address => AgentInfo) public agents;

    // Array of all registered agent addresses for enumeration
    address[] public registeredAgents;

    // agent wallet address => strategy history (append-only)
    mapping(address => StrategyRecord[]) private _strategyHistory;

    // ============ Modifiers ============

    modifier onlyAgentOwner(address agent) {
        require(agents[agent].isRegistered, "Agent not registered");
        require(msg.sender == agents[agent].owner, "Not agent owner");
        _;
    }

    modifier onlyAuthorized(address agent) {
        require(agents[agent].isRegistered, "Agent not registered");
        require(
            msg.sender == agents[agent].owner || msg.sender == agents[agent].operator,
            "Not authorized"
        );
        _;
    }

    // ============ External Functions ============

    /**
     * @notice Register msg.sender as an agent
     * @param vault The PlayerVault contract address
     * @param table The PokerTable contract address
     * @param operator The wallet that can submit actions (0x0 defaults to msg.sender)
     * @param metaURI Metadata URI for agent profile
     */
    function registerAgent(
        address vault,
        address table,
        address operator,
        string calldata metaURI
    ) external {
        require(!agents[msg.sender].isRegistered, "Agent already registered");
        require(vault != address(0), "Invalid vault address");
        require(table != address(0), "Invalid table address");

        address effectiveOperator = operator == address(0) ? msg.sender : operator;

        agents[msg.sender] = AgentInfo({
            vault: vault,
            table: table,
            owner: msg.sender,
            operator: effectiveOperator,
            metaURI: metaURI,
            isRegistered: true
        });

        registeredAgents.push(msg.sender);

        emit AgentRegistered(
            msg.sender,
            msg.sender,
            vault,
            table,
            effectiveOperator,
            metaURI
        );
    }

    /// @notice Update the operator address for an agent. Zero address resets to the owner.
    /// @param agent       The agent token address.
    /// @param newOperator New operator address, or zero to revert to owner.
    function updateOperator(address agent, address newOperator) external onlyAgentOwner(agent) {
        address oldOperator = agents[agent].operator;
        address effectiveOperator = newOperator == address(0) ? agents[agent].owner : newOperator;
        require(effectiveOperator != oldOperator, "Operator unchanged");
        agents[agent].operator = effectiveOperator;
        emit OperatorUpdated(agent, oldOperator, effectiveOperator);
    }

    /// @notice Transfer ownership of an agent to a new address.
    /// @param agent    The agent token address.
    /// @param newOwner New owner address (must be non-zero and different from current).
    function transferOwnership(address agent, address newOwner) external onlyAgentOwner(agent) {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = agents[agent].owner;
        require(newOwner != oldOwner, "Owner unchanged");
        agents[agent].owner = newOwner;
        emit OwnerUpdated(agent, oldOwner, newOwner);
    }

    /// @notice Update the metadata URI for an agent.
    /// @param agent      The agent token address.
    /// @param newMetaURI New metadata URI string.
    function updateMetaURI(address agent, string calldata newMetaURI) external onlyAgentOwner(agent) {
        string memory oldMetaURI = agents[agent].metaURI;
        agents[agent].metaURI = newMetaURI;
        emit MetaURIUpdated(agent, oldMetaURI, newMetaURI);
    }

    /// @notice Update the vault address for an agent.
    /// @param agent    The agent token address.
    /// @param newVault New vault contract address.
    function updateVault(address agent, address newVault) external onlyAgentOwner(agent) {
        address oldVault = agents[agent].vault;
        require(newVault != oldVault, "Vault unchanged");
        agents[agent].vault = newVault;
        emit VaultUpdated(agent, oldVault, newVault);
    }

    /// @notice Update the poker table address for an agent.
    /// @param agent    The agent token address.
    /// @param newTable New poker table contract address.
    function updateTable(address agent, address newTable) external onlyAgentOwner(agent) {
        address oldTable = agents[agent].table;
        require(newTable != oldTable, "Table unchanged");
        agents[agent].table = newTable;
        emit TableUpdated(agent, oldTable, newTable);
    }

    /**
     * @notice Deregister an agent. Marks isRegistered = false and removes from enumeration array.
     * @dev Array removal uses swap-and-pop; ordering is not preserved.
     */
    function deregisterAgent(address agent) external onlyAgentOwner(agent) {
        agents[agent].isRegistered = false;

        // Swap-and-pop to remove from enumeration array
        uint256 len = registeredAgents.length;
        for (uint256 i = 0; i < len; i++) {
            if (registeredAgents[i] == agent) {
                registeredAgents[i] = registeredAgents[len - 1];
                registeredAgents.pop();
                break;
            }
        }

        emit AgentDeregistered(agent, msg.sender);
    }

    // ============ Strategy Registry ============

    /**
     * @notice Record a new strategy version on-chain.
     * @dev Callable by owner or operator. Version auto-increments.
     * @param agent          The agent token address.
     * @param configHash     keccak256 of serialised strategy config.
     * @param personaId      Human-readable persona identifier.
     * @param aggressionBps  Aggression parameter in basis points (0–10000).
     * @param tightnessBps   Tightness parameter in basis points (0–10000).
     * @param bluffFreqBps   Bluff frequency in basis points (0–10000).
     */
    function updateStrategy(
        address agent,
        bytes32 configHash,
        string calldata personaId,
        uint16 aggressionBps,
        uint16 tightnessBps,
        uint16 bluffFreqBps
    ) external onlyAuthorized(agent) {
        require(aggressionBps <= 10000, "aggressionBps out of range");
        require(tightnessBps  <= 10000, "tightnessBps out of range");
        require(bluffFreqBps  <= 10000, "bluffFreqBps out of range");

        uint256 version = _strategyHistory[agent].length + 1;
        _strategyHistory[agent].push(StrategyRecord({
            configHash:    configHash,
            personaId:     personaId,
            aggressionBps: aggressionBps,
            tightnessBps:  tightnessBps,
            bluffFreqBps:  bluffFreqBps,
            version:       version,
            timestamp:     block.timestamp
        }));

        emit StrategyUpdated(agent, version, configHash, personaId, aggressionBps, tightnessBps, bluffFreqBps);
    }

    /**
     * @notice Return a paginated slice of strategy history.
     * @param agent  The agent token address.
     * @param offset Zero-based start index.
     * @param limit  Max number of records to return (capped at 100).
     * @return records Array of StrategyRecord.
     */
    function getStrategyHistory(
        address agent,
        uint256 offset,
        uint256 limit
    ) external view returns (StrategyRecord[] memory records) {
        StrategyRecord[] storage history = _strategyHistory[agent];
        uint256 total = history.length;
        if (offset >= total || limit == 0) return new StrategyRecord[](0);
        uint256 cap = limit > 100 ? 100 : limit;
        uint256 end = offset + cap > total ? total : offset + cap;
        uint256 count = end - offset;
        records = new StrategyRecord[](count);
        for (uint256 i = 0; i < count; i++) {
            records[i] = history[offset + i];
        }
    }

    /**
     * @notice Return the latest strategy record for an agent.
     * @param agent The agent token address.
     * @return record The most recent StrategyRecord, or a zero-valued record if none.
     * @return exists True if at least one strategy has been recorded.
     */
    function getLatestStrategy(address agent) external view returns (StrategyRecord memory record, bool exists) {
        uint256 len = _strategyHistory[agent].length;
        if (len == 0) return (record, false);
        return (_strategyHistory[agent][len - 1], true);
    }

    /// @notice Return the number of strategy records for an agent.
    function getStrategyCount(address agent) external view returns (uint256) {
        return _strategyHistory[agent].length;
    }

    // ============ View Functions ============

    /// @notice Return the full AgentInfo struct for an agent.
    /// @param agent The agent token address.
    /// @return Full AgentInfo (vault, table, owner, operator, metaURI, isRegistered).
    function getAgent(address agent) external view returns (AgentInfo memory) {
        return agents[agent];
    }

    /// @notice Return the owner address of an agent.
    /// @param agent The agent token address.
    /// @return Owner address.
    function getOwner(address agent) external view returns (address) {
        return agents[agent].owner;
    }

    /// @notice Return the operator address of an agent.
    /// @param agent The agent token address.
    /// @return Operator address.
    function getOperator(address agent) external view returns (address) {
        return agents[agent].operator;
    }

    /// @notice Return the vault address of an agent.
    /// @param agent The agent token address.
    /// @return Vault contract address.
    function getVault(address agent) external view returns (address) {
        return agents[agent].vault;
    }

    /// @notice Return the poker table address for an agent.
    /// @param agent The agent token address.
    /// @return Poker table contract address.
    function getTable(address agent) external view returns (address) {
        return agents[agent].table;
    }

    /// @notice Return the metadata URI for an agent.
    /// @param agent The agent token address.
    /// @return Metadata URI string.
    function getMetaURI(address agent) external view returns (string memory) {
        return agents[agent].metaURI;
    }

    /// @notice Check whether an agent is registered.
    /// @param agent The agent token address.
    /// @return True if registered and not deregistered.
    function isRegistered(address agent) external view returns (bool) {
        return agents[agent].isRegistered;
    }

    /// @notice Check whether `account` is the owner of `agent`.
    /// @param agent   The agent token address.
    /// @param account Address to check.
    /// @return True if `account` is the registered owner.
    function isOwner(address agent, address account) external view returns (bool) {
        return agents[agent].isRegistered && agents[agent].owner == account;
    }

    /// @notice Check whether `account` is the operator of `agent`.
    /// @param agent   The agent token address.
    /// @param account Address to check.
    /// @return True if `account` is the registered operator.
    function isOperator(address agent, address account) external view returns (bool) {
        return agents[agent].isRegistered && agents[agent].operator == account;
    }

    /// @notice Check whether `account` is authorized for `agent` (owner or operator).
    /// @param agent   The agent token address.
    /// @param account Address to check.
    /// @return True if `account` is owner or operator of the registered agent.
    function isAuthorized(address agent, address account) external view returns (bool) {
        if (!agents[agent].isRegistered) return false;
        return agents[agent].owner == account || agents[agent].operator == account;
    }

    /// @notice Return the number of registered agents.
    /// @return Count of registered (not deregistered) entries.
    function getRegisteredCount() external view returns (uint256) {
        return registeredAgents.length;
    }

    /// @notice Return the agent address at a given enumeration index.
    /// @param index Zero-based index into the `registeredAgents` array.
    /// @return Agent token address at that index.
    function getRegisteredAgentAt(uint256 index) external view returns (address) {
        require(index < registeredAgents.length, "Index out of bounds");
        return registeredAgents[index];
    }
}
