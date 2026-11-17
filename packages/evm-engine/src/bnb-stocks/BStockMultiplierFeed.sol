// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IBStock} from "./IBStock.sol";

/// @title BStockMultiplierFeed - a bStock's multiplier as a Chainlink-style feed (AggregatorV3 reads)
/// @notice A bStock has no per-token price feed: a note values it as its share's price x this multiplier (both read
///         into oracle fields, pxs_<key> x pxm_<key>), and delivers shares / multiplier token units for a physically
///         settled share underlying (mult_<ticker> at the final observation; packages/core instantiate.ts). The keeper
///         (Chainlink CRE, or the fallback keeper) fills oracle fields from AggregatorV3 reads, so this adapter lets it
///         read `uiMultiplier()` the same way, with no keeper change.
///
///         answer = uiMultiplier() (18 decimals: 1e18 = one share per token), the multiplier IN EFFECT (a scheduled
///         change counts from its effective time). Live state, not a pushed round: every read is round 1, updated
///         "now". Works for the real bStocks on BNB Chain mainnet and for notes.markets' testnet stand-ins alike: deploy
///         one per token, next to it. Stateless and ownerless.
contract BStockMultiplierFeed {
    IBStock public immutable token;
    string public description;

    error MultiplierOutOfRange(uint256 multiplier);

    constructor(IBStock token_, string memory description_) {
        token = token_;
        description = description_;
    }

    function decimals() external pure returns (uint8) {
        return 18;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function latestRoundData()
        public
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        uint256 m = token.uiMultiplier();
        if (m == 0 || m > uint256(type(int256).max)) revert MultiplierOutOfRange(m);
        // forge-lint: disable-next-line(unsafe-typecast) bounded above
        return (1, int256(m), block.timestamp, block.timestamp, 1);
    }

    /// Only round 1 exists (the live multiplier).
    function getRoundData(uint80)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return latestRoundData();
    }

    function latestAnswer() external view returns (int256 answer) {
        (, answer,,,) = latestRoundData();
    }
}
