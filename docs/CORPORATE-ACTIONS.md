# Corporate actions: splits, dividends and the stock tokens

How a note behaves when a stock splits or pays a dividend, on each chain. Checked on-chain and against the issuers'
documentation on 2026-11-21.

## What the issuers do

No stock token changes a holder's balance in a corporate action. Each token has a **multiplier**: the number of shares
one token stands for. A split or a reinvested dividend changes the multiplier.

| | Robinhood (Robinhood Chain) | Coinbase B20 (Base) | Binance bStocks (BNB Chain) |
|---|---|---|---|
| Multiplier | `uiMultiplier()` | `multiplier()`, `uiMultiplier()` | `uiMultiplier()` |
| Scheduled change | `newUIMultiplier()`, `effectiveAt()` | yes | `pendingMultiplier`, `effectiveAt` |
| Pause during an action | `oraclePaused()` on the token (advisory) | the feed holds its last value | a shared pause manager |
| Chainlink feed of the token | yes | yes | no |

Each issuer runs its own multiplier, so the three differ for the same stock. On 2026-11-21 Robinhood's mainnet tokens
read 1.0000 for TSLA, 1.0008 for NVDA, 1.0017 for MSFT and 8 for SNDK (a split).

**The Chainlink feed of a Robinhood stock is the price of one Robinhood token**: share price x multiplier
(`RHTSLA / USD`). A 2:1 split halves the share price and doubles the multiplier, so the feed does not move. Reinvested
dividends make it drift above the share price.

## What that means for a note

Every stock underlying reads the Robinhood feed, on every note chain.

| | Barriers, coupons, cash settlement | Collateral value | Physical delivery |
|---|---|---|---|
| Robinhood Chain | token price: no jump on a split | the same feed: correct | 1 / strike of the same token: correct |
| Base | the same | Coinbase's own token feed: correct | `1 / strike x rmult / mult` TSLAc |
| BNB Chain | the same | `feed x pxm / pxr` | `1 / strike x rmult / mult` TSLAB |

- `1 / strike` is a number of **Robinhood tokens**. Times Robinhood's multiplier (`rmult_TSLA`) it is the shares owed;
  divided by the delivered token's multiplier (`mult_TSLA`) it is the tokens to deliver. Both are read at the final
  observation. If both issuers apply the same split the two cancel; if one reinvests a dividend and the other does
  not, the holder still receives the shares owed.
- A bStock has no feed of its own. It is worth share price x its multiplier, and the share price is the Robinhood feed
  divided by Robinhood's multiplier: `px_TSLAB = pxs_TSLAB x pxm_TSLAB / pxr_TSLAB`.
- The underlying is a total-return price: reinvested dividends lift it slightly, in the holders' favour on a barrier.

Code: `packages/core/src/products/robinhood-tokens.ts` (the 33 mainnet tokens, one per stock feed),
`instantiate.ts` (`perUnitDelivery`, `priceFields`), `params.ts` (`deliverableToken().reference`,
`collateralRefMultiplierFeed`, `stockTokenNotes`).

## The keeper

- **Robinhood's multiplier** is read from the mainnet token (`uiMultiplier()`), in the same JSON-RPC batch and at the
  same block as the prices (`feedBatchBody`, `decodeTokenBatch`). An oracle field whose `feed` is a Robinhood token is
  a multiplier read (`isRhMultiplierRef`); the definition format is unchanged.
- **Hold during an action** (`corporateActionHold`): a stock price, or a multiplier, is not used while the token's
  `oraclePaused()` is true, or within an hour either side of a multiplier change (`CORPORATE_ACTION_WINDOW`). The
  report is skipped and retried on the next run, so the observation is taken once the action is through.
- Every multiplier a note reads is bounded 0.01 to 100 by the engine (`MULTIPLIER_BOUNDS`); outside it the final
  observation stops until the bounds are reviewed.
- The fallback keeper does the same (`services/keeper-fallback/src/keeper.ts`).

## Limits

- **Mergers, delistings, spin-offs and ticker changes are not handled.** No multiplier covers them and none of the
  three issuers documents a treatment. A note has no early-settlement path for them yet.
- **Timing between issuers.** The hold covers Robinhood's token. If Coinbase or Binance applies a split hours apart
  from Robinhood, a final observation in between delivers against multipliers that are each correct for their own
  token, so the shares delivered are still right; a bStock's value is too, since it uses the bStock's own multiplier.
- **A default before maturity** values a deliverable at its strike per token, without multipliers (they are read only
  at the final observation).
- **bStock prices** come from the stock's Chainlink price and the token's multiplier, not from the bStock's traded
  price. The two can differ, mostly when the US market is closed. APRO publishes traded-price feeds for 12 bStocks (4
  of our 7); they are not used.
- **Cash dividends** are not passed to note holders.
- **Testnet.** The Base and BNB Chain tokens are our stand-ins: their multipliers follow the real ones only when the
  `sync` scripts' owner calls are sent. Robinhood's testnet tokens have their own multiplier (1.0), while prices and
  Robinhood's multiplier come from mainnet.
