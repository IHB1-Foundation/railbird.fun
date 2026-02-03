// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title PlayerRegistry
 * @notice Canonical mapping from agent token to vault/table/owner/operator.
 * @dev Used by services and web apps to resolve agent ownership and authorization.
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
        address indexed token,
        address indexed owner,
        address vault,
        address table,
        address operator,
        string metaURI
    );

    event OperatorUpdated(
        address indexed token,
        address indexed oldOperator,
        address indexed newOperator
    );

    event OwnerUpdated(
        address indexed token,
        address indexed oldOwner,
        address indexed newOwner
    );

    event MetaURIUpdated(
        address indexed token,
        string oldMetaURI,
        string newMetaURI
    );

    event VaultUpdated(
        address indexed token,
        address indexed oldVault,
        address indexed newVault
    );

    event TableUpdated(
        address indexed token,
        address indexed oldTable,
        address indexed newTable
    );

    // ============ State Variables ============

    // agentToken => AgentInfo
    mapping(address => AgentInfo) public agents;

    // Array of all registered agent tokens for enumeration
    address[] public registeredTokens;

    // ============ Modifiers ============

    modifier onlyAgentOwner(address token) {
        require(agents[token].isRegistered, "Agent not registered");
        require(msg.sender == agents[token].owner, "Not agent owner");
        _;
    }

    // ============ External Functions ============

    /**
     * @notice Register a new agent with the registry
     * @param token The agent token address (unique identifier)
     * @param vault The PlayerVault contract address
     * @param table The PokerTable contract address
     * @param owner The wallet that owns this agent
     * @param operator The wallet that can submit actions (0x0 defaults to owner)
     * @param metaURI Metadata URI for agent profile
     */
    function registerAgent(
        address token,
        address vault,
        address table,
        address owner,
        address operator,
        string calldata metaURI
    ) external {
        require(token != address(0), "Invalid token address");
        require(owner != address(0), "Invalid owner address");
        require(!agents[token].isRegistered, "Agent already registered");

        address effectiveOperator = operator == address(0) ? owner : operator;

        agents[token] = AgentInfo({
            vault: vault,
            table: table,
            owner: owner,
            operator: effectiveOperator,
            metaURI: metaURI,
            isRegistered: true
        });

        registeredTokens.push(token);

        emit AgentRegistered(
            token,
            owner,
            vault,
            table,
            effectiveOperator,
            metaURI
        );
    }

    /**
     * @notice Update the operator for an agent
     * @param token The agent token address
     * @param newOperator The new operator address (0x0 defaults to owner)
     */
    function updateOperator(address token, address newOperator) external onlyAgentOwner(token) {
        address oldOperator = agents[token].operator;
        address effectiveOperator = newOperator == address(0) ? agents[token].owner : newOperator;

        require(effectiveOperator != oldOperator, "Operator unchanged");

        agents[token].operator = effectiveOperator;

        emit OperatorUpdated(token, oldOperator, effectiveOperator);
    }

    /**
     * @notice Transfer ownership of an agent
     * @param token The agent token address
     * @param newOwner The new owner address
     */
    function transferOwnership(address token, address newOwner) external onlyAgentOwner(token) {
        require(newOwner != address(0), "Invalid new owner");

        address oldOwner = agents[token].owner;
        require(newOwner != oldOwner, "Owner unchanged");

        agents[token].owner = newOwner;

        emit OwnerUpdated(token, oldOwner, newOwner);
    }

    /**
     * @notice Update the metadata URI for an agent
     * @param token The agent token address
     * @param newMetaURI The new metadata URI
     */
    function updateMetaURI(address token, string calldata newMetaURI) external onlyAgentOwner(token) {
        string memory oldMetaURI = agents[token].metaURI;
        agents[token].metaURI = newMetaURI;

        emit MetaURIUpdated(token, oldMetaURI, newMetaURI);
    }

    /**
     * @notice Update the vault address for an agent
     * @param token The agent token address
     * @param newVault The new vault address
     */
    function updateVault(address token, address newVault) external onlyAgentOwner(token) {
        address oldVault = agents[token].vault;
        require(newVault != oldVault, "Vault unchanged");

        agents[token].vault = newVault;

        emit VaultUpdated(token, oldVault, newVault);
    }

    /**
     * @notice Update the table address for an agent
     * @param token The agent token address
     * @param newTable The new table address
     */
    function updateTable(address token, address newTable) external onlyAgentOwner(token) {
        address oldTable = agents[token].table;
        require(newTable != oldTable, "Table unchanged");

        agents[token].table = newTable;

        emit TableUpdated(token, oldTable, newTable);
    }

    // ============ View Functions ============

    /**
     * @notice Get complete agent info
     * @param token The agent token address
     * @return info The AgentInfo struct
     */
    function getAgent(address token) external view returns (AgentInfo memory info) {
        return agents[token];
    }

    /**
     * @notice Get the owner of an agent
     * @param token The agent token address
     * @return The owner address (0x0 if not registered)
     */
    function getOwner(address token) external view returns (address) {
        return agents[token].owner;
    }

    /**
     * @notice Get the operator of an agent
     * @param token The agent token address
     * @return The operator address (0x0 if not registered)
     */
    function getOperator(address token) external view returns (address) {
        return agents[token].operator;
    }

    /**
     * @notice Get the vault of an agent
     * @param token The agent token address
     * @return The vault address (0x0 if not registered)
     */
    function getVault(address token) external view returns (address) {
        return agents[token].vault;
    }

    /**
     * @notice Get the table of an agent
     * @param token The agent token address
     * @return The table address (0x0 if not registered)
     */
    function getTable(address token) external view returns (address) {
        return agents[token].table;
    }

    /**
     * @notice Get the metadata URI of an agent
     * @param token The agent token address
     * @return The metadata URI (empty string if not registered)
     */
    function getMetaURI(address token) external view returns (string memory) {
        return agents[token].metaURI;
    }

    /**
     * @notice Check if an agent is registered
     * @param token The agent token address
     * @return True if registered, false otherwise
     */
    function isRegistered(address token) external view returns (bool) {
        return agents[token].isRegistered;
    }

    /**
     * @notice Check if an address is the owner of an agent
     * @param token The agent token address
     * @param account The address to check
     * @return True if account is the owner
     */
    function isOwner(address token, address account) external view returns (bool) {
        return agents[token].isRegistered && agents[token].owner == account;
    }

    /**
     * @notice Check if an address is the operator of an agent
     * @param token The agent token address
     * @param account The address to check
     * @return True if account is the operator
     */
    function isOperator(address token, address account) external view returns (bool) {
        return agents[token].isRegistered && agents[token].operator == account;
    }

    /**
     * @notice Check if an address is authorized (owner or operator) for an agent
     * @param token The agent token address
     * @param account The address to check
     * @return True if account is owner or operator
     */
    function isAuthorized(address token, address account) external view returns (bool) {
        if (!agents[token].isRegistered) return false;
        return agents[token].owner == account || agents[token].operator == account;
    }

    /**
     * @notice Get the total number of registered agents
     * @return The count of registered agents
     */
    function getRegisteredCount() external view returns (uint256) {
        return registeredTokens.length;
    }

    /**
     * @notice Get a registered token by index
     * @param index The index in the registeredTokens array
     * @return The token address at that index
     */
    function getRegisteredTokenAt(uint256 index) external view returns (address) {
        require(index < registeredTokens.length, "Index out of bounds");
        return registeredTokens[index];
    }
}
