// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./interfaces/IPlayerVault.sol";

/**
 * @title PlayerVault
 * @notice Simple vault that holds native KAIA for a poker agent.
 * @dev Holds native token, provides buy-in funding, receives settlements, emits snapshots.
 */
contract PlayerVault is IPlayerVault {
    // ============ State Variables ============

    address public owner;
    mapping(address => bool) public authorizedTables;
    mapping(address => uint256) public tableEscrow;
    uint256 public totalEscrow;
    uint256 public lastSnapshotHandId;
    int256 public cumulativePnl;
    uint256 public handCount;
    bool public initialized;

    // ============ Modifiers ============

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    modifier onlyAuthorizedTable() {
        require(authorizedTables[msg.sender], "Not authorized table");
        _;
    }

    // ============ Constructor ============

    constructor(address _owner) {
        require(_owner != address(0), "Invalid owner");
        owner = _owner;
    }

    function initialize() external {
        require(!initialized, "Already initialized");
        initialized = true;
        emit VaultInitialized(owner, getExternalAssets());
    }

    // ============ Receive ============

    receive() external payable {
        emit Deposited(msg.sender, msg.value);
    }

    // ============ External Functions ============

    function deposit() external payable override {
        require(msg.value > 0, "Zero deposit");
        emit Deposited(msg.sender, msg.value);
    }

    function withdraw(uint256 amount, address recipient) external override onlyOwner {
        require(recipient != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");
        (bool success, ) = recipient.call{value: amount}("");
        require(success, "Transfer failed");
        emit Withdrawn(recipient, amount);
    }

    function fundBuyIn(address table, uint256 amount) external override onlyOwner {
        require(table != address(0), "Invalid table");
        require(amount > 0, "Zero amount");
        uint256 available = address(this).balance - totalEscrow;
        require(amount <= available, "Insufficient available balance");
        tableEscrow[table] += amount;
        totalEscrow += amount;
        emit BuyInFunded(table, amount);
    }

    function releaseEscrow(address table, uint256 amount) external onlyOwner {
        require(amount <= tableEscrow[table], "Exceeds escrow");
        tableEscrow[table] -= amount;
        totalEscrow -= amount;
    }

    function onSettlement(uint256 handId, int256 pnl) external override onlyAuthorizedTable {
        cumulativePnl += pnl;
        handCount++;
        lastSnapshotHandId = handId;
        emit SettlementReceived(msg.sender, handId, pnl >= 0 ? uint256(pnl) : 0);
        emit VaultSnapshot(handId, getExternalAssets(), cumulativePnl);
    }

    function receiveSettlement(uint256 handId) external payable {
        require(msg.value > 0, "Zero settlement");
        if (authorizedTables[msg.sender]) {
            emit SettlementReceived(msg.sender, handId, msg.value);
            emit VaultSnapshot(handId, getExternalAssets(), cumulativePnl);
        } else {
            emit Deposited(msg.sender, msg.value);
        }
    }

    // ============ Admin Functions ============

    function authorizeTable(address table) external onlyOwner {
        require(table != address(0), "Invalid table");
        authorizedTables[table] = true;
    }

    function revokeTable(address table) external onlyOwner {
        authorizedTables[table] = false;
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid new owner");
        owner = newOwner;
    }

    // ============ View Functions ============

    function getExternalAssets() public view override returns (uint256) {
        return address(this).balance;
    }

    function getAvailableBalance() public view returns (uint256) {
        uint256 total = address(this).balance;
        return total > totalEscrow ? total - totalEscrow : 0;
    }

    function getCumulativePnl() external view override returns (int256) {
        return cumulativePnl;
    }

    function getHandCount() external view override returns (uint256) {
        return handCount;
    }

    function emitSnapshot() external onlyOwner {
        emit VaultSnapshot(0, getExternalAssets(), cumulativePnl);
    }
}
