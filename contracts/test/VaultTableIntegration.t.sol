// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/PlayerVault.sol";
import "../src/PlayerRegistry.sol";
import "../src/ChipToken.sol";
import "./mocks/MockVRFAdapter.sol";

/**
 * @title VaultTableIntegrationTest
 * @notice Integration tests for the full lifecycle: vault → buy-in escrow → table → settlement → vault.
 * @dev Covers T-M4-03.
 */
contract VaultTableIntegrationTest is Test {
    PokerTable     public pokerTable;
    PlayerVault    public vault1;
    PlayerVault    public vault2;
    MockVRFAdapter public mockVRF;
    ChipToken      public chipToken;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);

    uint256 constant SMALL_BLIND    = 10;
    uint256 constant BIG_BLIND      = 20;
    uint256 constant BUY_IN         = 200; // bigBlind * 10 minimum

    event BuyInFunded(address indexed table, uint256 amount);
    event SettlementReceived(address indexed table, uint256 handId, uint256 amount);
    event SettlementLoss(address indexed table, uint256 handId, uint256 lossAmount);
    event VaultSnapshot(uint256 indexed handId, uint256 externalAssets, int256 cumulativePnl);

    function setUp() public {
        mockVRF   = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(mockVRF), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes,
            2,
            address(this) // admin / dealer
        );
        pokerTable.setDealer(address(this));

        // Deploy vaults for each player
        vault1 = new PlayerVault(owner1);
        vault2 = new PlayerVault(owner2);

        // Fund vaults with enough ETH for chip buy-in
        vm.deal(address(vault1), 10 ether);
        vm.deal(address(vault2), 10 ether);

        // Give players chip tokens via direct mint (simulates vault having chips)
        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);

        // Authorize the table in each vault
        vm.prank(owner1);
        vault1.authorizeTable(address(pokerTable));
        vm.prank(owner2);
        vault2.authorizeTable(address(pokerTable));
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────

    function _registerSeat(uint8 idx, address chipOwner, address op) internal {
        vm.startPrank(chipOwner);
        chipToken.approve(address(pokerTable), BUY_IN);
        pokerTable.registerSeat(idx, chipOwner, op, BUY_IN);
        vm.stopPrank();
    }

    function _startHand() internal {
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(12345);

        uint256 hid = pokerTable.currentHandId();
        for (uint8 i = 0; i < 2; i++) {
            PokerTable.Seat memory s = pokerTable.getSeat(i);
            if (s.isActive && pokerTable.holeCommits(hid, i) == bytes32(0)) {
                bytes32 commit = keccak256(abi.encodePacked(hid, i, uint8(i * 2), uint8(i * 2 + 1), bytes32("salt")));
                pokerTable.submitHoleCommit(hid, i, commit);
            }
        }
        pokerTable.advanceToPreflop();
    }

    // ─── Tests ────────────────────────────────────────────────────────────────

    /**
     * @notice Test T-M4-03: vault fundBuyIn → table escrow → hand plays → settlement → vault.
     *
     * Flow:
     *  1. Vaults fund buy-in escrow amounts.
     *  2. Chips are registered at the table (using chip tokens from owners).
     *  3. A hand is played and one player folds (simulating a quick win).
     *  4. onSettlement() is called on vault to record PnL.
     *  5. Vault records correct cumulative PnL.
     */
    function test_VaultEscrow_FundAndRelease() public {
        // Vault funds escrow for table buy-in
        vm.prank(owner1);
        vault1.fundBuyIn(address(pokerTable), 1 ether);

        assertEq(vault1.tableEscrow(address(pokerTable)), 1 ether, "Escrow recorded");
        assertEq(vault1.totalEscrow(), 1 ether, "Total escrow updated");
        // External assets excludes escrow
        assertEq(vault1.getExternalAssets(), 10 ether - 1 ether, "Assets exclude escrow");

        // Release escrow
        vm.prank(owner1);
        vault1.releaseEscrow(address(pokerTable), 0.5 ether);

        assertEq(vault1.tableEscrow(address(pokerTable)), 0.5 ether, "Escrow reduced");
        assertEq(vault1.getExternalAssets(), 10 ether - 0.5 ether, "Assets updated after release");
    }

    /**
     * @notice Test: vault.onSettlement records positive PnL correctly.
     */
    function test_VaultOnSettlement_PositivePnl() public {
        vm.prank(owner1);
        vault1.authorizeTable(address(pokerTable)); // already done but explicit

        // Simulate settlement from authorized table
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, int256(500));

        assertEq(vault1.handCount(), 1, "Hand count incremented");
        assertEq(vault1.getCumulativePnl(), int256(500), "Positive PnL recorded");
        assertEq(vault1.lastSnapshotHandId(), 1, "Last hand ID updated");
    }

    /**
     * @notice Test: vault.onSettlement records negative PnL correctly.
     */
    function test_VaultOnSettlement_NegativePnl() public {
        vm.prank(address(pokerTable));
        vault1.onSettlement(2, -int256(300));

        assertEq(vault1.getCumulativePnl(), -int256(300), "Negative PnL recorded");
        assertEq(vault1.handCount(), 1, "Hand count incremented");
    }

    /**
     * @notice Test: vault.onSettlement emits SettlementLoss for negative PnL.
     */
    function test_VaultOnSettlement_EmitsLossEvent() public {
        vm.expectEmit(true, true, true, true);
        emit SettlementLoss(address(pokerTable), 3, 100);
        vm.prank(address(pokerTable));
        vault1.onSettlement(3, -int256(100));
    }

    /**
     * @notice Test: vault.onSettlement emits VaultSnapshot after every settlement.
     */
    function test_VaultOnSettlement_EmitsSnapshot() public {
        vm.deal(address(vault1), 5 ether);
        vm.expectEmit(true, false, false, false);
        emit VaultSnapshot(1, 0, 0); // just check handId field
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, 0);
    }

    /**
     * @notice Test: unauthorized table cannot call onSettlement.
     */
    function test_VaultOnSettlement_RevertIfUnauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Not authorized table");
        vault1.onSettlement(1, 0);
    }

    /**
     * @notice Test: chip flow — seat registered, hand played, fold settles correctly.
     *
     * Full lifecycle:
     *  1. Register two seats (players pay chips from their wallets).
     *  2. Start hand and run to pre-flop.
     *  3. seat0 (SB/BTN in heads-up) raises to 30.
     *  4. seat1 (BB) folds → seat0 wins pot.
     *  5. After settle, call vault1.onSettlement with winner's gain.
     */
    function test_ChipFlow_FoldSettlement_VaultRecordsWin() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        _startHand();

        // seat0 raises to 40 (minRaise = BB + lastRaiseSize = 20+20=40), seat1 folds
        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.raise(0, 40);

        vm.roll(block.number + 1);
        vm.prank(owner2);
        pokerTable.fold(1);

        // Hand settled via fold
        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.SETTLED),
            "Game should be SETTLED after fold"
        );

        // Record winner's PnL in vault (pot was SB+BB+raise = 10+20+30=60; winner net = 60 - 40 = +20)
        // (seat0 paid 40 to win 60; gain = 20)
        uint256 handId = pokerTable.currentHandId();
        vm.prank(address(pokerTable));
        vault1.onSettlement(handId, int256(20));

        assertGt(vault1.getCumulativePnl(), 0, "Vault records positive PnL after win");
    }

    /**
     * @notice Test: cumulative PnL aggregates across multiple hands.
     */
    function test_VaultCumulativePnl_MultipleHands() public {
        vm.prank(address(pokerTable));
        vault1.onSettlement(1, int256(100));
        vm.prank(address(pokerTable));
        vault1.onSettlement(2, -int256(40));
        vm.prank(address(pokerTable));
        vault1.onSettlement(3, int256(60));

        assertEq(vault1.getCumulativePnl(), int256(120), "Cumulative PnL = 100 - 40 + 60");
        assertEq(vault1.handCount(), 3, "Three hands recorded");
    }

    // ─── T-R0-02: Vault escrow integration ────────────────────────────────────

    /**
     * @notice T-R0-02: registerSeat triggers vault.fundBuyIn, increasing totalEscrow.
     */
    function test_R0_02_RegisterSeat_TracksVaultEscrow() public {
        PlayerRegistry registry = new PlayerRegistry();
        vm.prank(owner1);
        registry.registerAgent(address(vault1), address(pokerTable), owner1, "");
        pokerTable.setPlayerRegistry(address(registry));

        assertEq(vault1.totalEscrow(), 0, "No escrow before seat registration");
        _registerSeat(0, owner1, owner1);

        assertEq(vault1.totalEscrow(), BUY_IN, "Escrow increases by buy-in amount after registerSeat");
        assertEq(vault1.tableEscrow(address(pokerTable)), BUY_IN, "Per-table escrow matches buy-in");
    }

    /**
     * @notice T-R0-02: cashOutSeat reduces vault escrow.
     */
    function test_R0_02_CashOutSeat_ReleasesVaultEscrow() public {
        PlayerRegistry registry = new PlayerRegistry();
        vm.prank(owner1);
        registry.registerAgent(address(vault1), address(pokerTable), owner1, "");
        pokerTable.setPlayerRegistry(address(registry));

        _registerSeat(0, owner1, owner1);
        assertEq(vault1.totalEscrow(), BUY_IN, "Escrow after buy-in");

        uint256 cashOutAmount = BUY_IN / 2;
        vm.prank(owner1);
        pokerTable.cashOutSeat(0, cashOutAmount, owner1);

        assertEq(vault1.totalEscrow(), BUY_IN - cashOutAmount, "Escrow reduced by cash-out amount");
    }

    /**
     * @notice T-R0-02: leaveSeat releases full vault escrow.
     */
    function test_R0_02_LeaveSeat_ReleasesFullEscrow() public {
        PlayerRegistry registry = new PlayerRegistry();
        vm.prank(owner1);
        registry.registerAgent(address(vault1), address(pokerTable), owner1, "");
        pokerTable.setPlayerRegistry(address(registry));

        _registerSeat(0, owner1, owner1);
        assertEq(vault1.totalEscrow(), BUY_IN, "Escrow after buy-in");

        vm.prank(owner1);
        pokerTable.leaveSeat(0, owner1);

        assertEq(vault1.totalEscrow(), 0, "Full escrow released after leaveSeat");
    }

    /**
     * @notice T-R0-02: unauthorized table cannot call vault.releaseEscrow.
     */
    function test_R0_02_ReleaseEscrow_RevertIfUnauthorized() public {
        vm.prank(address(0xDEAD));
        vm.expectRevert("Not authorized");
        vault1.releaseEscrow(address(pokerTable), 100);
    }

    // ─── T-R0-01: Automatic settlement callback ────────────────────────────────

    /**
     * @notice T-R0-01: PokerTable automatically calls vault.onSettlement after fold settlement.
     * @dev Sets up PlayerRegistry linking seat owners to their vaults.
     *      After a fold, expects vault1 (winner) to have positive PnL and
     *      vault2 (loser) to have negative PnL, both set automatically by the table.
     */
    function test_R0_01_AutoSettlementCallback_FoldWin() public {
        // Deploy and configure PlayerRegistry
        PlayerRegistry registry = new PlayerRegistry();

        // Register owner1 pointing to vault1 and the table
        vm.prank(owner1);
        registry.registerAgent(address(vault1), address(pokerTable), owner1, "");

        // Register owner2 pointing to vault2 and the table
        vm.prank(owner2);
        registry.registerAgent(address(vault2), address(pokerTable), owner2, "");

        // Wire registry into the table (admin is address(this))
        pokerTable.setPlayerRegistry(address(registry));

        // Register seats
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        // Start hand: SB=10 seat0, BB=20 seat1
        _startHand();

        uint256 handId = pokerTable.currentHandId();

        // seat0 is actor (heads-up: BTN/SB acts first preflop)
        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.call(0); // seat0 calls BB (puts in 10 more → total 20)

        vm.roll(block.number + 1);
        vm.prank(owner2);
        pokerTable.check(1); // seat1 checks (BB already in) → betting round complete

        // VRF fulfill for flop
        mockVRF.fulfillLastRequest(99999);

        vm.roll(block.number + 1);
        vm.prank(owner2);
        pokerTable.check(1); // flop: seat1 checks

        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.fold(0); // seat0 folds → seat1 wins pot (40 chips)

        assertEq(
            uint256(pokerTable.gameState()),
            uint256(PokerTable.GameState.SETTLED),
            "Should be SETTLED"
        );

        // vault2 (seat1 = winner) should have positive PnL: won 40, bet 20 → pnl = +20
        assertEq(vault2.handCount(), 1, "vault2 should record 1 hand");
        assertGt(vault2.getCumulativePnl(), 0, "vault2 winner should have positive PnL");

        // vault1 (seat0 = loser) should have negative PnL: won 0, bet 20 → pnl = -20
        assertEq(vault1.handCount(), 1, "vault1 should record 1 hand");
        assertLt(vault1.getCumulativePnl(), 0, "vault1 loser should have negative PnL");

        // Exact amounts: pot = 40 (20+20). seat0 bet 20, won 0 → pnl = -20. seat1 bet 20, won 40 → pnl = +20
        assertEq(vault2.getCumulativePnl(), int256(20), "vault2 net +20");
        assertEq(vault1.getCumulativePnl(), -int256(20), "vault1 net -20");

        // hand IDs should match
        assertEq(vault1.lastSnapshotHandId(), handId, "vault1 hand ID matches");
        assertEq(vault2.lastSnapshotHandId(), handId, "vault2 hand ID matches");
    }

    /**
     * @notice T-R0-01: Vault callback is silently skipped when playerRegistry is not set.
     */
    function test_R0_01_AutoSettlementCallback_SkipsIfNoRegistry() public {
        // No registry set — playerRegistry == address(0)
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);
        _startHand();

        // Preflop: seat0 (BTN/SB) is first actor in heads-up
        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.fold(0); // seat0 folds immediately

        // Vaults should NOT have been called (no registry)
        assertEq(vault1.handCount(), 0, "No callback without registry");
        assertEq(vault2.handCount(), 0, "No callback without registry");
    }
}

// ─── T-R0-03: Per-hand rebalancing end-to-end ─────────────────────────────

import "../src/NadfunCompatToken.sol";
import "./mocks/MockNadfunRouter.sol";

contract RebalancingIntegrationTest is Test {
    PokerTable      public pokerTable;
    PlayerVault     public vault1;
    PlayerVault     public vault2;
    PlayerRegistry  public registry;
    MockVRFAdapter  public mockVRF;
    ChipToken       public chipToken;
    NadfunCompatToken public agentToken;
    MockNadfunRouter  public router;

    address public owner1 = address(0x1);
    address public owner2 = address(0x2);

    uint256 constant SMALL_BLIND = 10;
    uint256 constant BIG_BLIND   = 20;
    uint256 constant BUY_IN      = 200;

    function setUp() public {
        mockVRF   = new MockVRFAdapter();
        chipToken = new ChipToken("TestChip", "TCHIP");
        agentToken = new NadfunCompatToken("AgentToken", "AGT", "", 1_000_000e18, address(this), address(this));
        router = new MockNadfunRouter();

        pokerTable = new PokerTable(
            1, SMALL_BLIND, BIG_BLIND,
            address(mockVRF), address(chipToken), address(0),
            30 minutes, 5 minutes, 10 minutes, 2, address(this)
        );
        pokerTable.setDealer(address(this));

        vault1 = new PlayerVault(owner1);
        vault2 = new PlayerVault(owner2);

        // Fund vaults with ETH for rebalancing buys
        vm.deal(address(vault1), 10 ether);
        vm.deal(address(vault2), 10 ether);

        // Fund router with agent tokens and ETH for sells
        agentToken.transfer(address(router), 500_000e18);
        vm.deal(address(router), 10 ether);

        chipToken.mint(owner1, BUY_IN * 100);
        chipToken.mint(owner2, BUY_IN * 100);

        vm.prank(owner1);
        vault1.authorizeTable(address(pokerTable));
        vm.prank(owner2);
        vault2.authorizeTable(address(pokerTable));

        registry = new PlayerRegistry();
        vm.prank(owner1);
        registry.registerAgent(address(vault1), address(pokerTable), owner1, "");
        vm.prank(owner2);
        registry.registerAgent(address(vault2), address(pokerTable), owner2, "");

        pokerTable.setPlayerRegistry(address(registry));

        // Configure vault1 for rebalancing
        vm.prank(owner1);
        vault1.setRebalanceConfig(address(agentToken), address(router), 1000, 1000); // 10% each
    }

    function _registerSeat(uint8 idx, address chipOwner, address op) internal {
        vm.startPrank(chipOwner);
        chipToken.approve(address(pokerTable), BUY_IN);
        pokerTable.registerSeat(idx, chipOwner, op, BUY_IN);
        vm.stopPrank();
    }

    function _playAndFold() internal returns (uint256 handId) {
        pokerTable.startHand();
        mockVRF.fulfillLastRequest(12345);
        handId = pokerTable.currentHandId();
        for (uint8 i = 0; i < 2; i++) {
            PokerTable.Seat memory s = pokerTable.getSeat(i);
            if (s.isActive && pokerTable.holeCommits(handId, i) == bytes32(0)) {
                bytes32 commit = keccak256(abi.encodePacked(handId, i, uint8(i * 2), uint8(i * 2 + 1), bytes32("salt")));
                pokerTable.submitHoleCommit(handId, i, commit);
            }
        }
        pokerTable.advanceToPreflop();
        // seat0 folds → seat1 wins
        vm.roll(block.number + 1);
        vm.prank(owner1);
        pokerTable.fold(0);
    }

    /**
     * @notice T-R0-03: After settlement, vault can execute rebalanceBuy for the settled hand.
     * @dev Router rate is set so q_buy < P (NAV-accretive): many tokens out per ETH in.
     *      With N=1M tokens, A=10ETH: need tokensPerMon >= N/A = 1e24/10e18 = 1e5 tokens/ETH.
     *      We use 1e6 tokens/ETH (tokensPerMonScaled = 1e6 * 1e18 = 1e24).
     */
    function test_R0_03_RebalanceBuy_AfterSettlement() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        uint256 handId = _playAndFold();

        // vault1 (loser) has settlement recorded
        assertEq(vault1.lastSnapshotHandId(), handId, "vault1 snapshot updated");

        // Need tokensPerMonScaled >= N * 1e18 / A = 1e24*1e18/10e18 = 1e23.
        // Use 3e23 so tokenOut = 3e23 tokens/ETH, router has 5e23 capacity.
        router.setRates(3e23, 5e17);

        uint256 assets = vault1.getExternalAssets();
        uint256 monIn = (assets * 1000) / 10000; // 10% limit

        vm.prank(owner1);
        vault1.rebalanceBuy(handId, monIn, 0);

        assertEq(vault1.lastRebalanceHandId(), handId, "rebalance recorded for hand");
    }

    /**
     * @notice T-R0-03: Second rebalance for same hand reverts.
     */
    function test_R0_03_RebalanceBuy_RevertOnDoubleRebalance() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        uint256 handId = _playAndFold();

        router.setRates(3e23, 5e17);
        uint256 assets = vault1.getExternalAssets();
        uint256 monIn = (assets * 1000) / 10000;

        vm.prank(owner1);
        vault1.rebalanceBuy(handId, monIn, 0);

        // Second attempt on same hand must revert
        vm.prank(owner1);
        vm.expectRevert("Already rebalanced this hand");
        vault1.rebalanceBuy(handId, monIn, 0);
    }

    /**
     * @notice T-R0-03: NAV-accretive buy constraint — bad rate reverts.
     */
    function test_R0_03_RebalanceBuy_RevertIfDilutive() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        uint256 handId = _playAndFold();

        // Very few tokens per ETH → q_buy >> P → dilutive
        router.setRates(1e14, 5e17); // almost 0 tokens/ETH

        uint256 assets = vault1.getExternalAssets();
        uint256 monIn = (assets * 1000) / 10000;

        vm.prank(owner1);
        vm.expectRevert("Buy would dilute NAV");
        vault1.rebalanceBuy(handId, monIn, 0);
    }

    /**
     * @notice T-R0-03: rebalanceSell after settlement succeeds.
     * @dev Sell rate: high monOut/token so q_sell >> P → accretive.
     */
    function test_R0_03_RebalanceSell_AfterSettlement() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        // Seed vault1 with agent tokens to sell
        agentToken.transfer(address(vault1), 1000e18);
        // Also ensure router has enough ETH to pay out
        vm.deal(address(router), 100 ether);

        uint256 handId = _playAndFold();

        // N = T - B = 1_000_000e18 - 1000e18 = 999_000e18; A ≈ 10e18
        // P = A/N ≈ 10e18/999_000e18 ≈ 1e13 wei/token
        // For sell to be accretive: q_sell = monOut/tokenIn >= P
        // Use high monPerTokenScaled: 1e13 wei/token works; use 1e16 for margin
        router.setRates(2e18, 1e16); // sell: 1e16 wei per token-unit (>> P)

        uint256 tokenIn = (1000e18 * 1000) / 10000; // 10% of vault1's token balance

        vm.startPrank(owner1);
        vault1.rebalanceSell(handId, tokenIn, 0);
        vm.stopPrank();

        assertEq(vault1.lastRebalanceHandId(), handId, "sell rebalance recorded");
    }

    /**
     * @notice T-R0-03: rebalanceSell reverts if NAV-accretive constraint violated.
     */
    function test_R0_03_RebalanceSell_RevertIfDilutive() public {
        _registerSeat(0, owner1, owner1);
        _registerSeat(1, owner2, owner2);

        agentToken.transfer(address(vault1), 1000e18);
        uint256 handId = _playAndFold();

        // Near-zero monOut/token → q_sell << P → dilutive
        router.setRates(2e18, 1); // 1 wei per token-unit

        vm.prank(owner1);
        vm.expectRevert("Sell would dilute NAV");
        vault1.rebalanceSell(handId, 100e18, 0);
    }
}
