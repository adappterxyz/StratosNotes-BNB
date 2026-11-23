# Underlyings: the Chainlink price catalogue

A note can be written on any price in the catalogue: US stocks and ETFs, crypto, forex and commodities, each fixed by
Chainlink on its asset's own oracle and delivered to the engine by Chainlink CRE. The catalogue is generated from
Chainlink's reference data directory and committed as `packages/core/src/products/feeds-catalogue.ts`; `FEEDS` (by
symbol) is derived from it.

**Underlyings are not collateral.** What an issuer can pledge is a separate whitelist (`COLLATERAL_SYMBOLS`: the
stablecoin, WETH, Robinhood's TSLA, AMZN, AMD, PLTR stock tokens on Robinhood Chain, and on Base Sepolia the B20 stock
stand-ins TSLAc, AMZNc, NVDAc, AAPLc, MSFTc, METAc): only tokens a note can actually lock. Likewise physical delivery
is limited to tokens that exist on the note's chain (`deliverableToken`: WETH for ETH on both; Robinhood's TSLA, AMZN,
AMD, PLTR on Robinhood Chain; on Base Sepolia TSLA, AMZN, NVDA, AAPL, MSFT and META in the B20 stand-ins, at shares ÷
multiplier, once they are deployed); every other underlying, including all forex and commodities, settles in cash
(final ÷ strike in the chain's dollar below the knock-in).

**A stock underlying is the price of Robinhood's token.** TSLA is Robinhood Chain mainnet's `RHTSLA / USD` feed,
whichever chain the note runs on: the share price × the multiplier of Robinhood's token (the shares one token stands
for). A split does not move it, and reinvested dividends lift it slightly above the share price. Coinbase's B20 stocks
on Base have their own Chainlink feeds (`Coinbase TSLA` …, Base mainnet), share price × Coinbase's multiplier: those
value TSLAc… as collateral only (keys `TSLAc`…, never `TSLA`) and are not in the catalogue. What this means for
delivery and for bStock collateral: [CORPORATE-ACTIONS.md](CORPORATE-ACTIONS.md); the tokens:
[BASE-STOCKS.md](BASE-STOCKS.md).

## Which price a check uses: the latest round, or a fixing window

By default a note's start price and each observation are the feed's **latest round** when the keeper runs, the first
run after the date (the keeper runs every minute). Dates are the start time plus each period (a closing-price note sets them at the US close, below). A
closed market leaves the feed on its last price (accepted up to 4 days old for stocks).

An issuer can instead set a **fixing window** of 15, 30 or 60 minutes (`fixingWindowMin`). Every price the note reads,
collateral prices included, is then the **time-weighted median** of the feed over that window: each round counts for
as long as it was the feed's price, and the fixing is the price at which half the window is reached. A spike or dip
that lasted less than half the window does not move it, however deep; a price that held does.

- **The window ends at the check's scheduled time**, not when the keeper runs, so a fixing does not depend on when
  the report landed and anyone can recompute it (`stepFixing`, packages/core/src/keeper.ts). Every price of one check
  is fixed over the same window. If the keeper is so late that the rounds it reads no longer reach back to that
  window, or the step has no date, the window before the reading is used instead.
- The rule is a term of the note: it is recorded on each oracle field (`window`, seconds, and `disruption`, basis
  points) in the definition's metadata, shown on the note's page, and the keeper cannot choose it.
- The keeper reads the feed's past rounds (`getRoundData`) going back from the latest in one JSON-RPC request per
  feed chain: 48 rounds shared by the feeds of the run, the recent ones one by one and then ever further back
  (`roundOffsets`), so a window crowded with rounds is still covered end to end.
- The latest round is still checked (answered, positive, fresh). If the history cannot be read the report waits for
  the next run; it never falls back to the latest round.
- **Where it works** (`canWindowFeed`): stocks (Robinhood Chain mainnet, read over JSON-RPC at the block of the
  latest round) and crypto, forex and gold on Ethereum and Arbitrum (`HISTORY_FEED_CHAINS`: CRE reads the latest
  round with its EVM capability, then the history over the HTTP capability from the chain's public RPC, or the
  keeper's `historyRpcs`; past rounds never change, so the nodes agree whatever block they read at). Coinbase's
  per-token collateral feeds on Base stay on the latest round.
- A Chainlink feed writes a round on a set move (0.5% on most) or at its heartbeat, so the median is of those steps,
  not of every trade. A move that holds for more than half the window is the fixing: the window does not protect
  against that.

### Closing price (US stocks)

`fixingAt: 'close'` makes a closing-price note: the wizard sets the book close and every check at the **US market
close, 16:00 New York**, of a weekday (`usCloseOnOrAfter`, following daylight saving), and each price is the median
over the window ending at that time (15 minutes by default). Stocks only (`canCloseFeed`).

- The feed is the price of Robinhood's stock token, which trades 24/5. The fixing is the token's price at the close,
  not the exchange's official closing print; the two can differ slightly.
- Exchange holidays and half days are not in the calendar. On a holiday the feed stands at the last close, so the
  check reads it. On a half day (13:00 close) the check reads the token's after-hours price at 16:00.
- The dates are inputs of the issuance (Approve Terms), as for any note: the engine does not check that they sit on
  a close. A closing-price note is checked at most once a day.

### Disruption rule

`disruptionPct` (5, 10 or 20; needs a fixing window) is the market disruption clause of a traditional note. If any
price of a check moved more than that between its **low and its high inside the window** (`windowDisrupted`: the
round in effect at the window's start and every round written in it; one extreme round is enough), the check is
**postponed by one window**, at most twice (`DISRUPTION_MAX_POSTPONEMENTS`), then taken regardless. The keeper retries
every run and writes nothing while a postponed window has not ended.

- One disrupted underlying postpones the whole check: a basket is always fixed over one window.
- **Payment dates do not move.** A payment is due at the check's scheduled date plus the settlement lag, so a
  postponed check leaves the issuer less time to fund it. The wizard requires the lag to be at least the longest
  postponement (two windows).
- The limit is measured on the feed's rounds, so a move smaller than the feed's step between rounds is not seen.

## What is in it (generated 2026-10-26)

141 feeds:

| Class | Feeds | Source (first choice) |
|---|---|---|
| Stocks (US equities and ETFs: TSLA, NVDA, AAPL, SPY, QQQ, MSTR, the SLV and USO ETFs…) | 34 | Robinhood Chain mainnet |
| Crypto (ETH, BTC, SOL, LINK, DOGE, XRP…) | 87 | Ethereum mainnet, then Arbitrum One |
| Forex (EUR, GBP, JPY, CHF, AUD, CAD, CNY, KRW, SGD, HKD, SEK…, each against USD) | 18 | Ethereum mainnet, then Arbitrum One |
| Commodities (XAU gold, XAG silver) | 2 | Ethereum mainnet |

By chain: Robinhood Chain mainnet 35, Ethereum mainnet 53, Arbitrum One 53.

| Chain (CRE chain-selector name) | How the keeper reads it |
|---|---|
| `ethereum-mainnet` | CRE EVM read (`EVMClient`), finalized block |
| `ethereum-mainnet-arbitrum-1` | CRE EVM read (`EVMClient`), finalized block |
| `robinhood-mainnet` | CRE HTTP capability, one batched JSON-RPC `eth_call` per run (`httpFeedChains`, `packages/core/src/feed-rpc.ts`): CRE has no EVM read there yet |

Two more feed chains carry prices that are not underlyings ([BASE-STOCKS.md](BASE-STOCKS.md)):

| Chain (CRE chain-selector name) | What | How the keeper reads it |
|---|---|---|
| `ethereum-mainnet-base-1` (Base, 8453) | Chainlink's per-token feeds of Coinbase's B20 stocks: the collateral price of TSLAc… | CRE EVM read, finalized block |
| `ethereum-testnet-sepolia-base-1` (Base Sepolia, also a note chain) | each B20 stand-in's multiplier (`B20MultiplierFeed`), read at a physically settled Base note's last observation | CRE EVM read, finalized block |

A CRE target needs an `rpcs` entry for every EVM chain (`cre/project.yaml`); `config.*.json` keeps `httpFeedChains`
for Robinhood Chain mainnet. The fallback keeper has public RPCs for all three by default (`EVM_FEED_CHAINS`,
`HTTP_FEED_CHAINS`). A worst-of basket has at most 3 underlyings (`MAX_UNDERLYINGS`), so a report costs at most 6 EVM
reads, inside the keeper's 15-read budget per run.

## The rules (packages/core/src/products/feed-directory.ts)

Directories read: `feeds-mainnet.json` (Ethereum), `feeds-ethereum-mainnet-arbitrum-1.json` (Arbitrum One),
`feeds-robinhood-mainnet.json` (Robinhood Chain), from https://reference-data-directory.vercel.app.

Kept: standard push price feeds, i.e. an AggregatorV3 proxy (`proxyAddress`), product type Price, a plain `X / USD`
pair, Chainlink market-risk category **low** or **medium**, asset class equity/ETF, crypto, fiat or commodity.

Excluded, with the number of directory rows on 2026-10-26:

| Excluded | Why | Rows |
|---|---|---|
| Data Streams / DataLink (no proxy, `verifier` contracts, names with `-Streams-`, `-Datalink-`, `RefPrice`) | pull-based reports, not a feed CRE reads with `latestRoundData` | 827 |
| Exchange rates (`… Exchange Rate`) | a wrapped-token ratio, not a market price | 83 |
| Hidden in the directory | Chainlink does not list them | 53 |
| Crypto stablecoins and pegged assets (USDC, USDT, EURC, WBTC, stETH, PAXG…, and dollar tokens like AUSD) | pegged to another asset: a note on them is a note on the peg | 62 |
| Quoted in ETH, BTC, ARS… | not USD: the strike and payoffs are in dollars | 58 |
| Not a plain `X / USD` pair (`SPCX-USD (24/5)`, `Calculated …`) | special-purpose feeds | 36 |
| Risk category high, new, custom or none | Chainlink flags their market risk; `custom` is allowed only for Robinhood Chain's own `Robinhood <TICKER> / USD` equity feeds, the native oracle of Robinhood's stock tokens | 42 |
| Proof of reserve / reserves | not a price | 23 |
| NAV / funds (NAVLink, treasuries, money-market, private credit) | not a market price | 19 |
| Deprecated (`docs.shutdownDate`, category `deprecating`) | being shut down | 19 |
| Macro / index (CPI, economic indices) | not an asset price | 14 |
| Tickers notes cannot name (`1INCH`, `BTC.B`) | a ticker starts with a letter, capitals and digits only (`validateTermSheet`) | 2 |
| Duplicates on a network | one feed per symbol per network: the canonical path (`eth-usd` over `eth-usd-svr`), 8 decimals, the faster heartbeat | 17 |

One feed per symbol across networks: stocks from Robinhood Chain mainnet first (Robinhood's own oracle for its stock
tokens), then Arbitrum One; crypto, forex and commodities from Ethereum mainnet first, then Arbitrum One. ETFs follow
the directory's asset class (SPY, QQQ, SLV and USO are equities there: Stocks). Then every chosen feed is
read once (`latestRoundData`, read-only): a feed whose last round is older than its staleness allowance is dropped as
not live, and so is one priced below 0.00001 USD (PEPE, SHIB on 2026-10-26), whose bounds would need more decimals
than the engine's fixed point keeps.

### Staleness

The oldest round a fixing accepts (`staleness`, seconds; the keeper adds its finality allowance on top):

- Stocks, ETFs, forex, commodities: heartbeat + 3 days (259,200 s). Their feeds follow market hours and do not update
  from Friday's close to Monday's open; with the usual 24 h heartbeat that is 345,600 s, as notes have always used.
- Crypto (24/7): heartbeat + 10% (at least 5 minutes), e.g. 3,600 s → 3,960 s, 86,400 s → 95,040 s.

### Bounds

Every fixing must sit in `[minPrice, maxPrice]`, checked on-chain by the engine: a tenth of the price on the day the
catalogue was generated to ten times it, two significant figures (min rounded down, max up). EUR/USD at 1.12 gives
0.11–12; JPY/USD at 0.0064 gives 0.00063–0.064; XAU at 4,009 gives 400–41,000. Wide enough for any move over a note's
life, narrow enough to refuse a broken feed (a decimals change, a zero). Regenerating moves the bounds of new symbols
with the market; a note keeps the bounds compiled into its definition.

### Symbols notes used before the catalogue

ETH, BTC, SOL (Ethereum mainnet) and TSLA, AMZN, AMD, PLTR, NVDA, AAPL, SPY, META, MSFT, GOOGL, COIN (Robinhood
Chain mainnet) keep exactly their earlier feed, chain, bounds and staleness (`PINNED` in the generator), so templates
and saved term sheets compile to the same definitions. The generator fails if the priority would ever pick another
feed for one of them.

## Payoffs

Barriers, coupon barriers and autocall levels are % of each underlying's strike, so forex and commodity underlyings
work in every payoff unchanged (fcn, reverse convertible, phoenix, snowball, PPN, worst-of baskets mixing classes).
The Foundry fixtures run a phoenix on EUR/USD, a reverse convertible on JPY/USD (a price of 0.0064) and a worst-of FCN
on EUR, XAU and TSLA through the engine against the reference payoff. The template library has one forex note
(12M Phoenix on EUR/USD).

`validateTermSheet` refuses an underlying without a staleness, with bounds that are not plain decimals of at most 10
places, or on a feed chain the keeper does not read.

## Regenerate

```bash
npx tsx scripts/feeds-catalogue.ts --check   # download, filter, read every feed; print counts and exclusions
npx tsx scripts/feeds-catalogue.ts           # the same, then write packages/core/src/products/feeds-catalogue.ts
npm -w packages/core run test                # the catalogue tests (test/catalogue.test.ts)
```

RPCs default to public endpoints (`ETH_RPC`, `ARB_RPC`, `RH_RPC` override). Only `eth_call` is sent. Commit the
regenerated module; deployed notes are unaffected (their feeds and bounds are in their definitions), new issues use
the new catalogue. The app, the AI prompt (`packages/core/src/ai`) and the keepers read the catalogue as is.
