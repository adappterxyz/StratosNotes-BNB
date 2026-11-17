// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {Ownable2Step, Ownable} from "@openzeppelin/contracts/access/Ownable2Step.sol";

/// @title TestDollar - nmUSD, notes.markets' test dollar on BNB Chain testnet
/// @notice BNB Chain testnet has no stablecoin with a public faucet (its USDT and USDC are 18-decimal tokens only their
///         owner mints, handed out on request), so BNB Chain notes settle in this: 6 decimals like USDC and USDG,
///         minted only by its minters (the rate-limited faucet) and the owner. It has NO value. Never deploy to a
///         mainnet: a live BNB Chain note would settle in a real stablecoin (a change of address).
contract TestDollar is ERC20, Ownable2Step {
    /// Marks the contract as a notes.markets test token.
    bool public constant TEST_TOKEN = true;
    /// Accounts allowed to mint (the faucet).
    mapping(address => bool) public minter;

    event MinterSet(address indexed account, bool allowed);

    error NotMinter(address caller);

    constructor(address owner_) ERC20("notes.markets test dollar (no value)", "nmUSD") Ownable(owner_) {}

    function decimals() public pure override returns (uint8) {
        return 6;
    }

    function setMinter(address account, bool allowed) external onlyOwner {
        minter[account] = allowed;
        emit MinterSet(account, allowed);
    }

    function mint(address to, uint256 amount) external {
        if (!minter[msg.sender] && msg.sender != owner()) revert NotMinter(msg.sender);
        _mint(to, amount);
    }
}
