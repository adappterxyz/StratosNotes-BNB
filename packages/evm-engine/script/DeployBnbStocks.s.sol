// SPDX-License-Identifier: UNLICENSED
pragma solidity 0.8.24;

import {Script, console2} from "forge-std/Script.sol";
import {BStockStandIn} from "../src/bnb-stocks/BStockStandIn.sol";
import {BStockMultiplierFeed} from "../src/bnb-stocks/BStockMultiplierFeed.sol";
import {BnbTestFaucet} from "../src/bnb-stocks/BnbTestFaucet.sol";
import {TestDollar} from "../src/bnb-stocks/TestDollar.sol";
import {IBStock} from "../src/bnb-stocks/IBStock.sol";

/// notes.markets' test tokens on BNB Chain testnet (docs/BNB-CHAIN.md): the nmUSD test dollar (BNB Chain notes settle
/// in it), one BStockStandIn per bStock (same symbol and 18 decimals as the real one, its multiplier read from BNB
/// Chain mainnet at deploy time), a BStockMultiplierFeed next to each (the multiplier as an AggregatorV3 read, for
/// collateral prices and physical delivery), and one rate-limited BnbTestFaucet that mints them all. Run by
/// scripts/deploy-bnb.sh with the lists from packages/core (BSTOCKS):
///
///   OWNER=0x.. SYMBOLS=TSLAB,NVDAB NAMES="Tesla,NVIDIA" MULTIPLIERS=1000000000000000000,1000778000000000000 \
///     REAL=0x5b19..,0x02fc.. [DRIP=10e18] [COOLDOWN=86400] [DAILY_CAP=10000e18] [USD_DRIP=10000e6] [USD_CAP=10000000e6] \
///     OUT=../../deployments/bnb-stocks/bnb-testnet.json forge script script/DeployBnbStocks.s.sol --rpc-url $RPC --broadcast
///
/// DEPLOYER_KEY in the env (never on a command line), else the forge wallet flags. Refuses any chain but BNB Chain
/// testnet (97) or a local anvil (31337): test tokens never go to a mainnet.
contract DeployBnbStocks is Script {
    function run() external {
        require(block.chainid == 97 || block.chainid == 31337, "test tokens deploy to BNB Chain testnet (or anvil) only");
        address owner = vm.envAddress("OWNER");
        string[] memory symbols = vm.envString("SYMBOLS", ",");
        string[] memory names = vm.envString("NAMES", ",");
        uint256[] memory mults = vm.envUint("MULTIPLIERS", ",");
        address[] memory real = vm.envAddress("REAL", ",");
        uint256 n = symbols.length;
        require(names.length == n && mults.length == n && real.length == n, "list lengths");
        // Ten tokens a claim, a claim a day per account, at most 10,000 tokens of each a day (18 decimals); 10,000
        // nmUSD a claim, at most 10 million a day.
        uint128 drip = uint128(vm.envOr("DRIP", uint256(10e18)));
        uint64 cooldown = uint64(vm.envOr("COOLDOWN", uint256(1 days)));
        uint128 cap = uint128(vm.envOr("DAILY_CAP", uint256(10_000e18)));
        uint128 usdDrip = uint128(vm.envOr("USD_DRIP", uint256(10_000e6)));
        uint128 usdCap = uint128(vm.envOr("USD_CAP", uint256(10_000_000e6)));

        uint256 pk = vm.envOr("DEPLOYER_KEY", uint256(0));
        if (pk != 0) vm.startBroadcast(pk);
        else vm.startBroadcast();
        address deployer = pk != 0 ? vm.addr(pk) : msg.sender;
        // Owned by the deployer while it wires them, then handed to OWNER (Ownable2Step: OWNER calls acceptOwnership()).
        BnbTestFaucet faucet = new BnbTestFaucet(deployer);
        TestDollar usd = new TestDollar(deployer);
        usd.setMinter(address(faucet), true);
        faucet.setDrip(address(usd), usdDrip, cooldown, usdCap);
        if (owner != deployer) usd.transferOwnership(owner);
        string memory tokensJson;
        for (uint256 i = 0; i < n; i++) {
            BStockStandIn t = new BStockStandIn(
                string.concat(names[i], " (notes.markets test stand-in for Binance ", symbols[i], ")"),
                symbols[i],
                mults[i],
                real[i],
                deployer
            );
            BStockMultiplierFeed f = new BStockMultiplierFeed(
                IBStock(address(t)), string.concat(symbols[i], " multiplier (notes.markets stand-in)")
            );
            t.setMinter(address(faucet), true);
            faucet.setDrip(address(t), drip, cooldown, cap);
            if (owner != deployer) t.transferOwnership(owner);
            vm.serializeAddress(symbols[i], "token", address(t));
            vm.serializeAddress(symbols[i], "multiplierFeed", address(f));
            vm.serializeUint(symbols[i], "multiplier", mults[i]);
            vm.serializeAddress(symbols[i], "mainnetToken", real[i]);
            string memory one = vm.serializeUint(symbols[i], "decimals", 18);
            tokensJson = vm.serializeString("tokens", symbols[i], one);
            console2.log(symbols[i], address(t), address(f));
        }
        if (owner != deployer) faucet.transferOwnership(owner);
        vm.stopBroadcast();

        console2.log("BnbTestFaucet", address(faucet));
        console2.log("nmUSD", address(usd));
        vm.serializeUint("out", "chainId", block.chainid);
        vm.serializeAddress("out", "owner", owner);
        vm.serializeAddress("out", "faucet", address(faucet));
        vm.serializeAddress("out", "cash", address(usd));
        string memory out = vm.serializeString("out", "tokens", tokensJson);
        string memory path = vm.envOr("OUT", string(""));
        if (bytes(path).length != 0) vm.writeJson(out, path);
    }
}
