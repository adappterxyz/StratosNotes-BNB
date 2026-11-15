// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

/// @title IB20 - the parts of Coinbase's B20 token standard notes.markets reads
/// @notice B20 (Coinbase's tokenized US stocks on Base mainnet, docs.base.org/base-chain/asset-issuance/
///         tokenized-stocks-on-base) extends ERC-20. Balances never change on a corporate action (split, dividend
///         reinvestment): a WAD-scaled (1e18) multiplier does instead, and one token redeems for `multiplier / 1e18`
///         shares. ERC-8056 names the same reads `uiMultiplier()` and `balanceOfUI()`. Transfers can be blocked by a
///         policy (a blocked transfer reverts; `approve` is never policy-gated) and functions can be paused.
///         Both the real tokens and notes.markets' Base Sepolia stand-ins (B20StandIn) answer these.
interface IB20 {
    /// One token = multiplier / 1e18 shares (WAD).
    function multiplier() external view returns (uint256);
    /// ERC-8056 alias of multiplier().
    function uiMultiplier() external view returns (uint256);
    /// 1e18.
    function WAD_PRECISION() external view returns (uint256);
    /// balanceOf(account) x multiplier / 1e18: the holding in shares.
    function scaledBalanceOf(address account) external view returns (uint256);
    /// ERC-8056 alias of scaledBalanceOf().
    function balanceOfUI(address account) external view returns (uint256);
    /// raw token units -> shares.
    function toUIAmount(uint256 raw) external view returns (uint256);
    /// shares -> raw token units.
    function fromUIAmount(uint256 ui) external view returns (uint256);
    /// Whether `account` passes policy `policyId` (never reverts).
    function isAuthorized(uint64 policyId, address account) external view returns (bool);
    function policyExists(uint64 policyId) external view returns (bool);
}
