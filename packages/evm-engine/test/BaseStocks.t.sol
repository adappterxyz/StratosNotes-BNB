// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FlowEngine} from "../src/FlowEngine.sol";
import {B20StandIn} from "../src/base-stocks/B20StandIn.sol";
import {B20StockFaucet} from "../src/base-stocks/B20StockFaucet.sol";
import {B20MultiplierFeed} from "../src/base-stocks/B20MultiplierFeed.sol";
import {IB20} from "../src/base-stocks/IB20.sol";
import {ProductsBase} from "./Products.t.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// notes.markets' B20 stand-in (a test imitation of Coinbase's tokenized stocks, docs/BASE-STOCKS.md), its faucet and
/// its multiplier feed, on their own.
contract B20StandInTest is Test {
    B20StandIn t;
    B20StockFaucet faucet;
    B20MultiplierFeed feed;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address real = 0xb2000000000000000000001e800a7f5189430cD0; // TSLAc on Base mainnet (reference only)

    function setUp() public {
        t = new B20StandIn("Tesla (notes.markets test stand-in for Coinbase TSLAc)", "TSLAc", 8, 1e18, real, address(this));
        faucet = new B20StockFaucet(address(this));
        feed = new B20MultiplierFeed(IB20(address(t)), "TSLAc multiplier");
        t.setMinter(address(faucet), true);
        faucet.setDrip(address(t), 10e8, 1 days, 25e8);
    }

    function test_looksLikeTheRealToken() public view {
        assertEq(t.symbol(), "TSLAc");
        assertEq(t.decimals(), 8);
        assertEq(t.realToken(), real);
        assertTrue(t.STAND_IN());
        assertEq(t.WAD_PRECISION(), 1e18);
        assertEq(t.multiplier(), 1e18);
        assertEq(t.uiMultiplier(), 1e18);
        assertTrue(t.policyExists(1));
        assertFalse(t.policyExists(2));
    }

    function test_corporateActionMovesTheMultiplierNotBalances() public {
        t.mint(alice, 10e8);
        t.setMultiplier(2e18); // a 2:1 split
        assertEq(t.balanceOf(alice), 10e8, "balances never change");
        assertEq(t.scaledBalanceOf(alice), 20e8, "shares double");
        assertEq(t.balanceOfUI(alice), 20e8);
        assertEq(t.totalSupplyUI(), 20e8);
        assertEq(t.toUIAmount(3e8), 6e8);
        assertEq(t.fromUIAmount(6e8), 3e8);
        t.setMultiplier(1.000537939576369481e18); // NVDAc's on 2026-11-15: dividends reinvested
        assertEq(t.scaledBalanceOf(alice), 1_000_537_939, "10.00537939 shares, rounded down to base units");
    }

    function test_onlyTheOwnerMovesTheMultiplierWithinBounds() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        t.setMultiplier(2e18);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.BadMultiplier.selector, 0));
        t.setMultiplier(0);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.BadMultiplier.selector, 1001e18));
        t.setMultiplier(1001e18);
    }

    function test_pauseStopsEveryBalanceChangeButNotApprove() public {
        t.mint(alice, 10e8);
        t.setPaused(true);
        vm.startPrank(alice);
        vm.expectRevert(B20StandIn.TokenPaused.selector);
        t.transfer(bob, 1);
        t.approve(bob, 5e8); // approve is never gated
        vm.stopPrank();
        vm.prank(bob);
        vm.expectRevert(B20StandIn.TokenPaused.selector);
        t.transferFrom(alice, bob, 1);
        vm.expectRevert(B20StandIn.TokenPaused.selector);
        t.mint(alice, 1);
        t.setPaused(false);
        vm.prank(bob);
        t.transferFrom(alice, bob, 5e8);
        assertEq(t.balanceOf(bob), 5e8);
    }

    function test_policyBlocksSendingAndReceivingLikeB20() public {
        t.mint(alice, 10e8);
        t.setBlocked(bob, true);
        assertFalse(t.isAuthorized(1, bob));
        assertTrue(t.isAuthorized(1, alice));
        assertFalse(t.isAuthorized(7, alice), "unknown policy: not authorized, never a revert");
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.PolicyForbids.selector, uint64(1), bob));
        t.transfer(bob, 1);
        t.setBlocked(bob, false);
        vm.prank(alice);
        t.transfer(bob, 1e8);
        t.setBlocked(bob, true);
        vm.prank(bob);
        t.approve(alice, 1e8); // approve is not policy-gated
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.PolicyForbids.selector, uint64(1), bob));
        t.transfer(alice, 1);
    }

    function test_onlyMintersMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.NotMinter.selector, alice));
        t.mint(alice, 1);
    }

    function test_faucetIsPublicAndRateLimited() public {
        vm.warp(10 days);
        vm.prank(alice);
        faucet.claim(address(t));
        assertEq(t.balanceOf(alice), 10e8);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(B20StockFaucet.TooSoon.selector, address(t), 11 days));
        faucet.claim(address(t));
        vm.prank(bob);
        faucet.claimAll();
        assertEq(t.balanceOf(bob), 10e8);
        // The daily cap (25 tokens): a third claimant today gets nothing.
        address carol = makeAddr("carol");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(B20StockFaucet.DailyCapReached.selector, address(t)));
        faucet.claim(address(t));
        vm.prank(carol);
        faucet.claimAll(); // skips what it cannot claim, never reverts
        assertEq(t.balanceOf(carol), 0);
        vm.warp(11 days);
        vm.prank(alice);
        faucet.claim(address(t));
        assertEq(t.balanceOf(alice), 20e8);
        vm.expectRevert(abi.encodeWithSelector(B20StockFaucet.NotListed.selector, address(0xbeef)));
        faucet.claim(address(0xbeef));
        assertEq(faucet.tokenCount(), 1);
        faucet.setDrip(address(t), 5e8, 1 hours, 0);
        assertEq(faucet.tokenCount(), 1, "relisting does not duplicate");
    }

    function test_multiplierFeedAnswersLikeAChainlinkFeed() public {
        assertEq(feed.decimals(), 18);
        vm.warp(1_900_000_000);
        (uint80 id, int256 answer,, uint256 updatedAt, uint80 answered) = feed.latestRoundData();
        assertEq(id, 1);
        assertEq(answered, 1);
        assertEq(answer, 1e18);
        assertEq(updatedAt, 1_900_000_000, "live state: always current");
        t.setMultiplier(1.25e18);
        (, answer,,,) = feed.latestRoundData();
        assertEq(answer, 1.25e18);
        assertEq(feed.latestAnswer(), 1.25e18);
        // The keeper's conversion (packages/core feedToFixed): 18 decimals -> the engine's 10.
        assertEq(uint256(answer) / 1e8, 1.25e10);
    }
}

/// The engine with a B20 stock: TSLAc as collateral and as the delivered token of a Base note on TSLA
/// (scripts/fixtures.ts: the last two runs). The engine itself is unchanged: a deposit pulls the token after the step
/// (interactions last) so a refused transfer reverts the whole step and changes nothing; payouts move only the
/// ledger; a pushed transfer that fails is deferred, never reverting the batch; a withdraw that fails reverts and
/// leaves the balance claimable. These tests check each path with a paused token, a blocked holder and a blocked
/// escrow, and that delivery pays shares / multiplier.
contract BaseStocksEngineTest is ProductsBase {
    B20StandIn tsla;
    uint8 constant D = 2; // d_TSLA: the delivered TSLAc
    uint8 constant COL = 3; // col_TSLAc: the TSLAc collateral
    uint8 constant TSLAC = 5; // the fixtures' token id for TSLAc

    function setUp() public override {
        super.setUp();
        tsla = new B20StandIn(
            "Tesla (notes.markets test stand-in for Coinbase TSLAc)",
            "TSLAc",
            8,
            1.25e18,
            0xb2000000000000000000001e800a7f5189430cD0,
            address(this)
        );
        // The fixtures mint through MockERC20.mint(address,uint256): the stand-in has the same function, gated to
        // its minters and owner (this contract).
        tokens[TSLAC] = MockERC20(address(tsla));
    }

    function _deliveryRun() internal view returns (uint256) {
        return fixtures.length - 2;
    }

    function _defaultRun() internal view returns (uint256) {
        return fixtures.length - 1;
    }

    function _issuerOf(uint256 idx) internal returns (address issuer) {
        issuer = makeAddr(string.concat("issuer", vm.toString(idx)));
        tsla.setMinter(issuer, true); // _issue mints the pledge while acting as the issuer
    }

    function _start(uint256 idx)
        internal
        returns (Fixture memory f, uint256 pid, address issuer, address[] memory holders)
    {
        f = _fixture(idx);
        assertEq(f.tokenOf[D], TSLAC, "d_TSLA is TSLAc");
        assertEq(f.tokenOf[COL], TSLAC, "col_TSLAc is TSLAc");
        issuer = _issuerOf(idx);
        pid = _issue(f, issuer, makeAddr(string.concat("pa", vm.toString(idx))));
        holders = _holders(f, idx);
        for (uint256 k = 0; k < f.investorUnits.length; k++) {
            _subscribe(f, pid, holders[k], f.investorUnits[k], f.investorCash[k]);
        }
    }

    /// The action that funds the TSLAc delivery.
    function _deliveryFunding(Fixture memory f) internal pure returns (uint256 j) {
        for (j = 0; j < f.actions.length; j++) {
            if (f.actions[j].kind == 3 && f.actions[j].token == TSLAC) return j;
        }
        revert("no delivery funding");
    }

    function test_b20NotesPayTheirReferencePayoff() public {
        assertEq(_fixture(_deliveryRun()).defaulted, false);
        assertEq(_fixture(_defaultRun()).defaulted, true);
        _issuerOf(_deliveryRun());
        _issuerOf(_defaultRun());
        _runFixture(_deliveryRun());
        _runFixture(_defaultRun());
    }

    function test_b20NotesPayTheirReferencePayoffPushed() public {
        pushAll = true;
        _issuerOf(_deliveryRun());
        _issuerOf(_defaultRun());
        _runFixture(_deliveryRun());
        _runFixture(_defaultRun());
    }

    /// Knocked in at maturity: each holder gets units / strike / multiplier TSLAc (700 / 250 / 1.25 = 2.24).
    function test_deliversSharesDividedByTheMultiplier() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        _play(f, pid, issuer, holders, 0, type(uint256).max);
        assertEq(engine.processOf(pid).status, engine.COMPLETED());
        assertEq(engine.balanceOf(pid, holders[0], D), 2.24e10, "700 units: 2.8 shares = 2.24 TSLAc");
        assertEq(engine.balanceOf(pid, holders[1], D), 0.96e10, "300 units: 1.2 shares = 0.96 TSLAc");
        vm.prank(holders[0]);
        engine.withdraw(pid, D, 2.24e8);
        assertEq(tsla.balanceOf(holders[0]), 2.24e8);
        assertEq(tsla.scaledBalanceOf(holders[0]), 2.8e8, "worth 2.8 shares");
    }

    /// A multiplier that does not divide evenly (NVDAc's, 2026-11-15), read through B20MultiplierFeed and converted as
    /// the keeper does: each holder receives at most the exact amount and less by under 2e-10 token per unit of face
    /// (the engine truncates both divisions; funding and delivery use the same expression, so escrow always covers it).
    function test_deliveryRoundsDownByLessThanTwoTenBillionthsPerUnit() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        tsla.setMultiplier(1.000537939576369481e18);
        B20MultiplierFeed feed = new B20MultiplierFeed(IB20(address(tsla)), "TSLAc multiplier");
        (, int256 answer,,,) = feed.latestRoundData();
        int256 mult = answer / 1e8; // feedToFixed: 18 -> 10 decimals
        assertEq(mult, 10_005_379_395);
        // The issuer funds enough for the new multiplier (1000 / 250 / 1.0005... = 3.9978... TSLAc): 4 TSLAc.
        uint256 j = _deliveryFunding(f);
        f.actions[j].base = 4e8;
        f.actions[j].inputs = _num(4e10);
        // The final observation's report ends with the token's multiplier, then Robinhood's (instantiate.ts: obs,
        // prices, each delivery's multiplier and its reference). Robinhood's stays 1 here.
        uint256 last;
        for (uint256 i = 0; i < f.actions.length; i++) if (f.actions[i].kind == 1) last = i;
        f.actions[last].values[f.actions[last].values.length - 2] = mult;
        assertEq(f.actions[last].values[f.actions[last].values.length - 1], 1e10, "Robinhood's multiplier, 1");
        _play(f, pid, issuer, holders, 0, type(uint256).max);
        assertEq(engine.processOf(pid).status, engine.COMPLETED(), "delivered and closed");
        for (uint256 k = 0; k < holders.length; k++) {
            uint256 units = uint256(f.investorUnits[k] / SCALE);
            // Exact tokens, 1e18-scaled: units / 250 / 1.0005379395.
            uint256 exact = units * 1e28 / (250 * uint256(mult));
            uint256 got = uint256(engine.balanceOf(pid, holders[k], D)) * 1e8;
            assertLe(got, exact, "never more than owed");
            assertLe(exact - got, units * 2e8 + 1e8, "short by under 2e-10 token per unit (+1e-10 of the payout floor)");
        }
        // What was funded above the delivery went back to the issuer with the release.
        assertGt(engine.balanceOf(pid, issuer, D), 0);
    }

    /// A paused token at the delivery deadline: the issuer's funding step reverts as a whole (nothing credited, nothing
    /// pulled); once the token is unpaused the same step goes through and the note delivers and closes.
    function test_pausedTokenRevertsTheFundingStepWholeThenItGoesThrough() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        uint256 j = _deliveryFunding(f);
        _play(f, pid, issuer, holders, 0, j);
        Action memory a = f.actions[j];
        vm.warp(a.at);
        tsla.mint(issuer, a.base);
        tsla.setPaused(true);
        address escrow = engine.ESCROW();
        uint256 stepsBefore = engine.processOf(pid).stepsRun;
        vm.prank(issuer);
        vm.expectRevert(B20StandIn.TokenPaused.selector);
        engine.executeStep(pid, a.step, NO, a.inputs);
        assertEq(engine.balanceOf(pid, escrow, D), 0, "nothing credited");
        assertEq(engine.vaultOf(pid, D), 0, "nothing pulled");
        assertEq(engine.processOf(pid).stepsRun, stepsBefore, "the note did not move");
        tsla.setPaused(false);
        vm.prank(issuer);
        engine.executeStep(pid, a.step, NO, a.inputs);
        _play(f, pid, issuer, holders, j + 1, type(uint256).max);
        assertEq(engine.processOf(pid).status, engine.COMPLETED());
        for (uint256 k = 0; k < holders.length; k++) _checkHolder(f, pid, holders[k], k, uint256(TOLERANCE));
    }

    /// Paused from the strike to the end: the coupon is missed, the grace period ends, and the default still runs (it
    /// moves only the ledger): the TSLAc collateral is the holders'. Pushes defer, withdrawals revert and leave it
    /// claimable; after the unpause every holder withdraws exactly their share.
    function test_pausedTokenNeverBricksADefault() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_defaultRun());
        _play(f, pid, issuer, holders, 0, 1); // the strike
        tsla.setPaused(true);
        _play(f, pid, issuer, holders, 1, type(uint256).max);
        assertEq(engine.processOf(pid).status, engine.COMPLETED(), "defaulted and closed while paused");
        int256 owed = engine.balanceOf(pid, holders[0], COL);
        assertGt(owed, 0, "the collateral is the holders'");
        vm.recordLogs();
        vm.prank(keeper);
        engine.pushTo(pid, COL, holders);
        Vm.Log[] memory logs = vm.getRecordedLogs();
        uint256 deferred;
        for (uint256 i = 0; i < logs.length; i++) {
            if (logs[i].topics[0] == FlowEngine.PayoutDeferred.selector) deferred++;
        }
        assertEq(deferred, holders.length, "every push deferred, none reverted");
        assertEq(engine.balanceOf(pid, holders[0], COL), owed, "still claimable");
        uint256 base = uint256(owed) / 100; // 10 -> 8 decimals
        vm.prank(holders[0]);
        vm.expectRevert(B20StandIn.TokenPaused.selector);
        engine.withdraw(pid, COL, base);
        assertEq(engine.balanceOf(pid, holders[0], COL), owed, "a failed withdraw leaves it all");
        tsla.setPaused(false);
        for (uint256 k = 0; k < holders.length; k++) _checkHolder(f, pid, holders[k], k, uint256(TOLERANCE));
    }

    /// A holder the token's policy blocks: the push to them defers (the other holder is paid in the same batch), their
    /// withdrawal reverts, and their TSLAc waits in the note until the block is lifted.
    function test_blockedHolderIsDeferredWhileOthersArePaid() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        _play(f, pid, issuer, holders, 0, type(uint256).max);
        tsla.setBlocked(holders[0], true);
        vm.prank(keeper);
        engine.pushPayouts(pid, D, type(uint256).max, type(uint256).max);
        assertEq(tsla.balanceOf(holders[0]), 0, "blocked: nothing sent");
        assertEq(tsla.balanceOf(holders[1]), 0.96e8, "the other holder is paid");
        assertEq(engine.balanceOf(pid, holders[0], D), 2.24e10, "kept for the blocked holder");
        vm.prank(holders[0]);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.PolicyForbids.selector, uint64(1), holders[0]));
        engine.withdraw(pid, D, 2.24e8);
        tsla.setBlocked(holders[0], false);
        vm.prank(holders[0]);
        engine.withdraw(pid, D, 2.24e8);
        assertEq(tsla.balanceOf(holders[0]), 2.24e8);
    }

    /// The token's policy blocks the engine (the escrow): the issuer's pledge at Approve Terms reverts as a whole and
    /// the note stays where it was; lifted, the same step pledges.
    function test_blockedEscrowRefusesThePledgeAtomically() public {
        Fixture memory f = _fixture(_deliveryRun());
        address issuer = _issuerOf(_deliveryRun());
        address pa = makeAddr("pa");
        vm.warp(t0);
        bytes32 id = engine.registerDefinition(f.def);
        vm.prank(issuer);
        uint256 pid = engine.startProcess(id, 1, _roles(issuer, pa), _assetTokens(f), f.startStep, _none(), "Note", "NOTE");
        vm.startPrank(issuer);
        for (uint256 k = 0; k < f.pledges.length; k++) tokens[f.pledges[k].token].mint(issuer, f.pledges[k].base);
        tsla.approve(address(engine), type(uint256).max);
        vm.stopPrank();
        tsla.setBlocked(address(engine), true);
        uint256 stepsBefore = engine.processOf(pid).stepsRun;
        vm.prank(issuer);
        vm.expectRevert(abi.encodeWithSelector(B20StandIn.PolicyForbids.selector, uint64(1), address(engine)));
        engine.executeStep(pid, f.approveStep, NO, f.approveInputs);
        assertEq(engine.processOf(pid).stepsRun, stepsBefore);
        assertEq(engine.vaultOf(pid, COL), 0);
        tsla.setBlocked(address(engine), false);
        vm.prank(issuer);
        engine.executeStep(pid, f.approveStep, NO, f.approveInputs);
        assertEq(engine.vaultOf(pid, COL), f.pledges[0].base, "pledged");
    }
}
