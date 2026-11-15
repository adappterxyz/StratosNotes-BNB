/**
 * Stocks on Base (docs/BASE-STOCKS.md). Coinbase's tokenized US stocks (the B20 standard, custodian Alpaca) launched
 * on Base MAINNET on 2026-08-24; there is no Base Sepolia deployment (Coinbase's onchain registry
 * 0x3f3E8cf41cdd3b1D118c16471aB0113DfDDd5CaD has code on Base mainnet and none on Base Sepolia). So Base Sepolia gets
 * notes.markets' own TEST STAND-INS (packages/evm-engine/src/base-stocks/B20StandIn.sol): one per Coinbase token, the
 * same symbol, decimals and B20 reads, and the real token's multiplier, built so that moving to Base mainnet is a
 * change of addresses (BASE_STOCK_DEPLOYMENTS).
 *
 * Two kinds of price, kept apart:
 *  - Underlyings (strikes, observations, barriers) are SHARE prices: TSLA, NVDA… in the feed catalogue (FEEDS, read on
 *    Robinhood Chain mainnet). A note on TSLA owes shares.
 *  - Base stock COLLATERAL is valued per TOKEN: Chainlink's per-token feeds on Base mainnet ("Coinbase TSLA" …) publish
 *    share price x multiplier (8 decimals). So each token has its own valuation key, its symbol (TSLAc), never the
 *    share's (TSLA): pricing a token as a share would be off by its multiplier.
 * Physical delivery of a share underlying in a B20 token pays shares / multiplier token units; the note reads the
 * token's multiplier at its last observation through a B20MultiplierFeed next to the token (instantiate.ts).
 *
 * Pure data: no Node APIs (bundled into the CRE workflow).
 */
import type { CatalogueSymbol } from './feeds-catalogue';
import { BASE_SEPOLIA_STOCKS } from './base-stocks.deployed';

export { BASE_SEPOLIA_STOCKS } from './base-stocks.deployed';

/** An address that is not deployed yet (the placeholder in BASE_SEPOLIA_STOCKS until the deploy writes it). */
export const NOT_DEPLOYED = '0x0000000000000000000000000000000000000000' as const;
/** Whether an address is deployed (not the NOT_DEPLOYED placeholder). */
export const isDeployedAddress = (a: string | null | undefined): a is `0x${string}` =>
  !!a && /^0x[0-9a-fA-F]{40}$/.test(a) && !/^0x0{40}$/.test(a);

/** CRE chain-selector names: Base mainnet (the per-token price feeds) and Base Sepolia (the stand-ins' multipliers). */
export const BASE_MAINNET_FEED_CHAIN = 'ethereum-mainnet-base-1';
export const BASE_SEPOLIA_FEED_CHAIN = 'ethereum-testnet-sepolia-base-1';

/** The B20 tokens notes.markets takes: those with a Chainlink per-token feed on Base mainnet AND a share underlying. */
export type B20Symbol = 'TSLAc' | 'AMZNc' | 'NVDAc' | 'AAPLc' | 'MSFTc' | 'METAc';

/** One of Coinbase's B20 stock tokens, as Base mainnet has it. */
export interface B20Stock {
  /** The token's symbol on Base mainnet, also its collateral valuation key (never the share's ticker). */
  symbol: B20Symbol;
  /** The share it represents: the underlying (share-price feed) a physically settled note delivers it for. */
  ticker: CatalogueSymbol;
  name: string;
  /** Token decimals (8 on Base mainnet, eth_call decimals()). */
  decimals: number;
  /** The real token on Base mainnet (B20; base.org/assets, checked on-chain). */
  mainnetToken: `0x${string}`;
  /** Chainlink's per-token price feed on Base mainnet: share price x multiplier, 8 decimals, AggregatorV3. */
  feed: `0x${string}`;
  /** Bounds every collateral price must sit in: a tenth to ten times the price on 2026-11-15 (two significant figures). */
  minPrice: number;
  maxPrice: number;
}

/**
 * Coinbase's B20 stocks on Base mainnet with a Chainlink feed, checked 2026-11-15 with read-only eth_call on
 * https://mainnet.base.org: each feed's description() ("Coinbase TSLA" …), decimals() 8 and latestRoundData() (prices
 * below, last updated 2026-11-13/14, the market being closed); each token's symbol(), name(), decimals() 8 and
 * multiplier() (TSLAc, AMZNc, AAPLc, MSFTc 1e18; NVDAc 1.000537939576369481e18; METAc 1.000313792289598084e18). Feed
 * addresses: docs.base.org (tokenized stocks on Base, Chainlink price feeds); token addresses: base.org/assets.
 * GOOGL, MSTR, SNDK and SPCX also have feeds but are not in this first set (GOOGL, MSTR: candidates; SNDK, SPCX have no
 * share underlying in the catalogue).
 * Prices then: TSLAc 387.79, AMZNc 265.45, NVDAc 160.77, AAPLc 355.59, MSFTc 522.41, METAc 638.54.
 */
export const B20_STOCKS: Record<B20Symbol, B20Stock> = {
  TSLAc: {
    symbol: 'TSLAc',
    ticker: 'TSLA',
    name: 'Tesla',
    decimals: 8,
    mainnetToken: '0xb2000000000000000000001e800a7f5189430cD0',
    feed: '0xFaf869185383a24F8cb00e27BdA6b63B9905DCb4',
    minPrice: 39,
    maxPrice: 3_900,
  },
  AMZNc: {
    symbol: 'AMZNc',
    ticker: 'AMZN',
    name: 'Amazon',
    decimals: 8,
    mainnetToken: '0xb200000000000000000000d9192b6B456483C2E8',
    feed: '0x06A8E4b3aBB3B7543d8396FB2B763d22820cB295',
    minPrice: 27,
    maxPrice: 2_700,
  },
  NVDAc: {
    symbol: 'NVDAc',
    ticker: 'NVDA',
    name: 'NVIDIA',
    decimals: 8,
    mainnetToken: '0xb20000000000000000000078ee7ce2fE4908108C',
    feed: '0x04689a41629776563E6822F76f2e57D148d28513',
    minPrice: 16,
    maxPrice: 1_600,
  },
  AAPLc: {
    symbol: 'AAPLc',
    ticker: 'AAPL',
    name: 'Apple',
    decimals: 8,
    mainnetToken: '0xb200000000000000000000C2e324d24d7eEcd1fb',
    feed: '0x787f13dEa48Db0897CbCDD985de77809D837F988',
    minPrice: 36,
    maxPrice: 3_600,
  },
  MSFTc: {
    symbol: 'MSFTc',
    ticker: 'MSFT',
    name: 'Microsoft',
    decimals: 8,
    mainnetToken: '0xB200000000000000000000Ab99cFa739E253872B',
    feed: '0xeB10A6c9aa7E537aEd766C08c35Dae35B321b18c',
    minPrice: 52,
    maxPrice: 5_200,
  },
  METAc: {
    symbol: 'METAc',
    ticker: 'META',
    name: 'Meta Platforms',
    decimals: 8,
    mainnetToken: '0xb2000000000000000000008bC8786B856E61707C',
    feed: '0x6526aE6797A76123638b863AeE4dD27Ba4E4b27D',
    minPrice: 64,
    maxPrice: 6_400,
  },
};
export const B20_SYMBOLS = Object.keys(B20_STOCKS) as B20Symbol[];
export const isB20Symbol = (s: string): s is B20Symbol => s in B20_STOCKS;

/**
 * How old a per-token round may be: Chainlink's 24 h heartbeat in market hours, plus the weekend (the feeds hold their
 * last value while the market is closed or the token paused): the catalogue's rule for equities.
 */
export const B20_FEED_STALENESS = 345_600;

/** A price feed as a note's oracle field reads it (structurally an Underlying). */
export interface FeedSpec {
  symbol: string;
  feed: string;
  feedChain: string;
  minPrice: number;
  maxPrice: number;
  /** Oldest acceptable round, seconds (absent: the engine's default, 3600). */
  staleness?: number;
}

/** The per-token Chainlink feed a B20 collateral key is valued with (Base mainnet, token terms). */
export const b20PriceFeed = (s: B20Symbol): FeedSpec => ({
  symbol: s,
  feed: B20_STOCKS[s].feed,
  feedChain: BASE_MAINNET_FEED_CHAIN,
  minPrice: B20_STOCKS[s].minPrice,
  maxPrice: B20_STOCKS[s].maxPrice,
  staleness: B20_FEED_STALENESS,
});

/**
 * Bounds of a multiplier reading (shares per token): 0.01 to 100. A multiplier outside them (a 100:1 split) stops the
 * final observation, closed, until the bounds are reviewed; it never delivers a wrong amount.
 */
export const MULTIPLIER_BOUNDS = { min: 0.01, max: 100 } as const;
/**
 * The multiplier feed is live state (every read is "now"), so any round is fresh; the keeper reads EVM feeds at a
 * finalized block, which on Base Sepolia lags the head by up to a few hours, so allow a day.
 */
export const MULTIPLIER_STALENESS = 86_400;

/** The oracle field a B20 delivery reads its multiplier into (at the final observation), per underlying ticker. */
export const multiplierField = (ticker: string) => `mult_${ticker}`;

/** A deployment of the B20 stocks on one chain: each token and its B20MultiplierFeed, and the faucet (stand-ins). */
export interface B20Deployment {
  /** CRE chain-selector name of the chain the tokens (and their multiplier feeds) live on. */
  feedChain: string;
  /** B20StockFaucet (stand-ins only; the NOT_DEPLOYED placeholder on mainnet, where nobody mints). */
  faucet: `0x${string}`;
  tokens: Record<B20Symbol, { token: `0x${string}`; multiplierFeed: `0x${string}` }>;
}

/** The multiplier feed of a B20 token on Base Sepolia, as an oracle field reads it. */
export const b20MultiplierFeed = (s: B20Symbol, d: B20Deployment = BASE_SEPOLIA_STOCKS): FeedSpec => ({
  symbol: s,
  feed: d.tokens[s].multiplierFeed,
  feedChain: d.feedChain,
  minPrice: MULTIPLIER_BOUNDS.min,
  maxPrice: MULTIPLIER_BOUNDS.max,
  staleness: MULTIPLIER_STALENESS,
});

/** The stand-ins' faucet ABI (B20StockFaucet): claim one token, or every listed token at once. */
export const b20FaucetAbi = [
  {
    type: 'function',
    name: 'claim',
    stateMutability: 'nonpayable',
    inputs: [{ name: 'token', type: 'address' }],
    outputs: [],
  },
  { type: 'function', name: 'claimAll', stateMutability: 'nonpayable', inputs: [], outputs: [] },
  {
    type: 'function',
    name: 'nextClaimAt',
    stateMutability: 'view',
    inputs: [
      { name: 'token', type: 'address' },
      { name: 'account', type: 'address' },
    ],
    outputs: [{ type: 'uint256' }],
  },
] as const;

/** The B20 reads (real tokens and stand-ins alike). */
export const b20Abi = [
  { type: 'function', name: 'multiplier', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'scaledBalanceOf',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;
