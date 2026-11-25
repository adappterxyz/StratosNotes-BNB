# notes.markets on BNB Chain

CoinMarketCap × Atlas challenge, BNB Hack Bangkok, 25 to 27 November 2026.

- **Demo:** https://bnb.notes.markets
- **Repository:** https://github.com/adappterxyz/StratosNotes-BNB
- **Team:** Notes.markets · contact: kwangwei@sol59.com

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

**Atlas (on-chain feeds, BNB Chain mainnet).** One Multi-Feed contract, `fetch(bytes4)`, seven feeds: TSLAB, NVDAB,
AAPLB, MSFTB, AMZNB, GOOGLB, METAB.

- It sets every price of a stock-token note: start price, coupon checks, barrier.
- It values stock tokens locked as collateral.
- We chose it because it prices the token itself around the clock. An oracle that follows the stock exchange stands
  still at the weekend, and a note check that falls on a Saturday would read Friday's price.

**CoinMarketCap (Pro API).**

- `/v3/cryptocurrency/quotes/historical` at five-minute intervals: the second source. No Atlas price is written
  unless CoinMarketCap's latest price is within 3% of it. Otherwise the check waits.
- The same endpoint as history: Atlas keeps only the latest price on-chain, so the median over the 15 to 60 minutes
  before a check, and the rule that postpones a check made during a move of more than 5 to 20%, are computed on
  CoinMarketCap's points.
- The same endpoint at daily intervals: before issuing, and on every note's page, the note's terms are replayed
  from each day since the tokens listed.
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

## New work and prior work

The note engine, keepers and app existed before the event, with Chainlink prices on other chains. Built during the
hackathon: everything involving Atlas and CoinMarketCap, stock tokens as underlyings, and the back-test. The git tag
`pre-hackathon` marks the line.

## What we would build next

1. **Mainnet with the real tokens**, after an audit of the engine.
2. **Atlas signed prices verified in the contract**, so the note checks Atlas's signature itself.
3. **Liquidity-aware collateral:** haircuts set from each token's BNB Chain DEX liquidity (CoinMarketCap DEX data),
   and tighter limits while the US market is closed.
4. **A deadline for disagreement:** what a note does when the two sources stay apart past a set time.
5. **More tokens:** Atlas prices about 100 stock tokens and ETFs on BNB Chain; we list seven.
