// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {B20StandIn} from "../src/base-stocks/B20StandIn.sol";
import {B20StockFaucet} from "../src/base-stocks/B20StockFaucet.sol";
import {B20MultiplierFeed} from "../src/base-stocks/B20MultiplierFeed.sol";
import {IB20} from "../src/base-stocks/IB20.sol";

/// notes.markets' TEST STAND-INS for Coinbase's B20 stock tokens, on Base Sepolia (docs/BASE-STOCKS.md): one
/// B20StandIn per token (same symbol and decimals as the real one, its multiplier read from Base mainnet at deploy
/// time), a B20MultiplierFeed next to each (the multiplier as an AggregatorV3 read, for physical delivery), and one
/// rate-limited B20StockFaucet that mints them all. Run by scripts/deploy-base-stocks.sh with the lists from
/// packages/core (B20_STOCKS):
///
///   CHAIN_ID=84532 OWNER=0x.. SYMBOLS=TSLAc,NVDAc NAMES="Tesla,NVIDIA" DECIMALS=8,8 \
///     MULTIPLIERS=1000000000000000000,1000537939576369481 REAL=0xb200..,0xb200.. \
///     [DRIP=1000000000] [COOLDOWN=86400] [DAILY_CAP=1000000000000] OUT=../../deployments/base-stocks/base-sepolia.json \
///     forge script script/DeployBaseStocks.s.sol --rpc-url $RPC --broadcast
///
/// DEPLOYER_KEY in the env (never on a command line), else the forge wallet flags. Refuses any chain but Base Sepolia
/// (84532) or a local anvil (31337): stand-ins never go to a mainnet.
contract DeployBaseStocks is Script {
    function run() external {
        require(block.chainid == 84532 || block.chainid == 31337, "stand-ins deploy to Base Sepolia (or anvil) only");
        address owner = vm.envAddress("OWNER");
        string[] memory symbols = vm.envString("SYMBOLS", ",");
        string[] memory names = vm.envString("NAMES", ",");
        uint256[] memory decimals = vm.envUint("DECIMALS", ",");
        uint256[] memory mults = vm.envUint("MULTIPLIERS", ",");
        address[] memory real = vm.envAddress("REAL", ",");
        uint256 n = symbols.length;
        require(names.length == n && decimals.length == n && mults.length == n && real.length == n, "list lengths");
        // Ten tokens a claim, a claim a day per account, at most 10,000 tokens of each a day (8 decimals).
        uint128 drip = uint128(vm.envOr("DRIP", uint256(10e8)));
        uint64 cooldown = uint64(vm.envOr("COOLDOWN", uint256(1 days)));
        uint128 cap = uint128(vm.envOr("DAILY_CAP", uint256(10_000e8)));

        uint256 pk = vm.envOr("DEPLOYER_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        // The faucet and the tokens are owned by the deployer while it wires them, then handed to OWNER.
        B20StockFaucet faucet = new B20StockFaucet(deployer);
        string memory tokensJson;
        for (uint256 i = 0; i < n; i++) {
            B20StandIn t = new B20StandIn(
                string.concat(names[i], " (notes.markets test stand-in for Coinbase ", symbols[i], ")"),
                symbols[i],
                uint8(decimals[i]),
                mults[i],
                real[i],
                deployer
            );
            B20MultiplierFeed f =
                new B20MultiplierFeed(IB20(address(t)), string.concat(symbols[i], " multiplier (notes.markets stand-in)"));
            t.setMinter(address(faucet), true);
            faucet.setDrip(address(t), drip, cooldown, cap);
            if (owner != deployer) t.transferOwnership(owner); // Ownable2Step: OWNER calls acceptOwnership()
            vm.serializeAddress(symbols[i], "token", address(t));
            vm.serializeAddress(symbols[i], "multiplierFeed", address(f));
            vm.serializeUint(symbols[i], "multiplier", mults[i]);
            vm.serializeAddress(symbols[i], "mainnetToken", real[i]);
            string memory one = vm.serializeUint(symbols[i], "decimals", decimals[i]);
            tokensJson = vm.serializeString("tokens", symbols[i], one);
            console2.log(symbols[i], address(t), address(f));
        }
        if (owner != deployer) faucet.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("B20StockFaucet", address(faucet));
        vm.serializeUint("out", "chainId", block.chainid);
        vm.serializeAddress("out", "owner", owner);
        vm.serializeAddress("out", "faucet", address(faucet));
        string memory out = vm.serializeString("out", "tokens", tokensJson);
        string memory path = vm.envOr("OUT", string(""));
        if (bytes(path).length != 0) vm.writeJson(out, path);
    }
}
