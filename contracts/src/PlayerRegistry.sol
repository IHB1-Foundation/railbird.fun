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

    // ============ State Variables ============

    // agent wallet address => AgentInfo
    mapping(address => AgentInfo) public agents;

    // Array of all registered agent addresses for enumeration
    address[] public registeredAgents;

    // ============ Modifiers ============

    modifier onlyAgentOwner(address agent) {
        require(agents[agent].isRegistered, "Agent not registered");
        require(msg.sender == agents[agent].owner, "Not agent owner");
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

    function updateOperator(address agent, address newOperator) external onlyAgentOwner(agent) {
        address oldOperator = agents[agent].operator;
        address effectiveOperator = newOperator == address(0) ? agents[agent].owner : newOperator;
        require(effectiveOperator != oldOperator, "Operator unchanged");
        agents[agent].operator = effectiveOperator;
        emit OperatorUpdated(agent, oldOperator, effectiveOperator);
    }

    function transferOwnership(address agent, address newOwner) external onlyAgentOwner(agent) {
        require(newOwner != address(0), "Invalid new owner");
        address oldOwner = agents[agent].owner;
        require(newOwner != oldOwner, "Owner unchanged");
        agents[agent].owner = newOwner;
        emit OwnerUpdated(agent, oldOwner, newOwner);
    }

    function updateMetaURI(address agent, string calldata newMetaURI) external onlyAgentOwner(agent) {
        string memory oldMetaURI = agents[agent].metaURI;
        agents[agent].metaURI = newMetaURI;
        emit MetaURIUpdated(agent, oldMetaURI, newMetaURI);
    }

    function updateVault(address agent, address newVault) external onlyAgentOwner(agent) {
        address oldVault = agents[agent].vault;
        require(newVault != oldVault, "Vault unchanged");
        agents[agent].vault = newVault;
        emit VaultUpdated(agent, oldVault, newVault);
    }

    function updateTable(address agent, address newTable) external onlyAgentOwner(agent) {
        address oldTable = agents[agent].table;
        require(newTable != oldTable, "Table unchanged");
        agents[agent].table = newTable;
        emit TableUpdated(agent, oldTable, newTable);
    }

    // ============ View Functions ============

    function getAgent(address agent) external view returns (AgentInfo memory) {
        return agents[agent];
    }

    function getOwner(address agent) external view returns (address) {
        return agents[agent].owner;
    }

    function getOperator(address agent) external view returns (address) {
        return agents[agent].operator;
    }

    function getVault(address agent) external view returns (address) {
        return agents[agent].vault;
    }

    function getTable(address agent) external view returns (address) {
        return agents[agent].table;
    }

    function getMetaURI(address agent) external view returns (string memory) {
        return agents[agent].metaURI;
    }

    function isRegistered(address agent) external view returns (bool) {
        return agents[agent].isRegistered;
    }

    function isOwner(address agent, address account) external view returns (bool) {
        return agents[agent].isRegistered && agents[agent].owner == account;
    }

    function isOperator(address agent, address account) external view returns (bool) {
        return agents[agent].isRegistered && agents[agent].operator == account;
    }

    function isAuthorized(address agent, address account) external view returns (bool) {
        if (!agents[agent].isRegistered) return false;
        return agents[agent].owner == account || agents[agent].operator == account;
    }

    function getRegisteredCount() external view returns (uint256) {
        return registeredAgents.length;
    }

    function getRegisteredAgentAt(uint256 index) external view returns (address) {
        require(index < registeredAgents.length, "Index out of bounds");
        return registeredAgents[index];
    }
}
