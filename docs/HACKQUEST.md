# HackQuest project info

Copy each field into the HackQuest project page. Field names may differ slightly on the form.

## Project name

notes.markets on BNB Chain

## Tagline / one-liner

Structured notes on Binance's stock tokens, priced by Atlas and checked by CoinMarketCap.

## Track / prize

CoinMarketCap × Atlas challenge

## Tags / sector

RWA · DeFi · Oracles · Stock tokens

## Short description (about 300 characters)

Anyone can issue a structured note on BNB Chain, written on Binance's stock tokens: a coupon while the stocks hold a
line, a loss below a barrier. Atlas sets every price on-chain, around the clock; CoinMarketCap must agree, or the
note waits. Collateral is locked in the note and every payment is automatic.

## Full description

**Problem.** Banks sell structured notes: "earn 2.5% a quarter while Tesla and Nvidia stay above 70% of today's
price; below that, you take the loss." They are opaque, over the counter, and closed to most people. On-chain they
can be open to anyone, but a note pays or fails on a handful of prices, and one wrong price moves real money that
nobody can claw back. Stock tokens make it harder: they trade at weekends on thin markets, while oracles that follow
the stock exchange stand still.

**What we built.** Anyone can issue a note on BNB Chain on 14 of Binance's stock tokens (Tesla, Nvidia, Apple, the
S&P 500 and Nasdaq-100 ETF tokens and more), backed by collateral locked in the note, with every check and payment
run by a Chainlink CRE keeper.

**How the data is used.**
- **Atlas sets every price:** its Multi-Feed contract on BNB Chain gives each token's price, live around the clock.
- **CoinMarketCap must agree:** within 3% while the US market is open, 2% while it is closed. Otherwise the check
  waits and retries every minute.
- **Atlas's own quality rating is a stop:** when Atlas rates a feed's sources critical or split, the check waits.
- **CoinMarketCap's five-minute history** gives each check a median, so a spike that reverses can't set a coupon,
  and a check during a violent move is postponed.
- **CoinMarketCap's daily history** replays the note's terms on every past day: how often it paid, how often it lost.
- **CoinMarketCap's DEX data on BNB Chain** tells an issuer how much their locked stock tokens count for, given
  each token's liquidity.
- **Atlas's signed prices** show the live level on a note's page; our server checks Atlas's signature first.

**Proof.** Three notes have run end to end on BNB Chain testnet on real mainnet prices, one redeeming at 1.075 per
unit after three checks. Another is live now.

**Next.** Mainnet with the real tokens after an audit; Atlas's signature verified inside the contract; a deadline
rule for when the two sources disagree for long.

## Links

- **Live demo:** https://bnb.notes.markets
- **App:** https://bnb.notes.markets/app
- **GitHub:** https://github.com/adappterxyz/StratosNotes-BNB
- **Finished note:** https://bnb.notes.markets/app/note/bnb-testnet:0x37184a9d436b9e8f2225cafd5474e60a5d18fdeb:3
- **Write-up:** https://github.com/adappterxyz/StratosNotes-BNB/blob/main/docs/SUBMISSION.md
- **Demo video (52 seconds):** https://github.com/adappterxyz/StratosNotes-BNB/blob/main/docs/video/notes-markets-bnb-demo.mp4
  (direct file: https://github.com/adappterxyz/StratosNotes-BNB/raw/main/docs/video/notes-markets-bnb-demo.mp4)

## Tech stack

Solidity (Foundry), TypeScript, Chainlink CRE, viem, React, Cloudflare Workers + D1, Atlas Oracle, CoinMarketCap Pro
API

## Deployed contracts (BNB Chain testnet, chain 97)

- Note engine: `0x37184A9D436B9e8F2225cAFd5474E60A5d18FDEb`
- Lens: `0xF486dfaa1111Dd20B931b304Ec7d0B967463a086`
- nmUSD (test dollar): `0x199816ce7e0b2366b408D6F8c3158844f06E3099`
- Faucet: `0xC7cdfBfE828E99b9bdF14CF1aBaA49b44922c8A6`
- Atlas Multi-Feed read (BNB Chain mainnet): `0xeace519ebb14fb8404fa6ddd23c3b34abade44aa`

## Prior work (if the form asks)

The note engine, keepers and app existed before the hackathon (git tag `pre-hackathon`). All Atlas and
CoinMarketCap work was built at BNB Hack Bangkok: `git log pre-hackathon..main`.

## Team

Notes.markets · kwangwei@sol59.com
