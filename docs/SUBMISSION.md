# notes.markets on BNB Chain

CoinMarketCap × Atlas challenge, BNB Hack Bangkok, 25 to 27 November 2026.

- **Demo:** https://bnb.notes.markets
- **Repository:** https://github.com/adappterxyz/StratosNotes-BNB
- **Team:** Notes.markets · Kwang Wei Sim: founder and build; King: go-to-market · contact: kwangwei@sol59.com

## The problem, and who it is for

Structured notes are how banks sell yield on stocks: a coupon while the stock holds above a line, a loss if it ends
below a barrier. They are sold over the counter, in large tickets, and the bank is both the issuer and the party
that decides the prices.

Tokenized stocks on BNB Chain make an open version possible: any desk, fund or protocol issues a note on a stock
token, locks collateral in it, and investors buy units. What stops this from being safe is the price. A note pays or
fails on four or five prices, nobody can reverse one afterwards, and stock tokens trade through nights and weekends
when the exchange is shut and markets are thin.

notes.markets is for issuers who want to raise stablecoins against stock tokens, and for investors who want a
defined payoff on those stocks without trusting the issuer's price.

## Which data we use, and why

**Atlas (on-chain feeds, BNB Chain mainnet).** One Multi-Feed contract, `fetch(bytes4)`, fourteen feeds: the index ETFs
SPYB and QQQB, and TSLAB, NVDAB, AAPLB, MSFTB, AMZNB, GOOGLB, METAB, COINB, MSTRB, AMDB, PLTRB, NFLXB.

- It sets every price of a stock-token note: start price, coupon checks, barrier.
- It values stock tokens locked as collateral.
- Its signed price API gives a note's page the live price between checks. Our server verifies Atlas's signature on
  every reply before showing it.
- The same API's quality rating of each feed is a control in the keeper: a check waits while Atlas rates a feed's
  sources CRITICAL or SPLIT_MARKET. The rating is unsigned, so it can delay a check but never change a price.
- We chose it because it prices the token itself around the clock. An oracle that follows the stock exchange stands
  still at the weekend, and a note check that falls on a Saturday would read Friday's price.

**CoinMarketCap (Pro API).**

- `/v3/cryptocurrency/quotes/historical` at five-minute intervals: the second source. No Atlas price is written
  unless CoinMarketCap's latest price agrees with it: within 3% while the US stock market is open, 2% while it is
  closed and the token trades alone on thinner markets. Otherwise the check waits.
- The same endpoint as history: Atlas keeps only the latest price on-chain, so the median over the 15 to 60 minutes
  before a check, and the rule that postpones a check made during a move of more than 5 to 20%, are computed on
  CoinMarketCap's points.
- The same endpoint at daily intervals: before issuing, and on every note's page, the note's terms are replayed
  from each day since the tokens listed.
- `/v1/dex/token` on BNB Chain (network 14): each token's DEX liquidity, 24-hour volume and range. The issue flow
  uses it to suggest a collateral haircut and to refuse-by-warning a pledge too large for the market it would be
  sold into.
- `/v1/cryptocurrency/map`: matches each token to its BNB Chain contract address.

A stock-token note cannot fix a price without both. Details and failure handling: [ATLAS-CMC.md](ATLAS-CMC.md).

## BNB Chain components

| What | Address |
| --- | --- |
| Atlas Multi-Feed, BNB Chain mainnet | `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa` |
| Note engine, BNB Chain testnet | `0x37184A9D436B9e8F2225cAFd5474E60A5d18FDEb` |
| Lens (read model) | `0xF486dfaa1111Dd20B931b304Ec7d0B967463a086` |
| Test dollar nmUSD | `0x199816ce7e0b2366b408D6F8c3158844f06E3099` |
| Faucet | `0xC7cdfBfE828E99b9bdF14CF1aBaA49b44922c8A6` |

Proof it runs: note 3 on BNB Chain testnet (TSLAB and NVDAB) was issued, fixed, checked three times and redeemed
on 25 November with every price from Atlas, confirmed by CoinMarketCap. Start price transaction:
`0x7756815575ce099b8d049c904b4e0df307b7194bd1c06d80804b6227547362bc`.

The notes run on testnet with stand-in tokens, because Binance's stock tokens exist on mainnet only. The prices are
the real mainnet ones.

## Verify it yourself

| Open this | What it proves |
| --- | --- |
| [Note 3 on BNB Chain testnet](https://bnb.notes.markets/app/note/bnb-testnet:0x37184a9d436b9e8f2225cafd5474e60a5d18fdeb:3) | A stock-token note ran its whole life: start price, three checks, redemption at 1.075 per unit. Each step on the page links to its transaction. |
| [Engine contract `0x37184A9D436B9e8F2225cAFd5474E60A5d18FDEb`](https://testnet.bscscan.com/address/0x37184A9D436B9e8F2225cAFd5474E60A5d18FDEb) | The notes are a real contract on BNB Chain testnet, and its transaction list shows the keeper's price reports and the payments. |
| [Start-price transaction `0x7756…62bc`](https://testnet.bscscan.com/tx/0x7756815575ce099b8d049c904b4e0df307b7194bd1c06d80804b6227547362bc) | The keeper wrote note 3's start prices on-chain. The values are the TSLAB and NVDAB prices read from the Atlas Multi-Feed. |
| [Signature-verified Atlas prices](https://bnb.notes.markets/api/market/atlas?symbols=TSLAB,NVDAB) | The server calls Atlas's signed price API live and serves a price only when Atlas's reporter key signed it (`"verified": true`, with the signer's address and Atlas's quality status). |

What these do not show: the CoinMarketCap calls themselves. Those happen inside the keeper, off-chain, and leave no
on-chain record; a price reaching the contract means the check passed, but the evidence for the check is the code
(`packages/core/src/cmc.ts`, `cre/notes-keeper-evm`) and its tests, not these links.

## New work and prior work

The note engine, keepers and app existed before the event, with Chainlink prices on other chains. Built during the
hackathon: everything involving Atlas and CoinMarketCap, stock tokens as underlyings, and the back-test. The git tag
`pre-hackathon` marks the line.

## What we would build next

1. **Mainnet with the real tokens**, after an audit of the engine.
2. **Atlas signed prices verified in the contract**, so the note checks Atlas's signature itself.
3. **Haircuts that move:** today the liquidity-based haircut is advice at issuance. Next, the note re-reads the
   token's liquidity at every check and calls for more collateral when the market thins.
4. **A deadline for disagreement:** what a note does when the two sources stay apart past a set time.
5. **More tokens:** Atlas prices about 100 stock tokens and ETFs on BNB Chain; we list fourteen, seven of them
   with a testnet stand-in that can be locked as collateral or delivered.
