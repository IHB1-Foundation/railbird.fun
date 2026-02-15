// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/NadfunCompatRouter.sol";
import "../src/NadfunCompatLens.sol";
import "../src/interfaces/IERC20.sol";

contract NadfunCompatTest is Test {
    NadfunCompatRouter internal router;
    NadfunCompatLens internal lens;

    address internal constant ALICE = address(0xA11CE);
    address internal constant BOB = address(0xB0B);
    address internal constant WMON = address(0x5a4E0bFDeF88C9032CB4d24338C5EB3d3870BfDd);

    function setUp() public {
        router = new NadfunCompatRouter(WMON, address(this));
        lens = new NadfunCompatLens(address(router));

        // Ensure zero fee setup for predictable tests.
        router.setFeeConfig(0, 0, 0);

        vm.deal(ALICE, 20 ether);
        vm.deal(BOB, 20 ether);
    }

    function test_CreateWithInitialBuyAndQuotes() public {
        vm.startPrank(ALICE);

        NadfunCompatRouter.TokenCreationParams memory params = NadfunCompatRouter.TokenCreationParams({
            name: "Railbird Player A",
            symbol: "RBPA",
            tokenURI: "https://be.railbird.fun/api/token-metadata/player-a.json",
            amountOut: 0,
            salt: keccak256("rb-a"),
            actionId: 0
        });

        (address token,) = router.create{value: 1 ether}(params);
        vm.stopPrank();

        assertTrue(token != address(0), "token should be deployed");
        assertGt(IERC20(token).balanceOf(ALICE), 0, "creator should receive initial buy tokens");

        (uint256 buyOut,,) = lens.getBuyQuote(token, 0.25 ether);
        (uint256 sellOut,,) = lens.getSellQuote(token, 1e18);

        assertGt(buyOut, 0, "buy quote should be positive");
        assertGt(sellOut, 0, "sell quote should be positive");
    }

    function test_BuyThenSellFlow() public {
        vm.prank(ALICE);
        (address token,) = router.create{value: 1 ether}(
            NadfunCompatRouter.TokenCreationParams({
                name: "Railbird Player B",
                symbol: "RBPB",
                tokenURI: "https://be.railbird.fun/api/token-metadata/player-b.json",
                amountOut: 0,
                salt: keccak256("rb-b"),
                actionId: 0
            })
        );

        vm.prank(BOB);
        uint256 tokenOut = router.buy{value: 0.5 ether}(token, 1, block.timestamp + 100, BOB);
        assertGt(tokenOut, 0, "buy should return tokens");

        vm.startPrank(BOB);
        IERC20(token).approve(address(router), tokenOut);
        uint256 monOut = router.sell(token, tokenOut / 2, 1, block.timestamp + 100, BOB);
        vm.stopPrank();

        assertGt(monOut, 0, "sell should return MON");
    }

    function test_LensTokenInfo() public {
        vm.prank(ALICE);
        (address token,) = router.create{value: 1 ether}(
            NadfunCompatRouter.TokenCreationParams({
                name: "Railbird Player C",
                symbol: "RBPC",
                tokenURI: "https://be.railbird.fun/api/token-metadata/player-c.json",
                amountOut: 0,
                salt: keccak256("rb-c"),
                actionId: 0
            })
        );

        INadfunLens.TokenInfo memory info = lens.getTokenInfo(token);
        assertEq(uint8(info.stage), uint8(INadfunLens.TokenStage.Bonding), "stage should be bonding");
        assertEq(info.router, address(router), "router should match");
        assertEq(info.tradeable, true, "token should be tradeable");
        assertGt(info.totalSupply, 0, "supply should be set");
    }
}

