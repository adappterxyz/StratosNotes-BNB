/**
 * Stocks on BNB Chain (docs/BNB-CHAIN.md). Binance's bStocks (tokenized US stocks, BEP-20, 1:1 backed by shares held
 * by a regulated custodian) launched on BNB Chain MAINNET in June 2026; there is no BNB Chain testnet deployment (the
 * mainnet tokens, their shared upgrade beacon 0x156d…93a3, the compliance contract and the pause manager have no code
 * on testnet, checked 2026-11-17). So BNB Chain testnet gets notes.markets' own TEST STAND-INS
 * (packages/evm-engine/src/bnb-stocks/BStockStandIn.sol): one per bStock, the same symbol, decimals (18) and bStocks
 * reads (uiMultiplier, balanceOfUI, toUIAmount…), and the real token's multiplier, so that moving to mainnet is a
 * change of addresses.
 *
 * How a bStock differs from a B20 stock on Base (base-stocks.ts):
 *  - No per-token Chainlink feed. A bStock is valued as SHARE PRICE x MULTIPLIER, both read by the note: the share
 *    from the feed catalogue (FEEDS.TSLA…, the same feed the underlyings use) and the multiplier from a
 *    BStockMultiplierFeed next to the token. The collateral key is the token's symbol (TSLAB), never the share's.
 *  - The multiplier is `uiMultiplier()` (1e18 = one share per token; dividends and forward splits raise it). Raw
 *    balances never rebase. Physical delivery pays shares / multiplier tokens, as for a B20.
 *  - Pause and a blocklist are the issuer's (a shared pause manager, a compliance contract); the stand-in has both.
 *
 * Pure data: no Node APIs (bundled into the CRE workflow).
 */
import type { CatalogueSymbol } from './feeds-catalogue';
import { MULTIPLIER_BOUNDS, MULTIPLIER_STALENESS, type FeedSpec } from './base-stocks';
import { BNB_TESTNET_DEPLOYMENT } from './bnb-stocks.deployed';

export { BNB_TESTNET_DEPLOYMENT } from './bnb-stocks.deployed';

/** CRE chain-selector name of BNB Chain testnet (the stand-ins' multiplier feeds, and the note chain). */
export const BNB_TESTNET_FEED_CHAIN = 'binance_smart_chain-testnet';

/** The bStocks notes.markets takes: a share underlying in the feed catalogue for each. */
export type BStockSymbol = 'TSLAB' | 'NVDAB' | 'AAPLB' | 'MSFTB' | 'AMZNB' | 'GOOGLB' | 'METAB';

/** One of Binance's bStocks, as BNB Chain mainnet has it. */
export interface BStock {
  /** The token's symbol on BNB Chain mainnet, also its collateral valuation key (never the share's ticker). */
  symbol: BStockSymbol;
  /** The share it represents: the catalogue feed that prices it, and the underlying a physical note delivers it for. */
  ticker: CatalogueSymbol;
  name: string;
  /** Token decimals (18 on mainnet, eth_call decimals()). */
  decimals: number;
  /** The real token on BNB Chain mainnet (a beacon proxy; CoinGecko's list, checked on-chain 2026-11-17). */
  mainnetToken: `0x${string}`;
}

/**
 * Binance's bStocks on BNB Chain mainnet, checked 2026-11-17 with read-only eth_call on https://bsc-dataseed.bnbchain.org:
 * symbol(), name(), decimals() 18, uiMultiplier() (TSLAB, AMZNB 1e18; NVDAB 1.000778; AAPLB 1.001135; MSFTB 1.001314;
 * GOOGLB 1.000478; METAB 1.000548) and the shared beacon 0x156d6dce9a4f6139a3406f1f021f1a4880de93a3.
 */
export const BSTOCKS: Record<BStockSymbol, BStock> = {
  TSLAB: {
    symbol: 'TSLAB',
    ticker: 'TSLA',
    name: 'Tesla',
    decimals: 18,
    mainnetToken: '0x5b1910eaad6450e50f816082aa078c41f10c292f',
  },
  NVDAB: {
    symbol: 'NVDAB',
    ticker: 'NVDA',
    name: 'NVIDIA',
    decimals: 18,
    mainnetToken: '0x02fca66c1d1afb4e2a7884261eb00f63598a7436',
  },
  AAPLB: {
    symbol: 'AAPLB',
    ticker: 'AAPL',
    name: 'Apple',
    decimals: 18,
    mainnetToken: '0x431a3bee82e2ca41e49895cbece5bb0f76a89b7a',
  },
  MSFTB: {
    symbol: 'MSFTB',
    ticker: 'MSFT',
    name: 'Microsoft',
    decimals: 18,
    mainnetToken: '0x80106cb3ead06659a5ad19df39d9b4733863b9b0',
  },
  AMZNB: {
    symbol: 'AMZNB',
    ticker: 'AMZN',
    name: 'Amazon',
    decimals: 18,
    mainnetToken: '0x1a4b499833a79a09ad7cf1d42d7dacf71e92eb00',
  },
  GOOGLB: {
    symbol: 'GOOGLB',
    ticker: 'GOOGL',
    name: 'Alphabet (Google)',
    decimals: 18,
    mainnetToken: '0x3f53de71c126bdabae20f9cd64848d317f6c3238',
  },
  METAB: {
    symbol: 'METAB',
    ticker: 'META',
    name: 'Meta Platforms',
    decimals: 18,
    mainnetToken: '0x7425889fe94f9d693e8daefe88bcced6acfef4c0',
  },
};
export const BSTOCK_SYMBOLS = Object.keys(BSTOCKS) as BStockSymbol[];
export const isBStockSymbol = (s: string): s is BStockSymbol => s in BSTOCKS;

/** notes.markets' test dollar on BNB Chain testnet (no usable public stablecoin there): 6 decimals, from the faucet. */
export const BNB_TEST_CASH = { token: 'nmUSD', decimals: 6, name: 'notes.markets test dollar' } as const;

/** notes.markets' deployment on BNB Chain testnet: the test dollar, each stand-in and its multiplier feed, the faucet. */
export interface BnbDeployment {
  /** CRE chain-selector name of the chain the tokens (and their multiplier feeds) live on. */
  feedChain: string;
  /** StockFaucet: the stand-ins and the test dollar, rate-limited. */
  faucet: `0x${string}`;
  /** The test dollar (BNB_TEST_CASH). */
  cash: `0x${string}`;
  tokens: Record<BStockSymbol, { token: `0x${string}`; multiplierFeed: `0x${string}` }>;
}

/** The multiplier feed of a bStock on BNB Chain testnet, as an oracle field reads it. */
export const bstockMultiplierFeed = (s: BStockSymbol, d: BnbDeployment = BNB_TESTNET_DEPLOYMENT): FeedSpec => ({
  symbol: s,
  feed: d.tokens[s].multiplierFeed,
  feedChain: d.feedChain,
  minPrice: MULTIPLIER_BOUNDS.min,
  maxPrice: MULTIPLIER_BOUNDS.max,
  staleness: MULTIPLIER_STALENESS,
});

/** The bStocks reads (real tokens and stand-ins alike). */
export const bstockAbi = [
  { type: 'function', name: 'uiMultiplier', stateMutability: 'view', inputs: [], outputs: [{ type: 'uint256' }] },
  {
    type: 'function',
    name: 'balanceOfUI',
    stateMutability: 'view',
    inputs: [{ name: 'account', type: 'address' }],
    outputs: [{ type: 'uint256' }],
  },
] as const;
