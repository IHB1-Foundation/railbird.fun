// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerVault.sol";

contract PlayerVaultTest is Test {
    PlayerVault public vault;
    address public vaultOwner = address(0xBEEF);
    address public tbl = address(0xCAFE);
    address public randomUser = address(0xDEAD);

    function setUp() public {
        vault = new PlayerVault(vaultOwner);
    }

    function test_Constructor_SetsOwner() public view {
        assertEq(vault.owner(), vaultOwner);
    }

    function test_Constructor_RevertIfOwnerZero() public {
        vm.expectRevert("Invalid owner");
        new PlayerVault(address(0));
    }

    function test_Initialize() public {
        vm.deal(address(vault), 1 ether);
        vault.initialize();
        assertTrue(vault.initialized());
    }

    function test_Initialize_RevertIfCalledTwice() public {
        vault.initialize();
        vm.expectRevert("Already initialized");
        vault.initialize();
    }

    function test_Deposit() public {
        vault.deposit{value: 1 ether}();
        assertEq(vault.getExternalAssets(), 1 ether);
    }

    function test_Deposit_RevertIfZero() public {
        vm.expectRevert("Zero deposit");
        vault.deposit{value: 0}();
    }

    function test_ReceiveNative() public {
        (bool ok, ) = address(vault).call{value: 0.5 ether}("");
        assertTrue(ok);
        assertEq(vault.getExternalAssets(), 0.5 ether);
    }

    function test_Withdraw() public {
        vault.deposit{value: 2 ether}();
        uint256 before = randomUser.balance;
        vm.prank(vaultOwner);
        vault.withdraw(1 ether, randomUser);
        assertEq(randomUser.balance - before, 1 ether);
        assertEq(vault.getExternalAssets(), 1 ether);
    }

    function test_Withdraw_RevertIfNotOwner() public {
        vault.deposit{value: 1 ether}();
        vm.prank(randomUser);
        vm.expectRevert("Not owner");
        vault.withdraw(1 ether, randomUser);
    }

    function test_FundBuyIn() public {
        vault.deposit{value: 5 ether}();
        vm.prank(vaultOwner);
        vault.fundBuyIn(tbl, 2 ether);
        assertEq(vault.totalEscrow(), 2 ether);
        assertEq(vault.getAvailableBalance(), 3 ether);
    }

    function test_ReleaseEscrow() public {
        vault.deposit{value: 5 ether}();
        vm.prank(vaultOwner);
        vault.fundBuyIn(tbl, 3 ether);
        vm.prank(vaultOwner);
        vault.releaseEscrow(tbl, 2 ether);
        assertEq(vault.totalEscrow(), 1 ether);
    }

    function test_AuthorizeTable() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        assertTrue(vault.authorizedTables(tbl));
    }

    function test_OnSettlement() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        vm.prank(tbl);
        vault.onSettlement(1, int256(100));
        assertEq(vault.handCount(), 1);
        assertEq(vault.getCumulativePnl(), int256(100));
    }

    function test_OnSettlement_NegativePnl() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        vm.prank(tbl);
        vault.onSettlement(1, -int256(50));
        assertEq(vault.getCumulativePnl(), -int256(50));
    }

    function test_OnSettlement_RevertIfNotAuthorized() public {
        vm.prank(randomUser);
        vm.expectRevert("Not authorized table");
        vault.onSettlement(1, int256(100));
    }

    function test_TransferOwnership() public {
        vm.prank(vaultOwner);
        vault.transferOwnership(randomUser);
        assertEq(vault.owner(), randomUser);
    }

    function test_ReceiveSettlement() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        vm.deal(tbl, 2 ether);
        vm.prank(tbl);
        vault.receiveSettlement{value: 1 ether}(1);
        assertEq(vault.getExternalAssets(), 1 ether);
    }
}
