// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Test, Vm} from "forge-std/Test.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {FlowEngine} from "../src/FlowEngine.sol";
import {BStockStandIn} from "../src/bnb-stocks/BStockStandIn.sol";
import {BStockMultiplierFeed} from "../src/bnb-stocks/BStockMultiplierFeed.sol";
import {BnbTestFaucet} from "../src/bnb-stocks/BnbTestFaucet.sol";
import {TestDollar} from "../src/bnb-stocks/TestDollar.sol";
import {IBStock} from "../src/bnb-stocks/IBStock.sol";
import {ProductsBase} from "./Products.t.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// notes.markets' bStock stand-in (a test imitation of Binance's tokenized stocks, docs/BNB-CHAIN.md), its multiplier
/// feed, the nmUSD test dollar and the BNB testnet faucet, on their own.
contract BStockStandInTest is Test {
    BStockStandIn t;
    TestDollar usd;
    BnbTestFaucet faucet;
    BStockMultiplierFeed feed;
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");
    address real = 0x5b1910eAaD6450E50f816082Aa078C41F10C292f; // TSLAB on BNB Chain mainnet (reference only)

    function setUp() public {
        vm.warp(1_900_000_000);
        t = new BStockStandIn("Tesla (notes.markets test stand-in for Binance TSLAB)", "TSLAB", 1e18, real, address(this));
        usd = new TestDollar(address(this));
        faucet = new BnbTestFaucet(address(this));
        feed = new BStockMultiplierFeed(IBStock(address(t)), "TSLAB multiplier");
        t.setMinter(address(faucet), true);
        usd.setMinter(address(faucet), true);
        faucet.setDrip(address(t), 10e18, 1 days, 25e18);
        faucet.setDrip(address(usd), 10_000e6, 1 days, 0);
    }

    function test_looksLikeTheRealToken() public view {
        assertEq(t.symbol(), "TSLAB");
        assertEq(t.decimals(), 18);
        assertEq(t.realToken(), real);
        assertTrue(t.STAND_IN());
        assertEq(t.uiMultiplier(), 1e18);
        assertFalse(t.hasPendingMultiplier());
        assertEq(t.pendingMultiplier(), 0);
        assertEq(t.effectiveAt(), 0);
        assertEq(usd.symbol(), "nmUSD");
        assertEq(usd.decimals(), 6);
        assertTrue(usd.TEST_TOKEN());
    }

    function test_corporateActionMovesTheMultiplierNotBalances() public {
        t.mint(alice, 10e18);
        t.setUIMultiplier(1.000778e18, block.timestamp); // NVDAB's on 2026-11-17: dividends
        assertEq(t.balanceOf(alice), 10e18, "balances never change");
        assertEq(t.balanceOfUI(alice), 10.00778e18);
        assertEq(t.totalSupplyUI(), 10.00778e18);
        assertEq(t.toUIAmount(1e18), 1.000778e18);
        assertEq(t.fromUIAmount(1.000778e18), 1e18);
    }

    function test_aScheduledMultiplierTakesEffectAtItsTime() public {
        t.mint(alice, 10e18);
        uint256 when = block.timestamp + 1 days;
        t.setUIMultiplier(2e18, when); // a 2:1 split, tomorrow
        assertEq(t.uiMultiplier(), 1e18, "not yet");
        assertTrue(t.hasPendingMultiplier());
        assertEq(t.pendingMultiplier(), 2e18);
        assertEq(t.newUIMultiplier(), 2e18);
        assertEq(t.effectiveAt(), when);
        (, int256 answer,,,) = feed.latestRoundData();
        assertEq(answer, 1e18, "the feed reads the multiplier in effect");
        vm.warp(when);
        assertEq(t.uiMultiplier(), 2e18, "in effect");
        assertFalse(t.hasPendingMultiplier());
        assertEq(t.balanceOfUI(alice), 20e18);
        (, answer,,,) = feed.latestRoundData();
        assertEq(answer, 2e18);
        // Scheduling another keeps the one now in effect until its own time.
        t.setUIMultiplier(1.5e18, when + 1 days);
        assertEq(t.uiMultiplier(), 2e18);
        vm.warp(when + 1 days);
        assertEq(t.uiMultiplier(), 1.5e18);
    }

    function test_onlyTheOwnerMovesTheMultiplierWithinBounds() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(Ownable.OwnableUnauthorizedAccount.selector, alice));
        t.setUIMultiplier(2e18, 0);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.BadMultiplier.selector, 0));
        t.setUIMultiplier(0, 0);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.BadMultiplier.selector, 1001e18));
        t.setUIMultiplier(1001e18, 0);
    }

    function test_pauseStopsEveryBalanceChangeButNotApprove() public {
        t.mint(alice, 10e18);
        t.setPaused(true);
        assertTrue(t.isTokenPaused(address(t)));
        vm.startPrank(alice);
        vm.expectRevert(BStockStandIn.TokenPaused.selector);
        t.transfer(bob, 1);
        t.approve(bob, 5e18);
        vm.stopPrank();
        vm.expectRevert(BStockStandIn.TokenPaused.selector);
        t.mint(alice, 1);
        t.setPaused(false);
        vm.prank(bob);
        t.transferFrom(alice, bob, 5e18);
        assertEq(t.balanceOf(bob), 5e18);
    }

    function test_blocklistStopsSendingAndReceiving() public {
        t.mint(alice, 10e18);
        t.setBlocked(bob, true);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.BlockedAddress.selector, bob));
        t.transfer(bob, 1);
        t.setBlocked(bob, false);
        vm.prank(alice);
        t.transfer(bob, 1e18);
        t.setBlocked(bob, true);
        vm.prank(bob);
        t.approve(alice, 1e18); // approve is not gated
        vm.prank(bob);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.BlockedAddress.selector, bob));
        t.transfer(alice, 1);
    }

    function test_onlyMintersMint() public {
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.NotMinter.selector, alice));
        t.mint(alice, 1);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(TestDollar.NotMinter.selector, alice));
        usd.mint(alice, 1);
    }

    function test_faucetHandsOutTheStandInsAndTheTestDollar() public {
        vm.prank(alice);
        faucet.claimAll();
        assertEq(t.balanceOf(alice), 10e18);
        assertEq(usd.balanceOf(alice), 10_000e6);
        assertEq(faucet.tokenCount(), 2);
        vm.prank(alice);
        vm.expectRevert(abi.encodeWithSelector(BnbTestFaucet.TooSoon.selector, address(t), block.timestamp + 1 days));
        faucet.claim(address(t));
        vm.prank(bob);
        faucet.claim(address(t));
        address carol = makeAddr("carol");
        vm.prank(carol);
        vm.expectRevert(abi.encodeWithSelector(BnbTestFaucet.DailyCapReached.selector, address(t)));
        faucet.claim(address(t));
        vm.prank(carol);
        faucet.claimAll(); // skips the capped stand-in, still gets the dollar
        assertEq(t.balanceOf(carol), 0);
        assertEq(usd.balanceOf(carol), 10_000e6);
    }

    function test_multiplierFeedAnswersLikeAChainlinkFeed() public {
        assertEq(feed.decimals(), 18);
        (uint80 id, int256 answer,, uint256 updatedAt, uint80 answered) = feed.latestRoundData();
        assertEq(id, 1);
        assertEq(answered, 1);
        assertEq(answer, 1e18);
        assertEq(updatedAt, block.timestamp, "live state: always current");
        t.setUIMultiplier(1.25e18, 0);
        assertEq(feed.latestAnswer(), 1.25e18);
        // The keeper's conversion (packages/core feedToFixed): 18 decimals -> the engine's 10.
        assertEq(uint256(feed.latestAnswer()) / 1e8, 1.25e10);
    }
}

/// The engine with a bStock: TSLAB as collateral (valued as the TSLA share's price x the multiplier, pxs_ x pxm_, both
/// in the reports; the engine multiplies them in a formula field) and as the delivered token of a BNB Chain note on
/// TSLA (scripts/fixtures.ts: the two bStock runs, just before the two B20 runs). Paused token, blocked holder and
/// blocked escrow behave as for a B20 (BaseStocks.t.sol): the engine is unchanged.
contract BnbStocksEngineTest is ProductsBase {
    BStockStandIn tslab;
    uint8 constant D = 2; // d_TSLA: the delivered TSLAB
    uint8 constant COL = 3; // col_TSLAB: the TSLAB collateral
    uint8 constant TSLAB = 6; // the fixtures' token id for TSLAB

    function setUp() public override {
        super.setUp();
        tslab = new BStockStandIn(
            "Tesla (notes.markets test stand-in for Binance TSLAB)",
            "TSLAB",
            1.25e18,
            0x5b1910eAaD6450E50f816082Aa078C41F10C292f,
            address(this)
        );
        tokens[TSLAB] = MockERC20(address(tslab));
    }

    function _deliveryRun() internal view returns (uint256) {
        return fixtures.length - 4;
    }

    function _defaultRun() internal view returns (uint256) {
        return fixtures.length - 3;
    }

    function _issuerOf(uint256 idx) internal returns (address issuer) {
        issuer = makeAddr(string.concat("issuer", vm.toString(idx)));
        tslab.setMinter(issuer, true); // _issue mints the pledge while acting as the issuer
    }

    function _start(uint256 idx)
        internal
        returns (Fixture memory f, uint256 pid, address issuer, address[] memory holders)
    {
        f = _fixture(idx);
        assertEq(f.tokenOf[D], TSLAB, "d_TSLA is TSLAB");
        assertEq(f.tokenOf[COL], TSLAB, "col_TSLAB is TSLAB");
        issuer = _issuerOf(idx);
        pid = _issue(f, issuer, makeAddr(string.concat("pa", vm.toString(idx))));
        holders = _holders(f, idx);
        for (uint256 k = 0; k < f.investorUnits.length; k++) {
            _subscribe(f, pid, holders[k], f.investorUnits[k], f.investorCash[k]);
        }
    }

    function test_bStockNotesPayTheirReferencePayoff() public {
        assertEq(_fixture(_deliveryRun()).defaulted, false);
        assertEq(_fixture(_defaultRun()).defaulted, true);
        _issuerOf(_deliveryRun());
        _issuerOf(_defaultRun());
        _runFixture(_deliveryRun());
        _runFixture(_defaultRun());
    }

    function test_bStockNotesPayTheirReferencePayoffPushed() public {
        pushAll = true;
        _issuerOf(_deliveryRun());
        _issuerOf(_defaultRun());
        _runFixture(_deliveryRun());
        _runFixture(_defaultRun());
    }

    /// Knocked in at maturity: each holder gets units / strike / multiplier TSLAB (700 / 250 / 1.25 = 2.24).
    function test_deliversSharesDividedByTheMultiplier() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        _play(f, pid, issuer, holders, 0, type(uint256).max);
        assertEq(engine.processOf(pid).status, engine.COMPLETED());
        assertEq(engine.balanceOf(pid, holders[0], D), 2.24e10, "700 units: 2.8 shares = 2.24 TSLAB");
        assertEq(engine.balanceOf(pid, holders[1], D), 0.96e10, "300 units: 1.2 shares = 0.96 TSLAB");
        vm.prank(holders[0]);
        engine.withdraw(pid, D, 2.24e18);
        assertEq(tslab.balanceOf(holders[0]), 2.24e18);
        assertEq(tslab.balanceOfUI(holders[0]), 2.8e18, "worth 2.8 shares");
    }

    /// (The collateral price px_TSLAB = pxs_TSLAB x pxm_TSLAB is checked by the default run above: the holders take
    /// the TSLAB collateral valued at px_TSLAB, capped at what they are owed, and must match the reference payoff.)

    /// Paused from the strike to the end: the default still runs (it moves only the ledger) and the TSLAB collateral
    /// is the holders'; after the unpause every holder withdraws exactly their share.
    function test_pausedTokenNeverBricksADefault() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_defaultRun());
        _play(f, pid, issuer, holders, 0, 1);
        tslab.setPaused(true);
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
        tslab.setPaused(false);
        for (uint256 k = 0; k < holders.length; k++) _checkHolder(f, pid, holders[k], k, uint256(TOLERANCE));
    }

    /// A blocked holder: the push to them defers (the other holder is paid), their withdrawal reverts, and their TSLAB
    /// waits in the note until the block is lifted.
    function test_blockedHolderIsDeferredWhileOthersArePaid() public {
        (Fixture memory f, uint256 pid, address issuer, address[] memory holders) = _start(_deliveryRun());
        _play(f, pid, issuer, holders, 0, type(uint256).max);
        tslab.setBlocked(holders[0], true);
        vm.prank(keeper);
        engine.pushPayouts(pid, D, type(uint256).max, type(uint256).max);
        assertEq(tslab.balanceOf(holders[0]), 0, "blocked: nothing sent");
        assertEq(tslab.balanceOf(holders[1]), 0.96e18, "the other holder is paid");
        vm.prank(holders[0]);
        vm.expectRevert(abi.encodeWithSelector(BStockStandIn.BlockedAddress.selector, holders[0]));
        engine.withdraw(pid, D, 2.24e18);
        tslab.setBlocked(holders[0], false);
        vm.prank(holders[0]);
        engine.withdraw(pid, D, 2.24e18);
        assertEq(tslab.balanceOf(holders[0]), 2.24e18);
    }
}
