// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "./NadfunCompatToken.sol";
import "./interfaces/INadfunRouter.sol";
import "./interfaces/IERC20.sol";

/**
 * @title NadfunCompatRouter
 * @notice nad.fun-compatible testnet router with zero deploy fee by default.
 * @dev Provides create/buy/sell and quote functions with familiar signatures.
 */
contract NadfunCompatRouter is INadfunRouter {
    struct CurveConfig {
        uint256 virtualMonReserve;
        uint256 virtualTokenReserve;
        uint256 targetTokenAmount;
    }

    struct FeeConfig {
        uint256 deployFeeAmount;
        uint256 graduateFeeAmount;
        uint24 protocolFee; // bps, denominator 10000
    }

    struct CurveState {
        uint256 realMonReserve;
        uint256 realTokenReserve;
        uint256 totalSupply;
        uint256 createdAt;
        bool isLocked;
        bool isGraduated;
        address creator;
    }

    struct TokenCreationParams {
        string name;
        string symbol;
        string tokenURI;
        uint256 amountOut;
        bytes32 salt;
        uint8 actionId;
    }

    struct BuyParams {
        uint256 amountOutMin;
        address token;
        address to;
        uint256 deadline;
    }

    struct SellParams {
        uint256 amountIn;
        uint256 amountOutMin;
        address token;
        address to;
        uint256 deadline;
    }

    error UnknownToken();
    error DeadlineExpired();
    error InsufficientAmountOut();
    error InsufficientAmountInMax();
    error InsufficientMon();
    error CurveLocked();
    error CurveGraduated();

    uint256 public constant BPS_DENOMINATOR = 10000;
    uint256 public constant DEFAULT_TOTAL_SUPPLY = 1_000_000_000e18;
    uint256 public constant DEFAULT_DEADLINE_OFFSET = 300;

    address public owner;
    address public feeRecipient;
    address public immutable wMon;

    CurveConfig public config;
    FeeConfig public feeConfig;

    mapping(address => CurveState) public curves;

    event CurveCreate(
        address indexed creator,
        address indexed token,
        address indexed pool,
        string name,
        string symbol,
        string tokenURI,
        uint256 virtualMon,
        uint256 virtualToken,
        uint256 targetTokenAmount
    );
    event CurveBuy(address indexed to, address indexed token, uint256 actualAmountIn, uint256 effectiveAmountOut);
    event CurveSell(address indexed to, address indexed token, uint256 actualAmountIn, uint256 effectiveAmountOut);
    event CurveSync(
        address indexed token,
        uint256 realMonReserve,
        uint256 realTokenReserve,
        uint256 virtualMonReserve,
        uint256 virtualTokenReserve
    );
    event CurveTokenLocked(address indexed token);
    event CurveGraduate(address indexed token, address indexed pool);
    event OwnerUpdated(address indexed oldOwner, address indexed newOwner);
    event FeeRecipientUpdated(address indexed oldRecipient, address indexed newRecipient);
    event CurveConfigUpdated(uint256 virtualMonReserve, uint256 virtualTokenReserve, uint256 targetTokenAmount);
    event FeeConfigUpdated(uint256 deployFeeAmount, uint256 graduateFeeAmount, uint24 protocolFee);

    modifier onlyOwner() {
        require(msg.sender == owner, "Not owner");
        _;
    }

    constructor(address _wMon, address _feeRecipient) {
        owner = msg.sender;
        feeRecipient = _feeRecipient == address(0) ? msg.sender : _feeRecipient;
        wMon = _wMon;

        // Keep defaults close to nad.fun public values.
        config = CurveConfig({
            virtualMonReserve: 180_000e18,
            virtualTokenReserve: 1_073_000_191e18,
            targetTokenAmount: 279_900_191e18
        });

        // Testnet-friendly default: zero deploy fee.
        feeConfig = FeeConfig({
            deployFeeAmount: 0,
            graduateFeeAmount: 0,
            protocolFee: 0
        });
    }

    function curve() external view returns (address) {
        return address(this);
    }

    function transferOwnership(address newOwner) external onlyOwner {
        require(newOwner != address(0), "Invalid owner");
        address oldOwner = owner;
        owner = newOwner;
        emit OwnerUpdated(oldOwner, newOwner);
    }

    function setFeeRecipient(address newRecipient) external onlyOwner {
        require(newRecipient != address(0), "Invalid recipient");
        address oldRecipient = feeRecipient;
        feeRecipient = newRecipient;
        emit FeeRecipientUpdated(oldRecipient, newRecipient);
    }

    function setConfig(
        uint256 virtualMonReserve,
        uint256 virtualTokenReserve,
        uint256 targetTokenAmount
    ) external onlyOwner {
        require(virtualMonReserve > 0, "Invalid virtualMonReserve");
        require(virtualTokenReserve > 0, "Invalid virtualTokenReserve");
        require(targetTokenAmount > 0, "Invalid targetTokenAmount");
        config = CurveConfig({
            virtualMonReserve: virtualMonReserve,
            virtualTokenReserve: virtualTokenReserve,
            targetTokenAmount: targetTokenAmount
        });
        emit CurveConfigUpdated(virtualMonReserve, virtualTokenReserve, targetTokenAmount);
    }

    function setFeeConfig(
        uint256 deployFeeAmount,
        uint256 graduateFeeAmount,
        uint24 protocolFee
    ) external onlyOwner {
        require(protocolFee <= BPS_DENOMINATOR, "Invalid protocolFee");
        feeConfig = FeeConfig({
            deployFeeAmount: deployFeeAmount,
            graduateFeeAmount: graduateFeeAmount,
            protocolFee: protocolFee
        });
        emit FeeConfigUpdated(deployFeeAmount, graduateFeeAmount, protocolFee);
    }

    function create(TokenCreationParams calldata params) external payable returns (address token, address pool) {
        uint256 requiredValue = feeConfig.deployFeeAmount;
        if (msg.value < requiredValue) revert InsufficientMon();

        token = address(new NadfunCompatToken{salt: params.salt}(
            params.name,
            params.symbol,
            params.tokenURI,
            DEFAULT_TOTAL_SUPPLY,
            address(this),
            address(this)
        ));

        CurveState storage state = curves[token];
        require(state.createdAt == 0, "Token exists");

        state.realMonReserve = 0;
        state.realTokenReserve = DEFAULT_TOTAL_SUPPLY;
        state.totalSupply = DEFAULT_TOTAL_SUPPLY;
        state.createdAt = block.timestamp;
        state.isLocked = false;
        state.isGraduated = false;
        state.creator = msg.sender;

        pool = address(this);
        emit CurveCreate(
            msg.sender,
            token,
            pool,
            params.name,
            params.symbol,
            params.tokenURI,
            config.virtualMonReserve,
            config.virtualTokenReserve,
            config.targetTokenAmount
        );

        // Forward deploy fee if configured.
        if (feeConfig.deployFeeAmount > 0) {
            (bool sent,) = feeRecipient.call{value: feeConfig.deployFeeAmount}("");
            require(sent, "Deploy fee transfer failed");
        }

        // Optional initial buy from create value minus deploy fee.
        uint256 initialBuyValue = msg.value - feeConfig.deployFeeAmount;
        if (initialBuyValue > 0 || params.amountOut > 0) {
            uint256 tokenOut = _buy(token, params.amountOut, block.timestamp + DEFAULT_DEADLINE_OFFSET, msg.sender, initialBuyValue);
            if (tokenOut < params.amountOut) revert InsufficientAmountOut();
        }
    }

    function buy(
        address token,
        uint256 minTokenOut,
        uint256 deadline,
        address recipient
    ) external payable override returns (uint256 tokenAmountOut) {
        tokenAmountOut = _buy(token, minTokenOut, deadline, recipient, msg.value);
    }

    function buy(BuyParams calldata params) external payable returns (uint256 tokenAmountOut) {
        tokenAmountOut = _buy(params.token, params.amountOutMin, params.deadline, params.to, msg.value);
    }

    function sell(
        address token,
        uint256 tokenAmountIn,
        uint256 minMonOut,
        uint256 deadline,
        address recipient
    ) external override returns (uint256 monAmountOut) {
        monAmountOut = _sell(token, tokenAmountIn, minMonOut, deadline, recipient);
    }

    function sell(SellParams calldata params) external returns (uint256 monAmountOut) {
        monAmountOut = _sell(params.token, params.amountIn, params.amountOutMin, params.deadline, params.to);
    }

    function _buy(
        address token,
        uint256 minTokenOut,
        uint256 deadline,
        address recipient,
        uint256 monAmountIn
    ) internal returns (uint256 tokenAmountOut) {
        if (deadline < block.timestamp) revert DeadlineExpired();
        if (recipient == address(0)) recipient = msg.sender;
        if (monAmountIn == 0) revert InsufficientMon();

        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        if (state.isGraduated) revert CurveGraduated();
        if (state.isLocked) revert CurveLocked();

        uint256 feeAmount = calculateFeeAmount(monAmountIn);
        uint256 effectiveIn = monAmountIn - feeAmount;
        tokenAmountOut = _getAmountOutNoFee(state, effectiveIn, true);
        if (tokenAmountOut < minTokenOut) revert InsufficientAmountOut();
        require(tokenAmountOut <= state.realTokenReserve, "Insufficient token reserve");

        state.realMonReserve += effectiveIn;
        state.realTokenReserve -= tokenAmountOut;

        if (feeAmount > 0) {
            (bool feeSent,) = feeRecipient.call{value: feeAmount}("");
            require(feeSent, "Fee transfer failed");
        }

        require(IERC20(token).transfer(recipient, tokenAmountOut), "Token transfer failed");

        emit CurveBuy(recipient, token, monAmountIn, tokenAmountOut);
        emit CurveSync(
            token,
            state.realMonReserve,
            state.realTokenReserve,
            config.virtualMonReserve,
            config.virtualTokenReserve
        );

        uint256 sold = state.totalSupply - state.realTokenReserve;
        if (!state.isLocked && sold >= config.targetTokenAmount) {
            state.isLocked = true;
            emit CurveTokenLocked(token);
        }
    }

    function _sell(
        address token,
        uint256 tokenAmountIn,
        uint256 minMonOut,
        uint256 deadline,
        address recipient
    ) internal returns (uint256 monAmountOut) {
        if (deadline < block.timestamp) revert DeadlineExpired();
        if (recipient == address(0)) recipient = msg.sender;
        require(tokenAmountIn > 0, "Zero amount");

        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        if (state.isGraduated) revert CurveGraduated();
        if (state.isLocked) revert CurveLocked();

        uint256 feeToken = calculateFeeAmount(tokenAmountIn);
        uint256 effectiveIn = tokenAmountIn - feeToken;
        monAmountOut = _getAmountOutNoFee(state, effectiveIn, false);
        if (monAmountOut < minMonOut) revert InsufficientAmountOut();
        require(monAmountOut <= state.realMonReserve, "Insufficient MON reserve");

        if (feeToken > 0) {
            require(IERC20(token).transferFrom(msg.sender, feeRecipient, feeToken), "Fee token transfer failed");
        }
        require(IERC20(token).transferFrom(msg.sender, address(this), effectiveIn), "Token transfer failed");

        state.realTokenReserve += effectiveIn;
        state.realMonReserve -= monAmountOut;

        (bool sent,) = recipient.call{value: monAmountOut}("");
        require(sent, "MON transfer failed");

        emit CurveSell(recipient, token, tokenAmountIn, monAmountOut);
        emit CurveSync(
            token,
            state.realMonReserve,
            state.realTokenReserve,
            config.virtualMonReserve,
            config.virtualTokenReserve
        );
    }

    function _getAmountOutNoFee(
        CurveState storage state,
        uint256 amountIn,
        bool isBuy
    ) internal view returns (uint256 amountOut) {
        if (amountIn == 0) return 0;

        uint256 x = config.virtualMonReserve + state.realMonReserve;
        uint256 y = config.virtualTokenReserve + state.realTokenReserve;
        uint256 k = x * y;

        if (isBuy) {
            uint256 newX = x + amountIn;
            uint256 newY = k / newX;
            amountOut = y - newY;
        } else {
            uint256 newY = y + amountIn;
            uint256 newX = k / newY;
            amountOut = x - newX;
        }
    }

    function getAmountOutWithFee(
        address token,
        uint256 amountIn,
        bool isBuy
    ) public view returns (uint256 amountOut) {
        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        uint256 feeAmount = calculateFeeAmount(amountIn);
        uint256 effectiveIn = amountIn - feeAmount;
        amountOut = _getAmountOutNoFee(state, effectiveIn, isBuy);
    }

    function getAmountInWithFee(
        address token,
        uint256 amountOut,
        bool isBuy
    ) public view returns (uint256 amountIn) {
        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        if (amountOut == 0) return 0;

        uint256 x = config.virtualMonReserve + state.realMonReserve;
        uint256 y = config.virtualTokenReserve + state.realTokenReserve;
        uint256 k = x * y;
        uint256 effectiveIn;

        if (isBuy) {
            require(amountOut < y, "Amount out too high");
            uint256 newY = y - amountOut;
            // ceilDiv(k, newY) - x to avoid underestimation due division truncation
            uint256 newX = (k + newY - 1) / newY;
            effectiveIn = newX > x ? newX - x : 0;
        } else {
            require(amountOut < x, "Amount out too high");
            uint256 newX = x - amountOut;
            uint256 newY = (k + newX - 1) / newX;
            effectiveIn = newY > y ? newY - y : 0;
        }

        uint256 feeBps = feeConfig.protocolFee;
        if (feeBps == 0) return effectiveIn;

        uint256 denom = BPS_DENOMINATOR - feeBps;
        amountIn = (effectiveIn * BPS_DENOMINATOR + denom - 1) / denom;
    }

    function availableBuyTokens(address token) external view returns (uint256 availableBuyToken, uint256 requiredMonAmount) {
        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        availableBuyToken = state.realTokenReserve;
        if (availableBuyToken == 0) return (0, 0);
        requiredMonAmount = getAmountInWithFee(token, availableBuyToken, true);
    }

    function calculateFeeAmount(uint256 amount) public view returns (uint256 feeAmount) {
        uint24 feeBps = feeConfig.protocolFee;
        if (feeBps == 0) return 0;
        feeAmount = (amount * feeBps) / BPS_DENOMINATOR;
    }

    function isLocked(address token) external view returns (bool) {
        return curves[token].isLocked;
    }

    function isGraduated(address token) external view returns (bool) {
        return curves[token].isGraduated;
    }

    function getProgress(address token) external view returns (uint256 progress) {
        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        uint256 sold = state.totalSupply - state.realTokenReserve;
        progress = (sold * BPS_DENOMINATOR) / config.targetTokenAmount;
        if (progress > BPS_DENOMINATOR) progress = BPS_DENOMINATOR;
    }

    function getInitialBuyAmountOut(uint256 amountIn) external view returns (uint256 amountOut) {
        CurveState memory state = CurveState({
            realMonReserve: 0,
            realTokenReserve: DEFAULT_TOTAL_SUPPLY,
            totalSupply: DEFAULT_TOTAL_SUPPLY,
            createdAt: block.timestamp,
            isLocked: false,
            isGraduated: false,
            creator: address(0)
        });
        uint256 feeAmount = calculateFeeAmount(amountIn);
        uint256 effectiveIn = amountIn - feeAmount;

        uint256 x = config.virtualMonReserve + state.realMonReserve;
        uint256 y = config.virtualTokenReserve + state.realTokenReserve;
        uint256 k = x * y;
        uint256 newX = x + effectiveIn;
        uint256 newY = k / newX;
        amountOut = y - newY;
    }

    // Owner-only manual graduation switch for demos.
    function graduate(address token) external onlyOwner {
        CurveState storage state = curves[token];
        if (state.createdAt == 0) revert UnknownToken();
        state.isGraduated = true;
        state.isLocked = false;
        emit CurveGraduate(token, address(this));
    }

    receive() external payable {}
}

