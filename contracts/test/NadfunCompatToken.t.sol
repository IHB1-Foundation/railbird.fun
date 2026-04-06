// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/NadfunCompatToken.sol";

/**
 * @title NadfunCompatTokenTest
 * @notice ERC-20 compliance and access-control tests for NadfunCompatToken.
 * @dev Covers T-M4-07.
 */
contract NadfunCompatTokenTest is Test {
    NadfunCompatToken public token;

    address public minter = address(0xBEEF);
    address public alice  = address(0xA);
    address public bob    = address(0xB);

    uint256 constant INITIAL_SUPPLY = 1_000_000 ether;

    function setUp() public {
        token = new NadfunCompatToken(
            "Test Token", "TTK", "ipfs://meta",
            INITIAL_SUPPLY, alice, minter
        );
    }

    // ─── Deployment ───────────────────────────────────────────────────────────

    function test_Metadata() public view {
        assertEq(token.name(),     "Test Token");
        assertEq(token.symbol(),   "TTK");
        assertEq(token.tokenURI(), "ipfs://meta");
        assertEq(token.decimals(), 18);
        assertEq(token.minter(),   minter);
    }

    function test_InitialSupplyAllocated() public view {
        assertEq(token.totalSupply(),   INITIAL_SUPPLY);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY);
    }

    function test_Constructor_RevertIfZeroRecipient() public {
        vm.expectRevert("Invalid recipient");
        new NadfunCompatToken("T", "T", "", 1 ether, address(0), minter);
    }

    function test_Constructor_RevertIfZeroMinter() public {
        vm.expectRevert("Invalid minter");
        new NadfunCompatToken("T", "T", "", 1 ether, alice, address(0));
    }

    // ─── ERC-20: transfer ─────────────────────────────────────────────────────

    function test_Transfer_UpdatesBalances() public {
        vm.prank(alice);
        token.transfer(bob, 100 ether);

        assertEq(token.balanceOf(alice), INITIAL_SUPPLY - 100 ether);
        assertEq(token.balanceOf(bob),   100 ether);
    }

    function test_Transfer_EmitsEvent() public {
        vm.expectEmit(true, true, false, true);
        emit NadfunCompatToken.Transfer(alice, bob, 50 ether);

        vm.prank(alice);
        token.transfer(bob, 50 ether);
    }

    function test_Transfer_RevertIfInsufficientBalance() public {
        vm.prank(bob);
        vm.expectRevert("Insufficient balance");
        token.transfer(alice, 1);
    }

    function test_Transfer_RevertIfZeroRecipient() public {
        vm.prank(alice);
        vm.expectRevert("Invalid recipient");
        token.transfer(address(0), 1 ether);
    }

    // ─── ERC-20: approve / transferFrom ──────────────────────────────────────

    function test_Approve_SetsAllowance() public {
        vm.prank(alice);
        token.approve(bob, 200 ether);

        assertEq(token.allowance(alice, bob), 200 ether);
    }

    function test_TransferFrom_DeductsAllowance() public {
        vm.prank(alice);
        token.approve(bob, 200 ether);

        vm.prank(bob);
        token.transferFrom(alice, bob, 100 ether);

        assertEq(token.allowance(alice, bob), 100 ether);
        assertEq(token.balanceOf(bob),        100 ether);
    }

    function test_TransferFrom_MaxAllowanceNotDeducted() public {
        vm.prank(alice);
        token.approve(bob, type(uint256).max);

        vm.prank(bob);
        token.transferFrom(alice, bob, 100 ether);

        // Infinite allowance should remain at max
        assertEq(token.allowance(alice, bob), type(uint256).max);
    }

    function test_TransferFrom_RevertIfAllowanceInsufficient() public {
        vm.prank(alice);
        token.approve(bob, 50 ether);

        vm.prank(bob);
        vm.expectRevert("Insufficient allowance");
        token.transferFrom(alice, bob, 100 ether);
    }

    // ─── Mint (minter-only) ───────────────────────────────────────────────────

    function test_Mint_OnlyMinterCanMint() public {
        vm.prank(minter);
        token.mint(alice, 500 ether);

        assertEq(token.totalSupply(),   INITIAL_SUPPLY + 500 ether);
        assertEq(token.balanceOf(alice), INITIAL_SUPPLY + 500 ether);
    }

    function test_Mint_RevertIfNotMinter() public {
        vm.expectRevert("Not minter");
        vm.prank(alice);
        token.mint(alice, 1 ether);
    }

    function test_Mint_RevertIfZeroRecipient() public {
        vm.prank(minter);
        vm.expectRevert("Invalid recipient");
        token.mint(address(0), 1 ether);
    }

    // ─── Fuzz: transfer invariant (total supply conserved) ───────────────────

    function testFuzz_Transfer_TotalSupplyConserved(uint256 amount) public {
        amount = bound(amount, 0, INITIAL_SUPPLY);

        uint256 supplyBefore = token.totalSupply();

        vm.prank(alice);
        token.transfer(bob, amount);

        assertEq(token.totalSupply(), supplyBefore, "Total supply must not change on transfer");
    }
}
