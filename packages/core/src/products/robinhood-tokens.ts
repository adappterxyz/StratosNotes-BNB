/**
 * Robinhood's stock tokens on Robinhood Chain MAINNET, the tokens behind the catalogue's stock feeds.
 *
 * Why notes need them (docs/CORPORATE-ACTIONS.md): Chainlink's "Robinhood TSLA / USD" feed is the price of ONE
 * ROBINHOOD TOKEN, not of one share: share price x the token's `uiMultiplier()` (ERC-8056). Splits and reinvested
 * dividends move the multiplier and leave balances alone, so the feed does not jump on a split. Every stock
 * underlying is therefore a Robinhood-token price, and:
 *  - a note that delivers or pledges Robinhood's own token needs nothing (same token priced and held);
 *  - a note that delivers ANOTHER issuer's token for it (a B20 stock on Base, a bStock on BNB Chain) owes
 *    1 / strike Robinhood tokens' worth of shares: 1 / strike x robinhoodMultiplier / thatTokenMultiplier tokens;
 *  - a bStock, valued as stock price x its multiplier, needs the plain share price: feed / robinhoodMultiplier.
 * The keeper also holds a stock observation while Robinhood processes a corporate action on the token
 * (`oraclePaused()`, or a multiplier change taking effect: corporateActionHold in keeper.ts).
 *
 * Addresses: Robinhood's public asset list (api.robinhood.com/rhj/assets, chain id 4663), each checked on-chain
 * 2026-11-21 (`symbol()` = the ticker; `uiMultiplier()`, `newUIMultiplier()`, `effectiveAt()`, `oraclePaused()`
 * answer). That day 14 of the 33 multipliers were above 1 (reinvested dividends: MSFT 1.0017, NVDA 1.0008…) and
 * SNDK read 8 (a split).
 *
 * Pure data: no Node APIs (bundled into the CRE workflow).
 */
import type { CatalogueSymbol } from './feeds-catalogue';
import { FEED_CATALOGUE } from './feeds-catalogue';
import { MULTIPLIER_BOUNDS, MULTIPLIER_STALENESS, type FeedSpec } from './base-stocks';

/** CRE chain-selector name of Robinhood Chain mainnet (read over HTTP JSON-RPC: HTTP_FEED_CHAINS). */
export const RH_TOKEN_CHAIN = 'robinhood-mainnet';

/** Robinhood's stock token per ticker (Robinhood Chain mainnet). */
export const RH_STOCK_TOKENS = {
  AAPL: '0xaF3D76f1834A1d425780943C99Ea8A608f8a93f9',
  AMD: '0x86923f96303D656E4aa86D9d42D1e57ad2023fdC',
  AMZN: '0x12f190a9F9d7D37a250758b26824B97CE941bF54',
  ASML: '0x47F93d52cBeC7C6D2CfC080e154002370a60dAEA',
  BABA: '0xad25Ac6C84D497db898fa1E8387bf6Af3532a1c4',
  CLSK: '0xcBB95BBF36099d34dA091dc6Fa6F49EfA257Cee3',
  COIN: '0x6330D8C3178a418788dF01a47479c0ce7CCF450b',
  CRCL: '0xdF0992E440dD0be65BD8439b609d6D4366bf1CB5',
  CRWV: '0x5f10A1C971B69e47e059e1dC91901B59b3fB49C3',
  DELL: '0x941AE714EC6D8130c7B75d67160Ca08f1e7d11Dd',
  EWY: '0x7f0aBeF0C07280F82c6a08ead09dEd6BAE2C13Fc',
  GME: '0x1b0E319c6A659F002271B69dB8A7df2F911c153E',
  GOOGL: '0x2e0847E8910a9732eB3fb1bb4b70a580ADAD4FE3',
  INTC: '0xc72b96e0E48ecd4DC75E1e45396e26300BC39681',
  IONQ: '0x558378E000D634A36593E338eBacdd6207640EfE',
  META: '0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35',
  MSFT: '0xe93237C50D904957Cf27E7B1133b510C669c2e74',
  MSTR: '0xec262a75e413fAfD0dF80480274532C79D42da09',
  MU: '0xfF080c8ce2E5feadaCa0Da81314Ae59D232d4afD',
  NBIS: '0x9D9c6684F596F66a64C030B93A886D51Fd4D7931',
  NVDA: '0xd0601CE157Db5bdC3162BbaC2a2C8aF5320D9EEC',
  ORCL: '0xb0992820E760d836549ba69BC7598b4af75dEE03',
  PLTR: '0x894E1EC2D74FFE5AEF8Dc8A9e84686acCB964F2A',
  QQQ: '0xD5f3879160bc7c32ebb4dC785F8a4F505888de68',
  RGTI: '0x284358abc07F9359f19f4b5b4aC91901Be2597Ba',
  RKLB: '0x3b14C39E89D60D627b42a1A4CA45b5bb45Fc12e2',
  SLV: '0x411eFb0E7f985935DAec3D4C3ebaEa0d0AD7D89f',
  SNDK: '0xB90A19fF0Af67f7779afF50A882A9CfF42446400',
  SPCX: '0x4a0E65A3EcceC6dBe60AE065F2e7bb85Fae35eEa',
  SPY: '0x117cc2133c37B721F49dE2A7a74833232B3B4C0C',
  TSLA: '0x322F0929c4625eD5bAd873c95208D54E1c003b2d',
  TSM: '0x58FfE4a942d3885bAa22D7520691F611EF09e7AA',
  USO: '0xa30FA36Db767ad9eD3f7a60fC79526fB4d56D344',
} as const satisfies Partial<Record<CatalogueSymbol, `0x${string}`>>;
export type RhStockTicker = keyof typeof RH_STOCK_TOKENS;
export const isRhStockTicker = (s: string): s is RhStockTicker => s in RH_STOCK_TOKENS;

const TOKENS = new Set<string>(Object.values(RH_STOCK_TOKENS).map((a) => a.toLowerCase()));
/** The stock feed of each token's ticker (lowercase feed address -> lowercase token address). */
const TOKEN_BY_FEED = new Map<string, string>(
  FEED_CATALOGUE.flatMap((f) =>
    f.feedChain === RH_TOKEN_CHAIN && isRhStockTicker(f.symbol)
      ? [[f.feed.toLowerCase(), RH_STOCK_TOKENS[f.symbol].toLowerCase()] as [string, string]]
      : [],
  ),
);

/** True when an oracle reference reads a Robinhood token's multiplier (its `feed` is the token itself). */
export const isRhMultiplierRef = (f: { feed: string; feedChain: string }): boolean =>
  f.feedChain === RH_TOKEN_CHAIN && TOKENS.has(f.feed.toLowerCase());

/** The Robinhood token priced by a stock feed (lowercase), or undefined for any other feed. */
export const rhTokenOfFeed = (f: { feed: string; feedChain: string }): string | undefined =>
  f.feedChain === RH_TOKEN_CHAIN ? TOKEN_BY_FEED.get(f.feed.toLowerCase()) : undefined;

/**
 * A Robinhood token's multiplier as an oracle field reads it: the `feed` is the token (the keeper calls
 * `uiMultiplier()` on it, not `latestRoundData()`: isRhMultiplierRef), bounded like every multiplier.
 */
export const rhMultiplierFeed = (ticker: RhStockTicker): FeedSpec => ({
  symbol: ticker,
  feed: RH_STOCK_TOKENS[ticker],
  feedChain: RH_TOKEN_CHAIN,
  minPrice: MULTIPLIER_BOUNDS.min,
  maxPrice: MULTIPLIER_BOUNDS.max,
  staleness: MULTIPLIER_STALENESS,
});

/** The oracle field a delivery reads the Robinhood multiplier of its underlying into (at the final observation). */
export const refMultiplierField = (ticker: string) => `rmult_${ticker}`;
