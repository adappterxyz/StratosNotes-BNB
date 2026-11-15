// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {IB20} from "./IB20.sol";

/// @title B20MultiplierFeed - a B20 token's multiplier as a Chainlink-style feed (AggregatorV3 reads)
/// @notice Physical delivery of a B20 stock owes SHARES (units / strike); the token pays shares / multiplier token
///         units. The keeper (Chainlink CRE, or the fallback keeper) fills a note's oracle fields from AggregatorV3
///         reads, so this adapter lets it read `multiplier()` the same way, with no keeper change: the note captures
///         `mult_<ticker>` at its final observation and divides the shares owed by it (packages/core instantiate.ts).
///
///         answer = multiplier() (18 decimals: 1e18 = one share per token). The multiplier is live state, not a
///         pushed round, so every read is round 1 and updated "now" (the block's timestamp). Works for the real
///         Coinbase tokens on Base mainnet and for notes.markets' Base Sepolia stand-ins alike: deploy one per token,
///         next to it. Stateless and ownerless: nothing to administer.
contract B20MultiplierFeed {
    IB20 public immutable token;
    string public description;

    error MultiplierOutOfRange(uint256 multiplier);

    constructor(IB20 token_, string memory description_) {
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
        uint256 m = token.multiplier();
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
