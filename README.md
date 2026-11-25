# notes.markets on BNB Chain: structured notes on stock tokens, priced by Atlas and CoinMarketCap

Submission for the **CoinMarketCap × Atlas challenge** at BNB Hack Bangkok (25 to 27 November 2026).

- **Try it:** https://bnb.notes.markets (app: https://bnb.notes.markets/app)
- **One-page write-up:** [docs/SUBMISSION.md](docs/SUBMISSION.md) · **Demo script:** [docs/DEMO-BNB.md](docs/DEMO-BNB.md)
- **How the two data providers are used:** [docs/ATLAS-CMC.md](docs/ATLAS-CMC.md)

## What it is

A structured note pays a coupon while a stock holds above a line, and returns less than the face if the stock ends
below a barrier. Banks sell them over the counter. Here anyone can issue one on BNB Chain, written on Binance's stock tokens (fourteen of them: Tesla, Nvidia, Apple and others, and the S&P 500 and Nasdaq-100 ETF tokens), backed by collateral locked in the note, with every price
check and payment run by an automated keeper.

A note pays or fails on a handful of prices, so the product is only as good as those prices:

- **Atlas** sets them: its on-chain price of each stock token on BNB Chain, available around the clock.
- **CoinMarketCap** must confirm them: no Atlas price is written unless CoinMarketCap's price is within 3%.
- **CoinMarketCap's history** gives each note a median over the minutes before a check, a rule that postpones a
  check made during a violent move, and a replay of the note's terms on every past day since the tokens listed.
- **Market hours matter:** the two sources must agree within 3% while the US stock market is open and within 2%
  while it is closed, and a note can fix at the US close instead of on a weekend price.
- **CoinMarketCap's BNB Chain DEX data** sizes collateral: the issue flow suggests a haircut from each token's
  liquidity and daily range, and warns when a pledge is too large to sell.
- **Atlas's signed prices** show the live level on a note's page; the server checks Atlas's signature first.

Without either provider a stock-token note cannot fix a price.

## What was built at the hackathon

Everything after the git tag `pre-hackathon` (`git log pre-hackathon..main`). Before it: the note engine, the
keepers, the app and Chainlink-priced notes on other chains.

| Built at the hackathon | Where |
|---|---|
| Atlas Multi-Feed reads (`fetch(bytes4)`), pinned to one block for every keeper node | `packages/core/src/feed-rpc.ts`, `products/atlas-feeds.ts` |
| Stock tokens as underlyings and as collateral, priced per token | `packages/core/src/products/params.ts` |
| CoinMarketCap second-source check and five-minute history | `packages/core/src/cmc.ts` |
| Both in the Chainlink CRE keeper and the fallback keeper | `cre/notes-keeper-evm`, `services/keeper-fallback` |
| Back-test on CoinMarketCap's daily history | `packages/core/src/products/backtest.ts`, `GET /api/market/history`, `app/src/components/Backtest.tsx` |
| Market-hours rule for the second source | `packages/core/src/cmc.ts` (`usMarketOpen`, `secondSourceTolerance`) |
| Liquidity-aware collateral from CoinMarketCap DEX data | `packages/core/src/products/liquidity.ts`, `GET /api/market/liquidity`, `app/src/components/issue/CollateralMarket.tsx` |
| Atlas signed prices, signature verified server-side | `packages/core/src/atlas-signed.ts`, `GET /api/market/atlas`, `app/src/components/LivePrices.tsx` |
| Tests | `packages/core/test/atlas-feeds.test.ts`, `cmc.test.ts`, `backtest.test.ts`, `liquidity.test.ts`, `services/edge/test/api.test.ts` |

## BNB Chain components

| What | Address |
|---|---|
| Atlas Multi-Feed (prices, BNB Chain mainnet) | `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` |
| Note engine (BNB Chain testnet, chain id 97) | `0x37184A9D436B9e8F2225cAFd5474E60A5d18FDEb` |
| Lens (read model) | `0xF486dfaa1111Dd20B931b304Ec7d0B967463a086` |
| Test dollar nmUSD | `0x199816ce7e0b2366b408D6F8c3158844f06E3099` |
| Faucet (test dollar and stock-token stand-ins) | `0xC7cdfBfE828E99b9bdF14CF1aBaA49b44922c8A6` |

Binance's stock tokens exist on BNB Chain mainnet only, so the testnet notes use stand-in tokens with the real
symbols and read the real mainnet prices ([docs/BNB-CHAIN.md](docs/BNB-CHAIN.md)).

A note that ran end to end on these prices: [note 3 on BNB Chain testnet](https://bnb.notes.markets/app/note/bnb-testnet:0x37184a9d436b9e8f2225cafd5474e60a5d18fdeb:3)
(TSLAB and NVDAB, 15-minute median, 5% disruption limit; start price
[0x7756…62bc](https://testnet.bscscan.com/tx/0x7756815575ce099b8d049c904b4e0df307b7194bd1c06d80804b6227547362bc),
three checks, redeemed at 1.075 per unit).

## Run it

Needs Node 20+, and for the keeper [Bun](https://bun.sh) and the [Chainlink CRE CLI](https://docs.chain.link/cre).

```bash
npm install
npm run typecheck && npm test          # all unit tests, no keys needed

# Keys (never committed: .keys/ is ignored)
mkdir -p .keys
echo '{"apiKey":"<your CoinMarketCap Pro API key>"}' > .keys/cmc.json

# Issue a demo note on stock tokens on BNB Chain testnet (needs funded testnet wallets in .keys/, see docs/DEPLOY.md)
CHAIN=bnb-testnet NOTE=bstock FIXING_WINDOW=15 DISRUPTION=5 STRIKE_IN=420 OBS_EVERY=600 npx tsx scripts/seed-note.ts

# Run the keeper for BNB Chain: reads Atlas and CoinMarketCap, writes the prices to the note
npx tsx scripts/cre-config.ts bnb
TARGET=bnb-settings bash scripts/keeper-loop.sh

# The site (landing page, app and API in one Cloudflare Worker)
npm run build:web
cd web && printf 'CMC_API_KEY=<your key>\nATLAS_API_KEY=<your Atlas key, optional: live prices>\n' > .dev.vars && wrangler dev
```

API keys stay on the server: the keeper reads its key as a workflow secret (`cre/secrets.yaml`), the site as a
Worker secret. Neither is in the app bundle or this repository.

Testnet only; the contracts are not audited.

---

# The rest of the product

The same engine also runs notes on Robinhood Chain testnet and Base Sepolia with Chainlink prices, and can back a
note on one chain with tokens locked on another. That work predates the hackathon.

Structured notes on stocks, crypto, forex and commodities that anyone can issue and sell, on two testnets: **Robinhood
Chain testnet** (chain id 46630) and **Base Sepolia** (chain id 84532). Each note runs on one of them, its home chain:
issuance, subscriptions, the note's ERC-20 units, the escrow, coupons, redemption and every **Chainlink CRE** report
happen there. A note raises the home chain's dollar for the issuer (USDG on Robinhood Chain, USDC on Base) against
collateral valued by Chainlink after a haircut: pledged into the note on its own chain (USDG, WETH, or Robinhood's
TSLA, AMZN, AMD and PLTR stock tokens on Robinhood Chain; USDC, WETH or the B20 stock stand-ins on Base), or locked on
the other chain and carried by **Chainlink CCIP** ([docs/CROSS-CHAIN.md](docs/CROSS-CHAIN.md)). The headline case:
Robinhood's stock tokens stay locked on Robinhood Chain and collateralise a structured note on Base. Below the knock-in
barrier a physically settled note delivers the token itself where its chain has one (the stock tokens or WETH on
Robinhood Chain; WETH on Base, and TSLA, AMZN, NVDA, AAPL, MSFT, META in the B20 stand-ins at shares ÷ multiplier);
everything else settles in cash. **Stocks on Base:** Coinbase's tokenized stocks (B20) exist on Base mainnet only, so
Base Sepolia gets notes.markets' own test stand-ins (TSLAc, AMZNc, NVDAc, AAPLc, MSFTc, METAc: same symbol, decimals
and multiplier as the real token, no value, a public rate-limited faucet), valued with Chainlink's per-token feeds on
Base mainnet; moving to mainnet is a change of addresses ([docs/BASE-STOCKS.md](docs/BASE-STOCKS.md); not deployed
yet). The issuer funds each payment before it falls due, or the holders are
paid what they are owed from the collateral, which recovers up to its value
([docs/NOTE-ECONOMICS.md](docs/NOTE-ECONOMICS.md)). Chainlink CRE is the calculation agent: it pays each coupon into the
note on its payment date, and holders claim it from their portfolio whenever they like, with a receipt per claim
([docs/ERC20-NOTES.md](docs/ERC20-NOTES.md) §5). Testnet only; the contracts are not audited.

Underlyings: any price in the Chainlink catalogue (141 USD feeds: stocks, crypto, forex, commodities;
[docs/UNDERLYINGS.md](docs/UNDERLYINGS.md)), generated from Chainlink's reference data directory by
`scripts/feeds-catalogue.ts`, the same on both chains. Equities come from Robinhood Chain **mainnet** Chainlink feeds,
read by CRE over its HTTP capability; crypto, forex and commodities from Ethereum mainnet (a few from Arbitrum One).
Collateral is a separate whitelist of tokens a note can lock (above). Cross-chain collateral is wired both ways
(Robinhood Chain note ← USDC/WETH, and the B20 stand-ins once deployed, on Base; Base note ← USDG/WETH/TSLA/AMZN/AMD/PLTR
on Robinhood Chain); the Base engine and the two gateway–vault pairs are deployed with `scripts/deploy-testnets.sh` and
`scripts/deploy-crosschain.sh`, the stand-ins with `scripts/deploy-base-stocks.sh` ([docs/DEPLOY.md](docs/DEPLOY.md)).

- Site: https://notes.markets · App: https://notes.markets/app
- Overview: [docs/OVERVIEW.md](docs/OVERVIEW.md) · Demo: [docs/DEMO.md](docs/DEMO.md) · Deploy: [docs/DEPLOY.md](docs/DEPLOY.md)

| Path | What it is |
|---|---|
| `packages/core` | BPMN, compiler (EVM definition bytes), products and reference payoffs, templates, AI pipeline, keeper decisions |
| `packages/evm-engine` | `FlowEngine.sol`, `NotesLens.sol`, the cross-chain contracts (HomeGateway, RemoteVault, RemoteReceipt), the B20 stock stand-ins (`src/base-stocks`: B20StandIn, B20StockFaucet, B20MultiplierFeed), Foundry tests, deploy scripts (the retired test tokens and faucet stay only for local tests) |
| `packages/sdk` | chain adapter (viem), events and the read model |
| `cre/notes-keeper-evm` | the Chainlink CRE workflow: reports on both chains, flushes each home gateway, checks every vault |
| `services/indexer`, `services/api` | Postgres read model and the REST/SSE API (`services/edge`: the same on D1 in the Worker) |
| `services/keeper-fallback` | the same keeper logic for chains without CRE (off by default) |
| `scripts/issuer-bot.ts` | the issuer's side, automated for demos and tests: funds payments as they fall due (or leaves one unfunded); pushes payouts only for notes that opt in (`PUSH=1` for all); withdraws and pushes cross-chain receipts. One instance per chain |
| `app`, `landing`, `web` | the app, the landing page, and the Cloudflare Worker that serves both |

```bash
npm install && npm run typecheck && npm test        # unit tests
npm run test:evm                                    # Foundry (fetch lib/ first: packages/evm-engine/README.md)
bash scripts/e2e-cre-evm.sh                         # CRE simulator + fallback keeper on a local Robinhood Chain testnet fork
REHEARSAL=1 HOME_CHAIN=base-sepolia ASSET_CHAIN=robinhood-testnet bash scripts/deploy-crosschain.sh   # a cross-chain pair on anvil forks
REHEARSAL=1 EXTEND_PAIR=1 bash scripts/deploy-base-stocks.sh             # the B20 stand-ins on an anvil fork of Base Sepolia
E2E=1 bash scripts/dev-local.sh                     # the whole stack locally, driven by a headless browser
```
