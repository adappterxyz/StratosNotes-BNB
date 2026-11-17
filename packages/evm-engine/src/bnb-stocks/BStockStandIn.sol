// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IBStock} from "./IBStock.sol";

/// @title BStockStandIn - a notes.markets TEST STAND-IN for one of Binance's bStocks, on BNB Chain testnet
/// @notice Binance's bStocks (TSLAB, NVDAB, ...) exist on BNB Chain MAINNET only. This contract imitates one of them on
///         BNB Chain testnet so notes can pledge and deliver "the stock on BNB Chain" before mainnet: same symbol, the
///         same decimals (18), the same reads (uiMultiplier, balanceOfUI, toUIAmount, ...) and the same multiplier as
///         the real token (kept in step by the owner: scripts/bnb-stocks.ts sync prints the call, docs/BNB-CHAIN.md).
///         It has NO value and is NOT issued, backed or endorsed by Binance; anyone can get some from the faucet.
///         Never deploy to a mainnet: there, notes use the real tokens (a change of addresses).
///
///         What it imitates (so the engine is tested against bStocks behaviour, not a plain ERC-20):
///          - multiplier: raw balances never change on a corporate action; `uiMultiplier` (WAD) moves instead. A new
///            multiplier is scheduled (setUIMultiplier(value, effectiveAt)) and takes effect at its time, as on the
///            real token (pendingMultiplier / effectiveAt / hasPendingMultiplier).
///          - blocklist: an address the owner blocks can neither send nor receive (BlockedAddress), as the real
///            token's compliance contract; `approve` is never gated.
///          - pause: while paused every balance change reverts (TokenPaused). The real token asks a shared pause
///            manager; the stand-in keeps the flag itself (isTokenPaused reads it).
contract BStockStandIn is ERC20, Ownable2Step, IBStock {
    /// The multiplier's scale: 1e18 = one share per token.
    uint256 public constant WAD_PRECISION = 1e18;
    /// Marks the contract as a notes.markets stand-in (tools and the app may check it).
    bool public constant STAND_IN = true;
    /// Highest multiplier the owner may set (a 1000:1 split): a typo cannot make a token worth a million shares.
    uint256 public constant MAX_MULTIPLIER = 1000e18;

    /// The real token this stands in for, on BNB Chain mainnet (reference only: never called).
    address public immutable realToken;

    uint256 private _multiplier;
    uint256 private _pending;
    uint256 private _effectiveAt;
    bool public paused;
    /// Accounts blocked by the compliance check.
    mapping(address => bool) public blocked;
    /// Accounts allowed to mint (the faucet).
    mapping(address => bool) public minter;

    event UIMultiplierScheduled(uint256 current, uint256 next, uint256 effectiveAt);
    event PausedSet(bool paused);
    event BlockedSet(address indexed account, bool blocked);
    event MinterSet(address indexed account, bool allowed);

    error TokenPaused();
    error BlockedAddress(address account);
    error NotMinter(address caller);
    error BadMultiplier(uint256 multiplier);

    constructor(string memory name_, string memory symbol_, uint256 multiplier_, address realToken_, address owner_)
        ERC20(name_, symbol_)
        Ownable(owner_)
    {
        realToken = realToken_;
        if (multiplier_ == 0 || multiplier_ > MAX_MULTIPLIER) revert BadMultiplier(multiplier_);
        _multiplier = multiplier_;
    }

    // ---- bStocks reads -----------------------------------------------------------------------------------------

    /// The multiplier in effect now (a scheduled one once its time has come).
    function uiMultiplier() public view returns (uint256) {
        return _pending != 0 && block.timestamp >= _effectiveAt ? _pending : _multiplier;
    }

    function hasPendingMultiplier() public view returns (bool) {
        return _pending != 0 && block.timestamp < _effectiveAt;
    }

    function pendingMultiplier() external view returns (uint256) {
        return hasPendingMultiplier() ? _pending : 0;
    }

    function newUIMultiplier() external view returns (uint256) {
        return _pending != 0 ? _pending : _multiplier;
    }

    function effectiveAt() external view returns (uint256) {
        return _pending != 0 ? _effectiveAt : 0;
    }

    function balanceOfUI(address account) external view returns (uint256) {
        return Math.mulDiv(balanceOf(account), uiMultiplier(), WAD_PRECISION);
    }

    function totalSupplyUI() external view returns (uint256) {
        return Math.mulDiv(totalSupply(), uiMultiplier(), WAD_PRECISION);
    }

    function toUIAmount(uint256 raw) external view returns (uint256) {
        return Math.mulDiv(raw, uiMultiplier(), WAD_PRECISION);
    }

    function fromUIAmount(uint256 ui) external view returns (uint256) {
        return Math.mulDiv(ui, WAD_PRECISION, uiMultiplier());
    }

    /// The pause, read the way the real token's pause manager answers it.
    function isTokenPaused(address token) external view returns (bool) {
        return token == address(this) && paused;
    }

    // ---- Owner: corporate actions, pause, blocklist, minters ---------------------------------------------------

    /// A corporate action (dividend, split): balances stay, the multiplier moves at `when` (now or later). The owner
    /// mirrors the real token's multiplier (scripts/bnb-stocks.ts sync).
    function setUIMultiplier(uint256 next, uint256 when) external onlyOwner {
        if (next == 0 || next > MAX_MULTIPLIER) revert BadMultiplier(next);
        uint256 current = uiMultiplier();
        _multiplier = current;
        if (when <= block.timestamp) {
            _multiplier = next;
            _pending = 0;
            _effectiveAt = 0;
        } else {
            _pending = next;
            _effectiveAt = when;
        }
        emit UIMultiplierScheduled(current, next, when <= block.timestamp ? block.timestamp : when);
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

    /// Every balance change passes the pause and the blocklist, as on a bStock.
    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (from != address(0) && blocked[from]) revert BlockedAddress(from);
        if (to != address(0) && blocked[to]) revert BlockedAddress(to);
        super._update(from, to, value);
    }
}
