// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/**
 * @title SafeTransfer
 * @notice Low-level ERC20 transfer helpers that handle non-standard tokens (e.g., tokens
 *         that do not return a bool). Mirrors the behaviour of OpenZeppelin SafeERC20.
 */
library SafeTransfer {
    /**
     * @dev Wraps ERC20 `transfer`. Reverts on failure or if the token returns `false`.
     *      Works with non-standard tokens that return nothing (void transfer).
     */
    function safeTransfer(address token, address to, uint256 amount) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(0xa9059cbb, to, amount)); // transfer(address,uint256)
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeTransfer: transfer failed");
    }

    /**
     * @dev Wraps ERC20 `transferFrom`. Reverts on failure or if the token returns `false`.
     */
    function safeTransferFrom(address token, address from, address to, uint256 amount) internal {
        (bool success, bytes memory data) =
            token.call(abi.encodeWithSelector(0x23b872dd, from, to, amount)); // transferFrom(address,address,uint256)
        require(success && (data.length == 0 || abi.decode(data, (bool))), "SafeTransfer: transferFrom failed");
    }
}
