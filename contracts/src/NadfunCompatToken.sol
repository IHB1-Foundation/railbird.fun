// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title NadfunCompatToken
 * @notice Minimal ERC20 token deployed by NadfunCompatRouter.
 * @dev Name/symbol/tokenURI are immutable per token.
 */
contract NadfunCompatToken {
    string public name;
    string public symbol;
    string public tokenURI;
    uint8 public constant decimals = 18;

    uint256 public totalSupply;
    address public immutable minter;

    mapping(address => uint256) public balanceOf;
    mapping(address => mapping(address => uint256)) public allowance;

    event Transfer(address indexed from, address indexed to, uint256 amount);
    event Approval(address indexed owner, address indexed spender, uint256 amount);

    modifier onlyMinter() {
        require(msg.sender == minter, "Not minter");
        _;
    }

    constructor(
        string memory _name,
        string memory _symbol,
        string memory _tokenURI,
        uint256 _initialSupply,
        address _initialRecipient,
        address _minter
    ) {
        require(_initialRecipient != address(0), "Invalid recipient");
        require(_minter != address(0), "Invalid minter");
        name = _name;
        symbol = _symbol;
        tokenURI = _tokenURI;
        minter = _minter;
        _mint(_initialRecipient, _initialSupply);
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

    function mint(address to, uint256 amount) external onlyMinter {
        require(to != address(0), "Invalid recipient");
        _mint(to, amount);
    }

    function _mint(address to, uint256 amount) internal {
        require(amount > 0, "Zero amount");
        totalSupply += amount;
        balanceOf[to] += amount;
        emit Transfer(address(0), to, amount);
    }

    function _transfer(address from, address to, uint256 amount) internal {
        require(to != address(0), "Invalid recipient");
        require(balanceOf[from] >= amount, "Insufficient balance");
        balanceOf[from] -= amount;
        balanceOf[to] += amount;
        emit Transfer(from, to, amount);
    }
}

