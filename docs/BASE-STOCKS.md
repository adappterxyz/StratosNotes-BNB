# Stocks on Base: B20 stand-ins on Base Sepolia

**Status: deployed on Base Sepolia on 2026-11-16** (record: `deployments/base-stocks/base-sepolia.json`; faucet
`0x5724c3362795733F7906826Bfaa71b758A13eeB3`), and added to the Robinhood-home / Base-vault pair. Coinbase launched tokenized US stocks on **Base mainnet** on 2026-08-24
(the **B20** standard, custodian Alpaca). There is **no Base Sepolia deployment**: Coinbase's onchain registry
`0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD` has code on Base mainnet and none on Base Sepolia (`eth_getCode`). So
notes on Base Sepolia get **notes.markets' own test stand-ins**: one contract per Coinbase token, with the same symbol,
decimals and B20 reads, and the same multiplier as the real token. They have no value, are not Coinbase's, and come
from a public rate-limited faucet. Everything that names them reads its addresses from one place, so moving to Base
mainnet is a change of addresses (below).

What a Base note can do with them, once deployed:

- **Pledge** TSLAc, AMZNc, NVDAc, AAPLc, MSFTc or METAc as collateral, valued with Chainlink's per-token feed (60%
  default haircut, like Robinhood's stock tokens).
- **Deliver** a TSLA, AMZN, NVDA, AAPL, MSFT or META underlying physically below the knock-in barrier: shares ÷
  multiplier token units.
- A **Robinhood Chain note** can lock them on Base through the existing CCIP pair, as `TSLAc.base`… receipts
  ([CROSS-CHAIN.md](CROSS-CHAIN.md)).

## The stand-ins and what they stand for

All on Base mainnet, checked 2026-11-15 with read-only `eth_call` on `https://mainnet.base.org`: each feed's
`description()`, `decimals()` (8) and `latestRoundData()`; each token's `symbol()`, `name()`, `decimals()` (8) and
`multiplier()`. Feed addresses from docs.base.org (Tokenized stocks on Base, Chainlink price feeds), token addresses
from base.org/assets. The share feed is the underlying's, from the catalogue ([UNDERLYINGS.md](UNDERLYINGS.md)).

| Stand-in (Base Sepolia) | Real token (Base mainnet) | Chainlink per-token feed (Base mainnet) | Feed price 2026-11-15 | Multiplier 2026-11-15 | Delivers for (share feed, Robinhood Chain mainnet) |
|---|---|---|---|---|---|
| TSLAc | `0xb2000000000000000000001e800a7f5189430cD0` Tesla Inc. | `0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4` "Coinbase TSLA" | 387.79 | 1 | TSLA `0x4A11…7C38` |
| AMZNc | `0xb200000000000000000000d9192b6B456483C2E8` Amazon.com Inc. | `0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295` "Coinbase AMZN" | 265.45 | 1 | AMZN `0xD5a1…651C` |
| NVDAc | `0xb20000000000000000000078ee7ce2fE4908108C` NVIDIA Corporation | `0x04689a41629776563E6822F76f2e57D148d28513` "Coinbase NVDA" | 160.77 | 1.000537939576369481 | NVDA `0x379E…9F15` |
| AAPLc | `0xb200000000000000000000C2e324d24d7eEcd1fb` Apple Inc. | `0x787f13dEa48Db0897CbCDD985de77809D837F988` "Coinbase AAPL" | 355.59 | 1 | AAPL `0x6B22…2cD0` |
| MSFTc | `0xB200000000000000000000Ab99cFa739E253872B` Microsoft Corporation | `0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c` "Coinbase MSFT" | 522.41 | 1 | MSFT `0x45C3…Af2E` |
| METAc | `0xb2000000000000000000008bC8786B856E61707C` Meta Platforms Inc. | `0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D` "Coinbase META" | 638.54 | 1.000313792289598084 | META `0x7C38…71b1` |

The feeds' last rounds were from 2026-11-13/14 (the market was closed). Chainlink also has per-token feeds for GOOGL
(`0x5bF4…34F2`), MSTR (`0xB3cE…202a`), SNDK (`0x388b…a2eA`) and SPCX (`0x6A63…3Fa68`), all verified the same way; they
are not in this first set (GOOGL and MSTR are easy additions to `B20_STOCKS`; SNDK and SPCX have no share underlying in
the catalogue to deliver against). The registry: `B20_STOCKS` in `packages/core/src/products/base-stocks.ts`.

## How a B20 token differs from a plain ERC-20 (and from Robinhood's stock tokens)

| | Robinhood's stock tokens (Robinhood Chain) | Coinbase's B20 (Base mainnet) and the stand-ins (Base Sepolia) |
|---|---|---|
| Decimals | 18 | 8 |
| One token is | `uiMultiplier() / 1e18` shares | `multiplier / 1e18` shares |
| Corporate action (split, dividend reinvested) | balances never change; `uiMultiplier()` does ([CORPORATE-ACTIONS.md](CORPORATE-ACTIONS.md)) | balances never change; the WAD `multiplier()` does (`scaledBalanceOf`, ERC-8056 `uiMultiplier()` / `balanceOfUI()`, `toUIAmount` / `fromUIAmount`) |
| Price feed | per token (`RHTSLA / USD`): share price × Robinhood's multiplier | per token (`Coinbase TSLA`): share price × multiplier, 8 decimals, 0.5% deviation / 24 h heartbeat in market hours, holds its last value while closed or paused |
| Transfer restrictions | issuer can pause / freeze | a policy can block an address (`isAuthorized(policyId, account)`, `policyExists`): a blocked transfer reverts, `approve` is never gated; functions can be paused |

The stand-in (`packages/evm-engine/src/base-stocks/B20StandIn.sol`) imitates all of it: an ERC-20 with the B20 /
ERC-8056 reads, an owner-controlled multiplier (`setMultiplier`, bounded 0 < m ≤ 1000), a pause that makes every
balance change revert (`TokenPaused`), and one transfer policy (id 1) under which an owner-blocked address can neither
send nor receive (`PolicyForbids(1, account)`). `STAND_IN()` is true and `realToken()` names the Base mainnet token.

## Two kinds of price, kept apart

- **Underlyings** (strike, observations, barriers) are always **share** prices: a note on TSLA is fixed on Robinhood
  Chain mainnet's TSLA feed whichever chain it runs on, and owes shares.
- **B20 collateral** is valued per **token**, with Chainlink's per-token feed on Base mainnet. Each B20 token has its
  own **valuation key**, its symbol: `TSLAc`, never `TSLA`. Collateral symbols are the keys (`CollateralSymbol`,
  `DEFAULT_HAIRCUT`, the `px_TSLAc` oracle field); pricing a B20 token under `TSLA` would value it as a share, off by its
  multiplier (0.05% for NVDAc today, 2× after a 2:1 split). Receipts keep the key: `TSLAc.base` is valued as TSLAc,
  `TSLA.rh` as TSLA.
- `collateralFeed(key)` (packages/core params.ts) is the one place a key becomes a feed: the catalogue's for ETH and
  Robinhood's tokens, `b20PriceFeed` for B20 keys.

**The stand-in's value equals the real token's** because its multiplier equals the real one: a stand-in unit is priced
by the real token's feed (real share price × real multiplier), and delivered at the stand-in's own multiplier. The
deploy starts each stand-in at its real token's multiplier (read from Base mainnet at deploy time), and
`npx tsx scripts/base-stocks.ts sync` compares them afterwards and prints, for each one out of step, the owner's
`cast send <stand-in> 'setMultiplier(uint256)' <real>` (it never sends it). Run it after a corporate action, or on a
schedule; the multipliers move rarely (dividends reinvested: a few times a year; splits).

Feed chains (`packages/core/src/feed-rpc.ts` `EVM_FEED_CHAINS`; CRE reads both with its EVM capability, the fallback
keeper with the same public RPCs):

| CRE chain-selector name | Chain | What it serves | RPC (`cre/project.yaml`) |
|---|---|---|---|
| `ethereum-mainnet-base-1` | Base mainnet (8453) | the per-token price feeds (collateral) | `https://base-rpc.publicnode.com` |
| `ethereum-testnet-sepolia-base-1` | Base Sepolia (84532), also a note chain | each stand-in's `B20MultiplierFeed` (delivery) | already listed |

`ethereum-mainnet-base-1` is the CRE SDK's name for Base mainnet (`@chainlink/cre-sdk` networks, EVM client).

## Physical delivery: shares ÷ multiplier

A physically settled note on TSLA owes `1 / strike` shares per unit of face below the knock-in barrier. Delivered in
TSLAc, that is `1 / strike / multiplier` tokens. The note reads the multiplier itself:

- `B20MultiplierFeed` (`src/base-stocks/B20MultiplierFeed.sol`) answers `latestRoundData()` with the token's
  `multiplier()` (18 decimals; round 1, updated "now": it is live state, not a pushed round). One per token, next to
  it; it works the same over a real Coinbase token.
- The compiled note has an oracle field `mult_TSLA` (bounds 0.01–100, staleness 1 day because the keeper reads EVM
  feeds at a finalized block) captured **only at the final observation**, in the same CRE report as the fixing. The
  keeper needs no change: it reads every oracle field the same way.
- The delivery expression is `1 / initialLevel / mult_TSLA` (basket: `1 / initialLevel_TSLA / mult_TSLA` per
  underlying); the funding check (`balance(Escrow, d_TSLA) >= sold * perUnit`) and the delivery use the same
  expression.

**Rounding.** The engine computes in 10-decimal fixed point and truncates each division, so the per-unit amount is
never above the exact `1 / strike / multiplier`, and short of it by under 2e-10 token per unit of face (two
truncations); the distribution then floors each holder's share (under 1e-10 more). Rounding down is the engine's rule
for every payout (holders' shares never add up to more than escrow holds), and because funding and delivery use one
expression, what the issuer funds is exactly what is delivered: escrow can never be short of a delivery it accepted.
What a holder can lose is worth under $1e-7 per $1 of face at today's prices (2e-10 TSLAc ≈ $8e-8). Rounding up
would favour the holder by the same amount, but the expression language has no ceiling and the engine's no-overpay
invariant matters more. The multiplier itself enters the engine truncated to 10 decimals (1.000537939576369481 →
1.0005379395), a relative error under 1e-10. Over-funded tokens go back to the issuer at the release.

**Which multipliers.** The strike is a price of Robinhood's token (every stock feed is), so `1 / strike` is a number
of Robinhood tokens. The note delivers `1 / strike × rmult_TSLA / mult_TSLA` TSLAc: Robinhood's multiplier turns it
into shares, TSLAc's into tokens, both read at the final observation. A 2:1 split applied by both issuers cancels out;
a split or reinvested dividend on one side only still delivers the shares owed
([CORPORATE-ACTIONS.md](CORPORATE-ACTIONS.md)).

**A default before maturity** values a deliverable at its strike per token, without the multiplier (it is read only at
the final observation): it values a B20 token at most a multiplier's worth low, so the holders take that much more
of it under the cap-at-owed rule. Safe direction, never short.

## When the token says no: pause and policy blocks

**No engine change was needed.** How FlowEngine already treats a token transfer that fails
(`packages/evm-engine/src/lib/Units.sol`), and what that means for a B20:

| Path | What the engine does | With a paused B20, or a blocked address |
|---|---|---|
| Deposit (pledge at Approve Terms, fund a delivery, top up) | credits the ledger in the step, pulls the ERC-20 after it (interactions last); a failing `transferFrom` reverts the whole transaction | nothing is credited or pulled, the note does not move; the issuer retries once the token works. A delivery not funded by the deadline is a missed payment: grace, then default (collateral to holders) |
| Payout (coupon, delivery, default distribution, release) | ledger only: no token moves | always runs: a paused token never stops a report, a default or a release |
| Push (`pushPayouts`, `pushTo`) | each transfer bounded (150k gas), failure caught: `PayoutDeferred`, the amount stays on the holder's account | a blocked holder is skipped, the others are paid in the same batch |
| Withdraw | debits then transfers; a failing transfer reverts the whole call | the holder keeps the balance and withdraws once unblocked or unpaused |

So a paused or blocking token delays wallets, never the note. Two residual cases, both closed rather than wrong:
if the token's `multiplier()` cannot be read (the multiplier feed reverts), the final report waits and the keeper
retries each run; a multiplier outside 0.01–100 (a 100:1 split) stops the final observation until the bounds are
reviewed. A B20 policy that blocks the **engine itself** stops every deposit of that token and every withdrawal (pushes
defer): what is in escrow stays accounted and moves on the ledger as the note runs.

The Foundry suite `test/BaseStocks.t.sol` runs each of these with the stand-in: a paused token at the delivery deadline
(the funding step reverts whole, then goes through after the unpause), a token paused from the strike through a
default (the default runs; pushes defer; withdrawals revert, then succeed), a blocked holder (deferred while the other
is paid; withdraws after the unblock), a blocked escrow (the pledge reverts whole, then goes through), delivery at
shares ÷ multiplier, and a non-round multiplier read through B20MultiplierFeed (each holder within 2e-10 per unit,
never above). Two runs in the product fixtures (`scripts/fixtures.ts`, last two) pay the reference payoff through the
engine: a Base FCN on TSLA delivering TSLAc at multiplier 1.25 with TSLAc collateral, and the same note defaulting
with its TSLAc collateral going to the holders.

## Faucet

`B20StockFaucet` (`src/base-stocks/B20StockFaucet.sol`): anyone calls `claim(token)` or `claimAll()`; 10 tokens a
claim, one claim per account per token per day, at most 10,000 of each token per UTC day across everyone (deploy
defaults `DRIP`, `COOLDOWN`, `DAILY_CAP`). It is a minter of each stand-in and holds nothing. `NOTICE()` says what the
tokens are. Core: `BASE_STOCK_FAUCET`, `b20FaucetAbi`, and `STOCK_TOKEN_FAUCETS['base-sepolia']` (its BaseScan
write-contract page) once deployed. The app shows Robinhood's faucet as a link; a "claim" button for this one is an
app change left to the app (the ABI is exported).

## Where the addresses live

`packages/core/src/products/base-stocks.deployed.ts` (`BASE_SEPOLIA_STOCKS`): every token, multiplier feed and the
faucet, the zero placeholder (`NOT_DEPLOYED`) until the deploy writes them. While a stand-in is a placeholder it is
known by symbol, key and decimals (so the terms and the compiler know it) but:

- not served (`EXTERNAL_TOKENS`, `realTokens`: the API's and the app's token lists skip it);
- not issuable (`validateProductParams`: "TSLAc is not deployed yet"); the network picker (`toChain`) settles such a
  note in cash and drops the collateral; `collateralChoices` shows no token for it;
- not wired (`wirePlan` skips it; `pendingPlan` lists it), and `checkCrossChainDeployment` accepts the live pair's
  record without the B20 receipts.

App note: the app's collateral pickers call `collateralTokenOf` directly, so before the deploy they can list TSLAc on
Base; the term-sheet check then refuses it with the message above. `collateralChoices` / `canPledgeNow` /
`canDeliverNow` are the deployment-aware helpers for a picker.

## Deploy (Base Sepolia)

```bash
# 0. Rehearse on an anvil fork of Base Sepolia (and of Robinhood Chain testnet for the pair): anvil key, never .keys
REHEARSAL=1 EXTEND_PAIR=1 bash scripts/deploy-base-stocks.sh

# 1. Deploy the six stand-ins, their multiplier feeds and the faucet; write the record and core's addresses
bash scripts/deploy-base-stocks.sh
#   -> deployments/base-stocks/base-sepolia.json, packages/core/src/products/base-stocks.deployed.ts,
#      config.staging.json and deployments/server/*.json regenerated

# 2. Add TSLAc.base… to the Robinhood-home / Base-vault pair (the pair owner's key): in step 1 with EXTEND_PAIR=1, or
#    later for the stand-ins already in the record
EXTEND_ONLY=1 bash scripts/deploy-base-stocks.sh
```

The extension is `ROLE=allow` (vault `setToken` on Base) and
`ROLE=receipts` (gateway `registerReceipt` on Robinhood Chain) of `script/DeployCrossChain.s.sol`, then
`scripts/base-stocks.ts extend-assemble` adds the receipts to `deployments/crosschain/robinhood-testnet.json` and
checks it. Then: commit the record, the core file and the configs; deploy the Worker (served tokens); rebuild and
redeploy the CRE workflow (core is bundled in; `cre/project.yaml` already lists `ethereum-mainnet-base-1`); restart
the issuer bots (they fund TSLAc deliveries from the issuer's wallet: claim from the faucet first).

Rehearsed on anvil forks on 2026-11-15 (`REHEARSAL=1 EXTEND_PAIR=1`): 11.06M gas over 25 transactions on Base
Sepolia for the stand-ins, feeds and faucet (~0.00006 ETH at 0.0054 gwei; the script asks for 0.003 ETH), then the
pair extension as the live pair owner (impersonated on the forks): 0.29M gas on Base Sepolia (6 `setToken`) and 5.50M
on Robinhood Chain testnet (6 receipts). Every read-back passed (symbol, 8 decimals, multiplier = Base mainnet's, the
multiplier feed answering it, the faucet a minter), a `claimAll` minted 10 of each, a second claim inside the cooldown
reverted, the served tokens on Base Sepolia became USDC, WETH and the six stand-ins, and the extended pair record passed
`checkCrossChainDeployment` with the six `.base` receipts.

## Moving to Base mainnet: a change of addresses

1. **Tokens.** Point each B20 stock at the real token: a `B20Deployment` for Base mainnet with `tokens[s].token =
   B20_STOCKS[s].mainnetToken` (already in core) and `faucet` = `NOT_DEPLOYED` (nobody mints on mainnet), used where
   `BASE_SEPOLIA_STOCKS` is used today (`b20StandIns()` in params.ts builds the chain's tokens from it; set `standIn:
   false`, `issuer: 'Coinbase'`).
2. **Multiplier feeds.** Deploy one `B20MultiplierFeed` per real token on Base mainnet (stateless, ownerless; the
   `DeployBaseStocks.s.sol` loop without the stand-ins and faucet) and put their addresses in the same record. Its
   `feedChain` becomes `ethereum-mainnet-base-1`.
3. **Price feeds: nothing.** Collateral is already valued with the real per-token feeds on Base mainnet.
4. **The note chain.** Base mainnet as a note chain is the larger step (an engine, cash USDC on Base mainnet, CRE
   production forwarder, `NoteChain`): outside this phase. The B20 parts above need nothing else.
5. **Retire the sync.** With the real tokens, multipliers are Coinbase's; `scripts/base-stocks.ts sync` is only for
   stand-ins.

## Not done here

- A claim button in the app (the faucet ABI and address are exported from core).
- GOOGL and MSTR (verified feeds; one entry each in `B20_STOCKS`, and a redeploy of the stand-ins or a second record).
