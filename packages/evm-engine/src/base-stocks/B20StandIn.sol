// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IB20} from "./IB20.sol";

/// @title B20StandIn - a notes.markets TEST STAND-IN for one of Coinbase's B20 stock tokens, on Base Sepolia
/// @notice Coinbase's tokenized stocks (TSLAc, NVDAc, ...) exist on Base MAINNET only. This contract imitates one of
///         them on Base Sepolia so notes can pledge and deliver "the stock on Base" before mainnet: same symbol,
///         same decimals (8), the same B20 / ERC-8056 reads, and the same multiplier as the real token (kept in step
///         by the owner: scripts/base-stocks.ts sync prints the call, docs/BASE-STOCKS.md). It has NO value and is
///         NOT issued, backed or endorsed by Coinbase; anyone can get some from B20StockFaucet. Never deploy to a
///         mainnet: there, notes use the real tokens (a change of addresses, docs/BASE-STOCKS.md).
///
///         What it imitates (so the engine is tested against B20 behaviour, not a plain ERC-20):
///          - multiplier: balances never change on a corporate action; the owner moves `multiplier` (WAD) instead.
///          - policy: an address the owner blocks can neither send nor receive (the transfer reverts with
///            PolicyForbids, as a B20 policy check does); `approve` is never gated. One policy, id 1.
///          - pause: while paused every balance change (transfer, transferFrom, mint) reverts with TokenPaused.
contract B20StandIn is ERC20, Ownable2Step, IB20 {
    /// The multiplier's scale: 1e18 = one share per token.
    uint256 public constant WAD_PRECISION = 1e18;
    /// Marks the contract as a notes.markets stand-in (tools and the app may check it).
    bool public constant STAND_IN = true;
    /// The only transfer policy this stand-in has.
    uint64 public constant TRANSFER_POLICY_ID = 1;
    /// Highest multiplier the owner may set (a 1000:1 split): a typo cannot make a token worth a million shares.
    uint256 public constant MAX_MULTIPLIER = 1000e18;

    uint8 private immutable _decimals;
    /// The real token this stands in for, on Base mainnet (reference only: never called).
    address public immutable realToken;

    /// One token = multiplier / 1e18 shares.
    uint256 public multiplier;
    bool public paused;
    /// Accounts blocked by the transfer policy.
    mapping(address => bool) public blocked;
    /// Accounts allowed to mint (the faucet).
    mapping(address => bool) public minter;

    event MultiplierUpdated(uint256 previous, uint256 next);
    event PausedSet(bool paused);
    event BlockedSet(address indexed account, bool blocked);
    event MinterSet(address indexed account, bool allowed);

    error TokenPaused();
    error PolicyForbids(uint64 policyId, address account);
    error NotMinter(address caller);
    error BadMultiplier(uint256 multiplier);

    constructor(
        string memory name_,
        string memory symbol_,
        uint8 decimals_,
        uint256 multiplier_,
        address realToken_,
        address owner_
    ) ERC20(name_, symbol_) Ownable(owner_) {
        _decimals = decimals_;
        realToken = realToken_;
        _setMultiplier(multiplier_);
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    // ---- B20 / ERC-8056 reads ----------------------------------------------------------------------------------

    function uiMultiplier() external view returns (uint256) {
        return multiplier;
    }

    function scaledBalanceOf(address account) public view returns (uint256) {
        return Math.mulDiv(balanceOf(account), multiplier, WAD_PRECISION);
    }

    function balanceOfUI(address account) external view returns (uint256) {
        return scaledBalanceOf(account);
    }

    function totalSupplyUI() external view returns (uint256) {
        return Math.mulDiv(totalSupply(), multiplier, WAD_PRECISION);
    }

    function toUIAmount(uint256 raw) external view returns (uint256) {
        return Math.mulDiv(raw, multiplier, WAD_PRECISION);
    }

    function fromUIAmount(uint256 ui) external view returns (uint256) {
        return Math.mulDiv(ui, WAD_PRECISION, multiplier);
    }

    function isAuthorized(uint64 policyId, address account) external view returns (bool) {
        return policyId == TRANSFER_POLICY_ID && !blocked[account];
    }

    function policyExists(uint64 policyId) external pure returns (bool) {
        return policyId == TRANSFER_POLICY_ID;
    }

    // ---- Owner: corporate actions, pause, policy, minters ------------------------------------------------------

    /// A corporate action (split, dividend reinvestment): balances stay, the multiplier moves. The owner mirrors
    /// the real token's multiplier (scripts/base-stocks.ts sync).
    function setMultiplier(uint256 next) external onlyOwner {
        _setMultiplier(next);
    }

    function _setMultiplier(uint256 next) private {
        if (next == 0 || next > MAX_MULTIPLIER) revert BadMultiplier(next);
        emit MultiplierUpdated(multiplier, next);
        multiplier = next;
    }

    function setPaused(bool paused_) external onlyOwner {
        paused = paused_;
        emit PausedSet(paused_);
    }

    function setBlocked(address account, bool blocked_) external onlyOwner {
        blocked[account] = blocked_;
        emit BlockedSet(account, blocked_);
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minter[account] = allowed;
        emit MinterSet(account, allowed);
    }

    /// Mint (the faucet, or the owner for demo setup).
    function mint(address to, uint256 amount) external {
        if (!minter[msg.sender] && msg.sender != owner()) revert NotMinter(msg.sender);
        _mint(to, amount);
    }

    /// Every balance change passes the pause and the policy, as on a B20.
    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (from != address(0) && blocked[from]) revert PolicyForbids(TRANSFER_POLICY_ID, from);
        if (to != address(0) && blocked[to]) revert PolicyForbids(TRANSFER_POLICY_ID, to);
        super._update(from, to, value);
    }
}
