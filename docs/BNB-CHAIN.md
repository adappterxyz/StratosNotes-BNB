# BNB Chain: the third note chain, and Binance's bStocks

**Status: built and tested; not deployed.** Notes can run on BNB Chain testnet (chain id 97) as they do on Robinhood
Chain testnet and Base Sepolia, and Binance's bStocks (tokenized US stocks, launched on BNB Chain mainnet in June 2026)
can back notes on any of the three chains. Deploying needs tBNB for the deployer (below).

## What is on BNB Chain testnet

There are no bStocks on BNB Chain testnet: the mainnet tokens, their shared upgrade beacon
(`0x156d6dce9a4f6139a3406f1f021f1a4880de93a3`), the compliance contract and the pause manager have no code there
(checked 2026-11-17). BNB Chain testnet also has no stablecoin a newcomer can get: its USDT and USDC are 18-decimal
tokens only their owner mints (`mint` reverts "Ownable: caller is not the owner"), handed out on Discord. So
notes.markets deploys its own test tokens there, all with no value, all from one rate-limited faucet:

| Token | What it is | Decimals |
|---|---|---|
| nmUSD | notes.markets' test dollar: BNB Chain notes settle in it (`TestDollar.sol`) | 6 |
| TSLAB, NVDAB, AAPLB, MSFTB, AMZNB, GOOGLB, METAB | stand-ins for Binance's bStocks (`BStockStandIn.sol`), each at its real token's multiplier | 18 |

The real tokens, checked on BNB Chain mainnet 2026-11-17 (symbol, name, decimals 18, `uiMultiplier`, the shared
beacon); the registry is `BSTOCKS` in `packages/core/src/products/bnb-stocks.ts`:

| bStock | Mainnet token | Share it represents | uiMultiplier 2026-11-17 |
|---|---|---|---|
| TSLAB | `0x5b1910eaad6450e50f816082aa078c41f10c292f` | TSLA | 1 |
| NVDAB | `0x02fca66c1d1afb4e2a7884261eb00f63598a7436` | NVDA | 1.000778 |
| AAPLB | `0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a` | AAPL | 1.001135 |
| MSFTB | `0x80106cb3ead06659a5ad19df39d9b4733863b9b0` | MSFT | 1.001314 |
| AMZNB | `0x1a4b499833a79a09ad7cf1d42d7dacf71e92eb00` | AMZN | 1 |
| GOOGLB | `0x3f53de71c126bdabae20f9cd64848d317f6c3238` | GOOGL | 1.000478 |
| METAB | `0x7425889fe94f9d693e8daefe88bcced6acfef4c0` | META | 1.000548 |

Binance lists about 110 bStocks; these seven are the large caps with a share feed in the catalogue. Beware lookalikes:
a token called "Binance Stocks / bStocks" at `0x2f70…4444` is not Binance's.

## How a bStock is priced and delivered

A bStock has **no per-token Chainlink feed** (unlike Coinbase's B20 stocks on Base, docs/BASE-STOCKS.md). One token is
worth `uiMultiplier / 1e18` shares: dividends and forward splits raise the multiplier, and raw balances never rebase. So
a note values bStock collateral as **share price x multiplier**, both read into the note by the keeper:

- `pxs_TSLAB`: the TSLA share price, the catalogue's feed (the same one underlyings use);
- `pxm_TSLAB`: the multiplier, from a `BStockMultiplierFeed` next to the token (an AggregatorV3 view of
  `uiMultiplier()`, the multiplier in effect: a scheduled change counts from its effective time);
- `px_TSLAB = pxs_TSLAB * pxm_TSLAB`: a formula field the engine computes, read by coverage and defaults like any other
  collateral price.

The collateral key is the token's symbol (TSLAB), never the share's: pricing a bStock as a share would be off by its
multiplier. Physical delivery of a share underlying on BNB Chain pays **shares / multiplier** bStock units, the
multiplier read at the final observation, exactly as a B20 delivery on Base (`mult_TSLA`).

The stand-in imitates the parts that matter to the engine: the multiplier (scheduled with
`setUIMultiplier(value, effectiveAt)`; `pendingMultiplier`, `effectiveAt`, `hasPendingMultiplier`), a blocklist (a
blocked address can neither send nor receive, `BlockedAddress`), and a pause (every balance change reverts,
`TokenPaused`; the real token asks a shared pause manager, the stand-in keeps the flag and answers `isTokenPaused`).
`test/BnbStocks.t.sol` runs a BNB note on TSLA through the engine with a paused token, a blocked holder and a default,
and checks each holder against the reference payoff.

## Cross-chain collateral: every chain backs every other

With three chains there are six pairs, one gateway per home chain and one vault per (home, asset):

| Notes on | Collateral locked on | Receipts |
|---|---|---|
| BNB Chain | Robinhood Chain | USDG.rh, WETH.rh, TSLA.rh, AMZN.rh, AMD.rh, PLTR.rh |
| BNB Chain | Base | USDC.base, WETH.base, TSLAc.base … METAc.base |
| Robinhood Chain | BNB Chain | nmUSD.bnb, TSLAB.bnb … METAB.bnb |
| Base | BNB Chain | nmUSD.bnb, TSLAB.bnb … METAB.bnb |
| Robinhood Chain | Base | (live already) |
| Base | Robinhood Chain | (live already) |

The Robinhood Chain and Base gateways are kept: a vault on BNB Chain is added behind each (`deploy-crosschain.sh` adds a
remote to a gateway that has none on that chain). CCIP lanes BNB testnet ↔ Base Sepolia and BNB testnet ↔ Robinhood
Chain testnet are live both ways (Router 1.2.0 at `0xE105…8F6f`, selector 13264668187771770619; fee in tBNB). A receipt
symbol (TSLAc.base) can back notes on two homes now, each gateway minting its own: core's `RECEIPTS` lists its `homes`.

## Deploy

```bash
# 0. Everything on anvil forks of the three chains (the deployer's key, nothing broadcast to a live network)
REHEARSAL=1 bash scripts/deploy-bnb.sh

# 1. Live: the engine, the test tokens, the four pairs, the configs (skips what is already deployed)
bash scripts/deploy-bnb.sh
```

Needs about 0.03 tBNB on BNB Chain testnet for the deployer (engine, tokens, a gateway with its 0.005 tBNB release fee
pool, two vaults; gas is 0.1–0.2 gwei) and a little ETH on Robinhood Chain and Base Sepolia for the two vaults there.
The keeper key needs tBNB too (it writes reports on BNB Chain). tBNB: https://www.bnbchain.org/en/testnet-faucet
(0.3 a day; the wallet must hold 0.002 BNB on mainnet).

Then: commit `deployments/` and `packages/core/src/products/bnb-stocks.deployed.ts`, deploy the Worker
(`npm run deploy`), and restart the keeper and the issuer bots (`ops/ecosystem.config.cjs` starts one for BNB Chain
testnet). `npx tsx scripts/bnb-stocks.ts sync` prints the owner's `setUIMultiplier` call for any stand-in whose
multiplier has drifted from its real token's (it never sends it).

## Moving to BNB Chain mainnet: a change of addresses

The tokens become Binance's (`BSTOCKS[s].mainnetToken`); deploy one `BStockMultiplierFeed` per real token there and
point `BNB_TESTNET_DEPLOYMENT`'s role at a mainnet record. Cash becomes a real stablecoin. A mainnet note chain also
needs an engine, CRE's production forwarder on BNB Chain (`0x76c9…5E62`), and an audit.

## Not done here

- The deployment itself (tBNB for the deployer and the keeper).
- A claim button in the app (the faucet's contract page is linked).
- More bStocks: one entry each in `BSTOCKS` (a share feed in the catalogue) and a redeploy or a second record.
