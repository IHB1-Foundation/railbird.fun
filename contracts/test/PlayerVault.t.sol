// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PlayerVault.sol";
import "./mocks/MockERC20.sol";
import "./mocks/MockDexRouter.sol";

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

    /// @notice T-R15-03: fundBuyIn from non-authorized address reverts
    function test_FundBuyIn_RevertIfNotAuthorized() public {
        vault.deposit{value: 5 ether}();
        vm.prank(randomUser);
        vm.expectRevert("Not authorized");
        vault.fundBuyIn(tbl, 1 ether);
    }

    /// @notice T-R15-03: authorized table can call fundBuyIn
    function test_FundBuyIn_AuthorizedTable() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        vm.prank(tbl);
        vault.fundBuyIn(tbl, 1 ether);
        assertEq(vault.totalEscrow(), 1 ether);
    }

    /// @notice T-R15-03: revokeTable removes authorization
    function test_RevokeTable() public {
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        assertTrue(vault.authorizedTables(tbl));
        vm.prank(vaultOwner);
        vault.revokeTable(tbl);
        assertFalse(vault.authorizedTables(tbl));
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

    // ─── T-M1-06: On-chain accretive-only rebalancing ─────────────────────────

    MockERC20         internal agentToken;
    MockDexRouter  internal router;

    uint256 constant SUPPLY     = 1_000_000 ether; // total supply
    uint256 constant VAULT_HOLD = 200_000 ether;   // B: vault-owned tokens
    // N = SUPPLY - VAULT_HOLD = 800_000 ether (outstanding)
    // Vault starts with 10 ETH external assets → P = 10e18 / 800_000e18 ≈ 12.5e-6 ETH/token

    function _setupRebalance() internal {
        // Deploy token: minter = vaultOwner; mint supply to this test contract first
        agentToken = new MockERC20("Agent", "AGT");
        agentToken.mint(vaultOwner, SUPPLY);

        // Give vault some tokens (treasury share)
        vm.prank(vaultOwner);
        agentToken.transfer(address(vault), VAULT_HOLD);

        // Fund router with tokens (for buyTokens) and ETH (for sellTokens)
        router = new MockDexRouter();
        vm.prank(vaultOwner);
        agentToken.transfer(address(router), 100_000 ether);
        vm.deal(address(router), 100 ether);
        // P = A/N = 10e18 / 800_000e18 = 1.25e-5 ETH/token.
        // Accretive buy: ≥80_000 tokens per ETH → use 100_000 tokens/ETH.
        // Accretive sell: ≥1.25e-5 ETH/token → use 2e-5 ETH/token = monPerTokenScaled=2e13.
        router.setRates(100_000e18, 2e13);

        // Fund vault with 10 ETH of external assets
        vm.deal(address(vault), 10 ether);

        // Authorize table, simulate a hand settlement
        vm.prank(vaultOwner);
        vault.authorizeTable(tbl);
        vm.prank(tbl);
        vault.onSettlement(1, 0);

        // Configure rebalancing: max 10% of assets per buy, max 10% of tokens per sell
        vm.prank(vaultOwner);
        vault.setRebalanceConfig(address(agentToken), address(router), 1000, 1000);
    }

    function test_SetRebalanceConfig() public {
        agentToken = new MockERC20("Agent", "AGT");
        router = new MockDexRouter();
        vm.prank(vaultOwner);
        vault.setRebalanceConfig(address(agentToken), address(router), 500, 300);
        assertEq(vault.agentToken(), address(agentToken));
        assertEq(vault.dexRouter(), address(router));
        assertEq(vault.rebalanceMaxMonBps(), 500);
        assertEq(vault.rebalanceMaxTokenBps(), 300);
    }

    function test_SetRebalanceConfig_RevertZeroToken() public {
        router = new MockDexRouter();
        vm.prank(vaultOwner);
        vm.expectRevert("Invalid token");
        vault.setRebalanceConfig(address(0), address(router), 500, 300);
    }

    function test_SetRebalanceConfig_RevertZeroRouter() public {
        agentToken = new MockERC20("Agent", "AGT");
        vm.prank(vaultOwner);
        vm.expectRevert("Invalid router");
        vault.setRebalanceConfig(address(agentToken), address(0), 500, 300);
    }

    function test_RebalanceBuy_AccretiveSucceeds() public {
        _setupRebalance();
        // Router rate: 2 tokens per MON → q_buy = 0.5 MON/token
        // P = 10 ETH / 800_000 tokens ≈ 0.0000125 ETH/token
        // q_buy << P → strongly accretive, should pass
        uint256 monIn = 0.1 ether; // 10% of 1 ETH (maxMonBps=1000 → 10% of 10 ETH = 1 ETH)
        uint256 minOut = 0;
        vm.prank(vaultOwner);
        vault.rebalanceBuy(1, monIn, minOut);
        // Vault's token balance should have increased
        assertGt(agentToken.balanceOf(address(vault)), VAULT_HOLD);
    }

    function test_RebalanceBuy_DilutiveReverts() public {
        _setupRebalance();
        // Set router to give very few tokens: 1 token per 1000 MON (terrible rate)
        // q_buy = 1000 MON / 1 token >> P → dilutive
        router.setRates(1e12, 1e6); // 0.000001 tokens per MON
        uint256 monIn = 0.1 ether;
        vm.prank(vaultOwner);
        vm.expectRevert("Buy would dilute NAV");
        vault.rebalanceBuy(1, monIn, 0);
    }

    function test_RebalanceBuy_SizeLimitReverts() public {
        _setupRebalance();
        // maxMonBps = 1000 → max 10% of 10 ETH = 1 ETH; try to buy with 2 ETH
        vm.prank(vaultOwner);
        vm.expectRevert("Buy exceeds size limit");
        vault.rebalanceBuy(1, 2 ether, 0);
    }

    function test_RebalanceBuy_WrongHandReverts() public {
        _setupRebalance();
        vm.prank(vaultOwner);
        vm.expectRevert("Not current settled hand");
        vault.rebalanceBuy(99, 0.1 ether, 0);
    }

    function test_RebalanceBuy_AlreadyRebalancedReverts() public {
        _setupRebalance();
        vm.prank(vaultOwner);
        vault.rebalanceBuy(1, 0.1 ether, 0);
        vm.prank(vaultOwner);
        vm.expectRevert("Already rebalanced this hand");
        vault.rebalanceBuy(1, 0.1 ether, 0);
    }

    function test_RebalanceSell_AccretiveSucceeds() public {
        _setupRebalance();
        // Router: 0.5 MON per token → sell 10k tokens → receive 5000 MON
        // P ≈ 0.0000125 ETH/token; q_sell = 0.5 ETH/token >> P → accretive
        uint256 tokenIn = 20_000 ether; // 10% of 200k vault tokens
        vm.prank(vaultOwner);
        vault.rebalanceSell(1, tokenIn, 0);
        // Vault token balance should have decreased
        assertLt(agentToken.balanceOf(address(vault)), VAULT_HOLD);
        // Vault ETH should have increased
        assertGt(vault.getExternalAssets(), 10 ether);
    }

    function test_RebalanceSell_DilutiveReverts() public {
        _setupRebalance();
        // Set router to give very little MON: 1 wei per token
        router.setRates(2e18, 1); // 1 wei MON per token
        uint256 tokenIn = 20_000 ether;
        vm.prank(vaultOwner);
        vm.expectRevert("Sell would dilute NAV");
        vault.rebalanceSell(1, tokenIn, 0);
    }

    function test_RebalanceSell_SizeLimitReverts() public {
        _setupRebalance();
        // maxTokenBps = 1000 → max 10% of 200k = 20k tokens; try 30k
        vm.prank(vaultOwner);
        vm.expectRevert("Sell exceeds size limit");
        vault.rebalanceSell(1, 30_000 ether, 0);
    }

    function test_RebalanceSell_WrongHandReverts() public {
        _setupRebalance();
        vm.prank(vaultOwner);
        vm.expectRevert("Not current settled hand");
        vault.rebalanceSell(99, 20_000 ether, 0);
    }

    function test_RebalanceSell_AlreadyRebalancedReverts() public {
        _setupRebalance();
        vm.prank(vaultOwner);
        vault.rebalanceSell(1, 20_000 ether, 0);
        vm.prank(vaultOwner);
        vm.expectRevert("Already rebalanced this hand");
        vault.rebalanceSell(1, 20_000 ether, 0);
    }

    function test_RebalanceConfig_NotOwnerReverts() public {
        _setupRebalance();
        vm.prank(randomUser);
        vm.expectRevert("Not owner");
        vault.rebalanceBuy(1, 0.1 ether, 0);
    }
}
