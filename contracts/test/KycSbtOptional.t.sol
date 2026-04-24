// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import "forge-std/Test.sol";
import "../src/PokerTable.sol";
import "../src/ChipToken.sol";
import "./mocks/MockVRFAdapter.sol";

/**
 * @title KycSbtOptionalTest
 * @notice Verifies that PokerTable.registerSeat succeeds when KYC_SBT_ADDRESS == address(0).
 *
 * Context: On Initia, there is no equivalent KYC SBT contract. DeployInitia.s.sol passes
 * address(0) for kycSBT, which must leave registerSeat fully open.
 */
contract KycSbtOptionalTest is Test {
    PokerTable internal tbl;
    ChipToken public chip;
    MockVRFAdapter public vrf;

    address internal alice = address(0xA11CE);
    address internal bob = address(0xB0B);

    uint256 constant SB = 10;
    uint256 constant BB = 20;
    uint256 constant BUY_IN = 500;

    // ── helpers ─────────────────────────────────────────────────────────────

    function _makeTable(address kycAddr) internal returns (PokerTable t) {
        t = new PokerTable(
            1,
            SB,
            BB,
            address(vrf),
            address(chip),
            kycAddr,
            30 minutes,
            5 minutes,
            10 minutes,
            9,
            address(this)
        );
    }

    function _fundAndApprove(address user, PokerTable t) internal {
        chip.mint(user, BUY_IN * 10);
        vm.prank(user);
        chip.approve(address(t), BUY_IN * 10);
    }

    // ── setup ────────────────────────────────────────────────────────────────

    function setUp() public {
        vrf = new MockVRFAdapter();
        chip = new ChipToken("TestChip", "TCHIP");
    }

    // ── tests ────────────────────────────────────────────────────────────────

    /// @dev registerSeat must succeed when kycSBT == address(0) (Initia deploy scenario).
    function test_registerSeat_succeeds_kycDisabled() public {
        tbl = _makeTable(address(0));
        _fundAndApprove(alice, tbl);

        vm.prank(alice);
        tbl.registerSeat(0, alice, alice, BUY_IN);

        (address seatOwner,,,,,,) = tbl.seats(0);
        assertEq(seatOwner, alice, "seat owner mismatch");
    }

    /// @dev Two players can register when kycSBT == address(0).
    function test_twoPlayers_register_kycDisabled() public {
        tbl = _makeTable(address(0));
        _fundAndApprove(alice, tbl);
        _fundAndApprove(bob, tbl);

        vm.prank(alice);
        tbl.registerSeat(0, alice, alice, BUY_IN);

        vm.prank(bob);
        tbl.registerSeat(1, bob, bob, BUY_IN);

        (address seat0Owner,,,,,,) = tbl.seats(0);
        (address seat1Owner,,,,,,) = tbl.seats(1);
        assertEq(seat0Owner, alice);
        assertEq(seat1Owner, bob);
    }

    /// @dev kycSBT field should be address(0) when deployed with that value.
    function test_kycSBT_storedAsZero_whenDisabled() public {
        tbl = _makeTable(address(0));
        assertEq(tbl.kycSBT(), address(0));
    }

    /// @dev kycSBT field is stored correctly when a real address is provided.
    function test_kycSBT_storedCorrectly_whenProvided() public {
        address fakeKyc = address(0xDEAD);
        tbl = _makeTable(fakeKyc);
        assertEq(tbl.kycSBT(), fakeKyc, "kycSBT not stored");
    }
}
