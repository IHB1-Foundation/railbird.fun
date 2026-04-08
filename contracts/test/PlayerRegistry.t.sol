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
        registry.registerAgent(vaultAddr1, pokerTable1, address(0), "");

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

    // ============ Strategy Registry Tests ============

    bytes32 constant HASH_V1 = keccak256("strategy-config-v1");
    bytes32 constant HASH_V2 = keccak256("strategy-config-v2");

    function _registerAgent1() internal {
        vm.prank(agent1);
        registry.registerAgent(vaultAddr1, pokerTable1, operatorAddr1, metaURI1);
    }

    function test_UpdateStrategy_OwnerCanSet() public {
        _registerAgent1();
        vm.prank(agent1); // owner
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);

        assertEq(registry.getStrategyCount(agent1), 1);
    }

    function test_UpdateStrategy_OperatorCanSet() public {
        _registerAgent1();
        vm.prank(operatorAddr1); // operator
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);

        assertEq(registry.getStrategyCount(agent1), 1);
    }

    function test_UpdateStrategy_UnauthorizedReverts() public {
        _registerAgent1();
        vm.prank(agent2);
        vm.expectRevert("Not authorized");
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);
    }

    function test_UpdateStrategy_VersionAutoIncrements() public {
        _registerAgent1();
        vm.prank(agent1);
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);
        vm.prank(agent1);
        registry.updateStrategy(agent1, HASH_V2, "maniac", 9000, 2000, 7000);

        assertEq(registry.getStrategyCount(agent1), 2);
        (PlayerRegistry.StrategyRecord memory rec, bool exists) = registry.getLatestStrategy(agent1);
        assertTrue(exists);
        assertEq(rec.version, 2);
        assertEq(rec.configHash, HASH_V2);
        assertEq(rec.personaId, "maniac");
    }

    function test_UpdateStrategy_EmitsEvent() public {
        _registerAgent1();
        vm.prank(agent1);
        vm.expectEmit(true, false, false, true);
        emit PlayerRegistry.StrategyUpdated(agent1, 1, HASH_V1, "shark", 7000, 7000, 3000);
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);
    }

    function test_UpdateStrategy_OutOfRangeReverts() public {
        _registerAgent1();
        vm.prank(agent1);
        vm.expectRevert("aggressionBps out of range");
        registry.updateStrategy(agent1, HASH_V1, "shark", 10001, 7000, 3000);
    }

    function test_GetLatestStrategy_NoHistory() public {
        _registerAgent1();
        (PlayerRegistry.StrategyRecord memory rec, bool exists) = registry.getLatestStrategy(agent1);
        assertFalse(exists);
        assertEq(rec.version, 0);
    }

    function test_GetStrategyHistory_Pagination() public {
        _registerAgent1();
        for (uint16 i = 0; i < 5; i++) {
            vm.prank(agent1);
            registry.updateStrategy(agent1, bytes32(uint256(i)), "shark", i * 1000, 5000, 2000);
        }
        assertEq(registry.getStrategyCount(agent1), 5);

        PlayerRegistry.StrategyRecord[] memory page = registry.getStrategyHistory(agent1, 0, 3);
        assertEq(page.length, 3);
        assertEq(page[0].version, 1);
        assertEq(page[2].version, 3);

        PlayerRegistry.StrategyRecord[] memory page2 = registry.getStrategyHistory(agent1, 3, 3);
        assertEq(page2.length, 2);
        assertEq(page2[0].version, 4);
    }

    function test_GetStrategyHistory_EmptyOnOffset() public {
        _registerAgent1();
        vm.prank(agent1);
        registry.updateStrategy(agent1, HASH_V1, "shark", 7000, 7000, 3000);

        PlayerRegistry.StrategyRecord[] memory page = registry.getStrategyHistory(agent1, 999, 10);
        assertEq(page.length, 0);
    }

    function test_UpdateStrategy_FieldsStoredCorrectly() public {
        _registerAgent1();
        vm.prank(agent1);
        registry.updateStrategy(agent1, HASH_V1, "adaptive", 5000, 5000, 3000);

        (PlayerRegistry.StrategyRecord memory rec, bool exists) = registry.getLatestStrategy(agent1);
        assertTrue(exists);
        assertEq(rec.configHash, HASH_V1);
        assertEq(rec.personaId, "adaptive");
        assertEq(rec.aggressionBps, 5000);
        assertEq(rec.tightnessBps, 5000);
        assertEq(rec.bluffFreqBps, 3000);
        assertEq(rec.version, 1);
        assertGt(rec.timestamp, 0);
    }
}
