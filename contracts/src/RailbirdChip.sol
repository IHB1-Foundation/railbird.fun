// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title RailbirdChip (rCHIP)
 * @notice Simple ERC20 chip token for Railbird poker tables.
 */
contract RailbirdChip {
    string public constant name = "Railbird Chip";
    string public constant symbol = "rCHIP";
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public owner;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _owner) {
        address initialOwner = _owner == address(0) ? msg.sender : _owner;
        owner = initialOwner;
        emit OwnerUpdated(address(0), initialOwner);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerUpdated(oldOwner, newOwner);
    }

    function approve(address spender, uint256 amount) external returns (bool) {
        allowance[msg.sender][spender] = amount;
        emit Approval(msg.sender, spender, amount);
        return true;
    }

    function transfer(address to, uint256 amount) external returns (bool) {
        _transfer(msg.sender, to, amount);
        return true;
    }

    function transferFrom(address from, address to, uint256 amount) external returns (bool) {
        uint256 allowed = allowance[from][msg.sender];
        require(allowed >= amount, "Insufficient allowance");
        if (allowed != type(uint256).max) {
            allowance[from][msg.sender] = allowed - amount;
            emit Approval(from, msg.sender, allowance[from][msg.sender]);
        }
        _transfer(from, to, amount);
        return true;
    }

    function mint(address to, uint256 amount) external onlyOwner {
        require(to != address(0), "Invalid recipient");
        require(amount > 0, "Zero amount");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function mintBatch(address[] calldata recipients, uint256 amountEach) external onlyOwner {
        require(amountEach > 0, "Zero amount");
        uint256 count = recipients.length;
        require(count > 0, "No recipients");

        uint256 mintTotal = amountEach * count;
        totalSupply += mintTotal;

        for (uint256 i = 0; i < count; i++) {
            address to = recipients[i];
            require(to != address(0), "Invalid recipient");
            balanceOf[to] += amountEach;
            emit Transfer(address(0), to, amountEach);
        }
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}
