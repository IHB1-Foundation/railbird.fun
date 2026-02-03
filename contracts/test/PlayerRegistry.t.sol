// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerRegistry.sol";

contract PlayerRegistryTest is Test {
    PlayerRegistry public registry;

    address public agentToken1 = address(0x1001);
    address public agentToken2 = address(0x1002);
    address public vaultAddr1 = address(0x2001);
    address public vaultAddr2 = address(0x2002);
    address public pokerTable1 = address(0x3001);
    address public pokerTable2 = address(0x3002);
    address public ownerAddr1 = address(0x4001);
    address public ownerAddr2 = address(0x4002);
    address public operatorAddr1 = address(0x5001);
    address public operatorAddr2 = address(0x5002);
    string public metaURI1 = "ipfs://agent1-metadata";
    string public metaURI2 = "ipfs://agent2-metadata";

    function setUp() public {
        registry = new PlayerRegistry();
    }

    // ============ Registration Tests ============

    function test_RegisterAgent_Success() public {
        vm.expectEmit(true, true, false, true);
        emit PlayerRegistry.AgentRegistered(
            agentToken1,
            ownerAddr1,
            vaultAddr1,
            pokerTable1,
            operatorAddr1,
            metaURI1
        );

        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        assertTrue(registry.isRegistered(agentToken1));
        assertEq(registry.getOwner(agentToken1), ownerAddr1);
        assertEq(registry.getOperator(agentToken1), operatorAddr1);
        assertEq(registry.getVault(agentToken1), vaultAddr1);
        assertEq(registry.getTable(agentToken1), pokerTable1);
        assertEq(registry.getMetaURI(agentToken1), metaURI1);
    }

    function test_RegisterAgent_OperatorDefaultsToOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, address(0), metaURI1);

        assertEq(registry.getOperator(agentToken1), ownerAddr1);
    }

    function test_RegisterAgent_RevertOnZeroToken() public {
        vm.expectRevert("Invalid token address");
        registry.registerAgent(address(0), vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);
    }

    function test_RegisterAgent_RevertOnZeroOwner() public {
        vm.expectRevert("Invalid owner address");
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, address(0), operatorAddr1, metaURI1);
    }

    function test_RegisterAgent_RevertOnDuplicateRegistration() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectRevert("Agent already registered");
        registry.registerAgent(agentToken1, vaultAddr2, pokerTable2, ownerAddr2, operatorAddr2, metaURI2);
    }

    function test_RegisterAgent_AllowsZeroVaultAndTable() public {
        registry.registerAgent(agentToken1, address(0), address(0), ownerAddr1, operatorAddr1, metaURI1);

        assertTrue(registry.isRegistered(agentToken1));
        assertEq(registry.getVault(agentToken1), address(0));
        assertEq(registry.getTable(agentToken1), address(0));
    }

    function test_RegisterAgent_AllowsEmptyMetaURI() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, "");

        assertTrue(registry.isRegistered(agentToken1));
        assertEq(registry.getMetaURI(agentToken1), "");
    }

    // ============ Update Operator Tests ============

    function test_UpdateOperator_Success() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectEmit(true, true, true, false);
        emit PlayerRegistry.OperatorUpdated(agentToken1, operatorAddr1, operatorAddr2);

        vm.prank(ownerAddr1);
        registry.updateOperator(agentToken1, operatorAddr2);

        assertEq(registry.getOperator(agentToken1), operatorAddr2);
    }

    function test_UpdateOperator_ZeroDefaultsToOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        registry.updateOperator(agentToken1, address(0));

        assertEq(registry.getOperator(agentToken1), ownerAddr1);
    }

    function test_UpdateOperator_RevertIfNotOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(operatorAddr1);
        vm.expectRevert("Not agent owner");
        registry.updateOperator(agentToken1, operatorAddr2);
    }

    function test_UpdateOperator_RevertIfNotRegistered() public {
        vm.prank(ownerAddr1);
        vm.expectRevert("Agent not registered");
        registry.updateOperator(agentToken1, operatorAddr2);
    }

    function test_UpdateOperator_RevertIfUnchanged() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        vm.expectRevert("Operator unchanged");
        registry.updateOperator(agentToken1, operatorAddr1);
    }

    // ============ Transfer Ownership Tests ============

    function test_TransferOwnership_Success() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectEmit(true, true, true, false);
        emit PlayerRegistry.OwnerUpdated(agentToken1, ownerAddr1, ownerAddr2);

        vm.prank(ownerAddr1);
        registry.transferOwnership(agentToken1, ownerAddr2);

        assertEq(registry.getOwner(agentToken1), ownerAddr2);
    }

    function test_TransferOwnership_RevertIfNotOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(operatorAddr1);
        vm.expectRevert("Not agent owner");
        registry.transferOwnership(agentToken1, ownerAddr2);
    }

    function test_TransferOwnership_RevertOnZeroAddress() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        vm.expectRevert("Invalid new owner");
        registry.transferOwnership(agentToken1, address(0));
    }

    function test_TransferOwnership_RevertIfUnchanged() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        vm.expectRevert("Owner unchanged");
        registry.transferOwnership(agentToken1, ownerAddr1);
    }

    function test_TransferOwnership_NewOwnerCanUpdate() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        registry.transferOwnership(agentToken1, ownerAddr2);

        // New owner can update operator
        vm.prank(ownerAddr2);
        registry.updateOperator(agentToken1, operatorAddr2);

        assertEq(registry.getOperator(agentToken1), operatorAddr2);

        // Old owner cannot
        vm.prank(ownerAddr1);
        vm.expectRevert("Not agent owner");
        registry.updateOperator(agentToken1, operatorAddr1);
    }

    // ============ Update MetaURI Tests ============

    function test_UpdateMetaURI_Success() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectEmit(true, false, false, true);
        emit PlayerRegistry.MetaURIUpdated(agentToken1, metaURI1, metaURI2);

        vm.prank(ownerAddr1);
        registry.updateMetaURI(agentToken1, metaURI2);

        assertEq(registry.getMetaURI(agentToken1), metaURI2);
    }

    function test_UpdateMetaURI_RevertIfNotOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(operatorAddr1);
        vm.expectRevert("Not agent owner");
        registry.updateMetaURI(agentToken1, metaURI2);
    }

    // ============ Update Vault Tests ============

    function test_UpdateVault_Success() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectEmit(true, true, true, false);
        emit PlayerRegistry.VaultUpdated(agentToken1, vaultAddr1, vaultAddr2);

        vm.prank(ownerAddr1);
        registry.updateVault(agentToken1, vaultAddr2);

        assertEq(registry.getVault(agentToken1), vaultAddr2);
    }

    function test_UpdateVault_RevertIfNotOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(operatorAddr1);
        vm.expectRevert("Not agent owner");
        registry.updateVault(agentToken1, vaultAddr2);
    }

    function test_UpdateVault_RevertIfUnchanged() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        vm.expectRevert("Vault unchanged");
        registry.updateVault(agentToken1, vaultAddr1);
    }

    // ============ Update Table Tests ============

    function test_UpdateTable_Success() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectEmit(true, true, true, false);
        emit PlayerRegistry.TableUpdated(agentToken1, pokerTable1, pokerTable2);

        vm.prank(ownerAddr1);
        registry.updateTable(agentToken1, pokerTable2);

        assertEq(registry.getTable(agentToken1), pokerTable2);
    }

    function test_UpdateTable_RevertIfNotOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(operatorAddr1);
        vm.expectRevert("Not agent owner");
        registry.updateTable(agentToken1, pokerTable2);
    }

    function test_UpdateTable_RevertIfUnchanged() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.prank(ownerAddr1);
        vm.expectRevert("Table unchanged");
        registry.updateTable(agentToken1, pokerTable1);
    }

    // ============ View Function Tests ============

    function test_GetAgent_ReturnsFullInfo() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        PlayerRegistry.AgentInfo memory info = registry.getAgent(agentToken1);

        assertEq(info.vault, vaultAddr1);
        assertEq(info.table, pokerTable1);
        assertEq(info.owner, ownerAddr1);
        assertEq(info.operator, operatorAddr1);
        assertEq(info.metaURI, metaURI1);
        assertTrue(info.isRegistered);
    }

    function test_GetAgent_UnregisteredReturnsEmpty() public {
        PlayerRegistry.AgentInfo memory info = registry.getAgent(agentToken1);

        assertEq(info.vault, address(0));
        assertEq(info.table, address(0));
        assertEq(info.owner, address(0));
        assertEq(info.operator, address(0));
        assertEq(info.metaURI, "");
        assertFalse(info.isRegistered);
    }

    function test_IsOwner_ReturnsTrueForOwner() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        assertTrue(registry.isOwner(agentToken1, ownerAddr1));
        assertFalse(registry.isOwner(agentToken1, operatorAddr1));
        assertFalse(registry.isOwner(agentToken1, ownerAddr2));
    }

    function test_IsOwner_ReturnsFalseForUnregistered() public {
        assertFalse(registry.isOwner(agentToken1, ownerAddr1));
    }

    function test_IsOperator_ReturnsTrueForOperator() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        assertTrue(registry.isOperator(agentToken1, operatorAddr1));
        assertFalse(registry.isOperator(agentToken1, ownerAddr1));
        assertFalse(registry.isOperator(agentToken1, operatorAddr2));
    }

    function test_IsOperator_ReturnsFalseForUnregistered() public {
        assertFalse(registry.isOperator(agentToken1, operatorAddr1));
    }

    function test_IsAuthorized_ReturnsTrueForOwnerAndOperator() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        assertTrue(registry.isAuthorized(agentToken1, ownerAddr1));
        assertTrue(registry.isAuthorized(agentToken1, operatorAddr1));
        assertFalse(registry.isAuthorized(agentToken1, ownerAddr2));
    }

    function test_IsAuthorized_ReturnsFalseForUnregistered() public {
        assertFalse(registry.isAuthorized(agentToken1, ownerAddr1));
    }

    // ============ Enumeration Tests ============

    function test_GetRegisteredCount_ReturnsCorrectCount() public {
        assertEq(registry.getRegisteredCount(), 0);

        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);
        assertEq(registry.getRegisteredCount(), 1);

        registry.registerAgent(agentToken2, vaultAddr2, pokerTable2, ownerAddr2, operatorAddr2, metaURI2);
        assertEq(registry.getRegisteredCount(), 2);
    }

    function test_GetRegisteredTokenAt_ReturnsCorrectToken() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);
        registry.registerAgent(agentToken2, vaultAddr2, pokerTable2, ownerAddr2, operatorAddr2, metaURI2);

        assertEq(registry.getRegisteredTokenAt(0), agentToken1);
        assertEq(registry.getRegisteredTokenAt(1), agentToken2);
    }

    function test_GetRegisteredTokenAt_RevertsOnOutOfBounds() public {
        vm.expectRevert("Index out of bounds");
        registry.getRegisteredTokenAt(0);

        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        vm.expectRevert("Index out of bounds");
        registry.getRegisteredTokenAt(1);
    }

    // ============ Integration Tests ============

    function test_MultipleAgents_IndependentState() public {
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);
        registry.registerAgent(agentToken2, vaultAddr2, pokerTable2, ownerAddr2, operatorAddr2, metaURI2);

        // Verify independence
        assertEq(registry.getOwner(agentToken1), ownerAddr1);
        assertEq(registry.getOwner(agentToken2), ownerAddr2);

        // Update one, verify other unchanged
        vm.prank(ownerAddr1);
        registry.updateOperator(agentToken1, address(0x9999));

        assertEq(registry.getOperator(agentToken1), address(0x9999));
        assertEq(registry.getOperator(agentToken2), operatorAddr2);
    }

    function test_FullLifecycle() public {
        // Register
        registry.registerAgent(agentToken1, vaultAddr1, pokerTable1, ownerAddr1, operatorAddr1, metaURI1);

        // Update all fields
        vm.startPrank(ownerAddr1);
        registry.updateOperator(agentToken1, operatorAddr2);
        registry.updateVault(agentToken1, vaultAddr2);
        registry.updateTable(agentToken1, pokerTable2);
        registry.updateMetaURI(agentToken1, metaURI2);
        registry.transferOwnership(agentToken1, ownerAddr2);
        vm.stopPrank();

        // Verify all updates
        PlayerRegistry.AgentInfo memory info = registry.getAgent(agentToken1);
        assertEq(info.owner, ownerAddr2);
        assertEq(info.operator, operatorAddr2);
        assertEq(info.vault, vaultAddr2);
        assertEq(info.table, pokerTable2);
        assertEq(info.metaURI, metaURI2);
        assertTrue(info.isRegistered);
    }
}
