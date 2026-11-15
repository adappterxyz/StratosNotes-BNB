// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {B20StandIn} from "./B20StandIn.sol";

/// @title B20StockFaucet - public, rate-limited mint of notes.markets' B20 STAND-IN stock tokens (Base Sepolia)
/// @notice Anyone can claim a fixed amount of each listed stand-in (TSLAc, NVDAc, ...: test tokens with no value, not
///         Coinbase's), at most once per `cooldown` per account and token, and at most `dailyCap` of each token across
///         everyone per UTC day, so one script cannot print an unbounded supply. The caller pays the gas; the faucet
///         holds nothing (it is a minter of each stand-in). Never deploy to a mainnet.
contract B20StockFaucet is Ownable2Step {
    struct Drip {
        uint128 amount; // base units per claim; 0 = not listed
        uint64 cooldown; // seconds between claims by one account
        uint128 dailyCap; // base units claimable by everyone per UTC day (0 = no cap)
    }

    /// What the faucet hands out: say so wherever it is shown.
    string public constant NOTICE = "notes.markets test stand-ins for Coinbase B20 stock tokens: no value, Base Sepolia only";

    mapping(address => Drip) public drips;
    mapping(address => mapping(address => uint256)) public lastClaim; // token => account => timestamp
    mapping(address => mapping(uint256 => uint256)) public claimedOnDay; // token => day => base units
    address[] public tokens;

    event DripSet(address indexed token, uint256 amount, uint64 cooldown, uint256 dailyCap);
    event Claimed(address indexed token, address indexed to, uint256 amount);

    error NotListed(address token);
    error TooSoon(address token, uint256 nextAt);
    error DailyCapReached(address token);

    constructor(address owner_) Ownable(owner_) {}

    function setDrip(address token, uint128 amount, uint64 cooldown, uint128 dailyCap) external onlyOwner {
        if (drips[token].amount == 0 && amount != 0) {
            bool listed;
            for (uint256 i = 0; i < tokens.length; i++) if (tokens[i] == token) listed = true;
            if (!listed) tokens.push(token);
        }
        drips[token] = Drip(amount, cooldown, dailyCap);
        emit DripSet(token, amount, cooldown, dailyCap);
    }

    function tokenCount() external view returns (uint256) {
        return tokens.length;
    }

    /// When `account` may next claim `token` (0: now).
    function nextClaimAt(address token, address account) public view returns (uint256) {
        uint256 last = lastClaim[token][account];
        if (last == 0) return 0;
        uint256 at = last + drips[token].cooldown;
        return at > block.timestamp ? at : 0;
    }

    /// Claim one drip of `token`.
    function claim(address token) public {
        Drip memory d = drips[token];
        if (d.amount == 0) revert NotListed(token);
        uint256 next = nextClaimAt(token, msg.sender);
        if (next != 0) revert TooSoon(token, next);
        uint256 day = block.timestamp / 1 days;
        uint256 today = claimedOnDay[token][day] + d.amount;
        if (d.dailyCap != 0 && today > d.dailyCap) revert DailyCapReached(token);
        claimedOnDay[token][day] = today;
        lastClaim[token][msg.sender] = block.timestamp;
        B20StandIn(token).mint(msg.sender, d.amount);
        emit Claimed(token, msg.sender, d.amount);
    }

    /// Claim every listed token that is claimable now (skips the ones still cooling down or capped).
    function claimAll() external {
        uint256 day = block.timestamp / 1 days;
        for (uint256 i = 0; i < tokens.length; i++) {
            address t = tokens[i];
            Drip memory d = drips[t];
            if (d.amount == 0 || nextClaimAt(t, msg.sender) != 0) continue;
            if (d.dailyCap != 0 && claimedOnDay[t][day] + d.amount > d.dailyCap) continue;
            claim(t);
        }
    }
}
