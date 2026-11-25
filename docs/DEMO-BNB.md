# Demo: three minutes at BNB Hack Bangkok

For the CoinMarketCap × Atlas challenge. It works as a live demo or as a recorded video of up to three minutes. Every
screen below is on https://bnb.notes.markets; nothing needs a wallet until the optional last step.

The one sentence to land: **a structured note is only as good as its prices, so we fix every price on Atlas and
refuse to write it unless CoinMarketCap agrees.**

## Before you start

| Check | How |
| --- | --- |
| The keeper is running | `pm2 list` shows `sn-bnb-keeper` online |
| An active note exists | Note 4 on BNB Chain testnet runs until 27 Nov, about 18:50 UTC. For a fresh one that finishes in 40 minutes: `CHAIN=bnb-testnet NOTE=bstock FIXING_WINDOW=15 DISRUPTION=5 STRIKE_IN=420 OBS_EVERY=600 SUBS=10,5 UNSOLD=15 npx tsx scripts/seed-note.ts` |
| Prices answer | https://bnb.notes.markets/api/market/atlas?symbols=TSLAB,NVDAB returns `"verified":true` |

Have two tabs open: the finished note (note 3) and the active note (note 4).

- Finished: https://bnb.notes.markets/app/note/bnb-testnet:0x37184a9d436b9e8f2225cafd5474e60a5d18fdeb:3
- Active: https://bnb.notes.markets/app/note/bnb-testnet:0x37184a9d436b9e8f2225cafd5474e60a5d18fdeb:4

## Script

| Time | Screen | Say |
| --- | --- | --- |
| 0:00 | Front page | "Banks sell structured notes: a coupon while a stock holds a line, a loss if it ends below a barrier. We let anyone issue one on BNB Chain, on Binance's stock tokens, with the collateral locked in the note." |
| 0:20 | Active note, top of page | "This note pays 2.5% at each check while Tesla and Nvidia tokens stay above 70% of their start price. It pays or fails on four prices. If one of them is wrong, real money moves and nobody can undo it." |
| 0:40 | Same page: the fixing rule text and the "Now" line | "So every price is Atlas's on-chain price of the token on BNB Chain. Atlas prices the token itself, around the clock, so a check on a Saturday is not Friday's price. And it is only written if CoinMarketCap's price agrees: within 3% in market hours, 2% when the US market is closed and the token trades alone. This live line is Atlas's signed price; our server checks Atlas's signature before showing it." |
| 1:10 | Finished note: "Checks and payments" | "This one ran on 25 November. Start price, three checks, redeemed at 1.075. Each price is the 15-minute median of CoinMarketCap's history, because Atlas keeps only the latest value. A spike that reverses cannot set a coupon." Click the start-price transaction if time allows. |
| 1:35 | Same page: "How these terms would have done" | "Before anyone buys, the note's terms are replayed from every day since these tokens listed, on CoinMarketCap's daily prices: how often it redeemed early, how often it lost money." |
| 1:55 | Issue → BNB Chain → the Tesla and Nvidia note → Collateral step → pick TSLAB, size 100,000 | "An issuer can lock stock tokens instead of dollars. We read the token's liquidity on BNB Chain's DEXes from CoinMarketCap: 1.8 million dollars for Tesla. A pledge that is too large for that market counts for less, and we say so before the note exists." |
| 2:25 | Terminal: `pm2 logs sn-bnb-keeper --lines 20` (or a screenshot of it) | "The keeper is a Chainlink workflow. Each run reads Atlas on BNB Chain mainnet, pulls CoinMarketCap's history, compares them, and only then writes. If either source is missing, stale or out of line, the check waits." |
| 2:45 | Front page or repo README | "The note engine existed before this week. Everything with Atlas and CoinMarketCap was built here: the git tag pre-hackathon marks the line. Next: mainnet with the real tokens, and Atlas's signature verified inside the contract." |

## Lines worth having ready for questions

- **Why two sources?** Atlas is the only one that prices the token on-chain around the clock, but it keeps no history
  and is a single publisher. CoinMarketCap gives the history and the second opinion. Neither is decoration: with
  either one missing, a stock-token note cannot fix.
- **What happens when they disagree?** The check waits and is retried every minute. Payment dates do not move.
  There is no deadline yet; that is the first item in what we build next.
- **Is this on mainnet?** The prices are: Atlas's mainnet feeds and CoinMarketCap's data for the real tokens. The
  notes run on BNB Chain testnet with stand-in tokens, because the engine is not audited.
- **What is prior work?** The engine, the keepers and the app, with Chainlink prices on other chains. See
  `git log pre-hackathon..main` for what is new.
- **Which endpoints?** CoinMarketCap: `/v3/cryptocurrency/quotes/historical` (five-minute and daily),
  `/v1/dex/token` on BNB Chain, `/v1/cryptocurrency/map`. Atlas: the Multi-Feed contract
  `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` and the signed price API.
