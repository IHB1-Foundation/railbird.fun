// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerRegistry.sol";

contract PlayerRegistryTest is Test {
    PlayerRegistry public registry;

    address public agent1 = address(0x1001);
    address public agent2 = address(0x1002);
    address public vaultAddr1 = address(0x2001);
    address public pokerTable1 = address(0x3001);
    address public operatorAddr1 = address(0x5001);
    string public metaURI1 = "ipfs://agent1-metadata";
    string public metaURI2 = "ipfs://agent2-metadata";

    function setUp() public {
        registry = new PlayerRegistry();
    }

    // ============ Registration Tests ============

    function test_RegisterAgent_Success() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        assertTrue(registry.isRegistered(agent1));
        assertEq(registry.getOwner(agent1), agent1);
        assertEq(registry.getOperator(agent1), operatorAddr1);
        assertEq(registry.getVault(agent1), vaultAddr1);
        assertEq(registry.getTable(agent1), pokerTable1);
        assertEq(registry.getMetaURI(agent1), metaURI1);
    }

    function test_RegisterAgent_OperatorDefaultsToSender() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, address(0), metaURI1);
        assertEq(registry.getOperator(agent1), agent1);
    }

    function test_RegisterAgent_RevertOnDuplicate() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        vm.prank(agent1);
        vm.expectRevert("Agent already registered");
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);
    }

    function test_RegisterAgent_Enumeration() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);
        vm.prank(agent2);
        registry.registerAgent(address(0), address(0), address(0), "");

        assertEq(registry.getRegisteredCount(), 2);
        assertEq(registry.getRegisteredAgentAt(0), agent1);
        assertEq(registry.getRegisteredAgentAt(1), agent2);
    }

    // ============ Update Tests ============

    function test_UpdateOperator() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        address newOp = address(0x9999);
        vm.prank(agent1);
        registry.updateOperator(agent1, newOp);
        assertEq(registry.getOperator(agent1), newOp);
    }

    function test_TransferOwnership() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        address newOwner = address(0x8888);
        vm.prank(agent1);
        registry.transferOwnership(agent1, newOwner);
        assertEq(registry.getOwner(agent1), newOwner);
    }

    function test_UpdateMetaURI() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        vm.prank(agent1);
        registry.updateMetaURI(agent1, metaURI2);
        assertEq(registry.getMetaURI(agent1), metaURI2);
    }

    // ============ Auth Checks ============

    function test_IsAuthorized() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        assertTrue(registry.isAuthorized(agent1, agent1));
        assertTrue(registry.isAuthorized(agent1, operatorAddr1));
        assertFalse(registry.isAuthorized(agent1, agent2));
    }

    function test_UpdateOperator_RevertIfNotOwner() public {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);

        vm.prank(agent2);
        vm.expectRevert("Not agent owner");
        registry.updateOperator(agent1, address(0x9999));
    }
}
