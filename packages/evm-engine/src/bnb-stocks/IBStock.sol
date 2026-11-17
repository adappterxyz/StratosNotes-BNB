// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

/// The reads Binance's bStocks expose (checked on BNB Chain mainnet 2026-11-17 against the shared implementation
/// 0xCFEd6c4679297ea4889F8183bC057B4A86C64e46): the multiplier in effect, and balances in share terms. Raw `balanceOf`
/// never rebases; share amount = raw x uiMultiplier / 1e18.
interface IBStock {
    function uiMultiplier() external view returns (uint256);
    function balanceOfUI(address account) external view returns (uint256);
    function toUIAmount(uint256 raw) external view returns (uint256);
    function fromUIAmount(uint256 ui) external view returns (uint256);
}
