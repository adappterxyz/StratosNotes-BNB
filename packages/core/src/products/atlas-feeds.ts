/**
 * Atlas price feeds of Binance's bStocks on BNB Chain mainnet (docs/ATLAS-CMC.md): what a note written on a stock
 * TOKEN (TSLAB, NVDAB…) is fixed on, and what a pledged bStock is valued with.
 *
 * Atlas (atlasoracle.io) publishes each bStock's price from the token's own markets (Binance spot, PancakeSwap…),
 * around the clock: a price exists on weekends and overnight, when the stock exchange is closed and Chainlink's
 * equity feeds stand still. It is the price of ONE TOKEN, so nothing is scaled by a multiplier (a share-price feed
 * needs the token's uiMultiplier; this one already has it in the price).
 *
 * All seven live in one Multi-Feed contract, read with fetch(bytes4 feedId) (feed-rpc.ts: a keyed feed reference
 * `0x<contract>#<id>`). Checked on-chain 2026-11-25 with read-only eth_call on https://bsc-dataseed.bnbchain.org:
 * contractType() 2, decimals() 18, isOpenRead() true, every id below fresh within 60 s (its heartbeat; deviation 2%).
 * Atlas keeps the latest price only: there are no past rounds, so a fixing window over an Atlas price takes its
 * history from CoinMarketCap (cmc.ts), by the CoinMarketCap id recorded here.
 *
 * Pure data: no Node APIs (bundled into the CRE workflow).
 */
import { BSC_MAINNET_FEED_CHAIN, keyedFeed } from '../feed-rpc';
import { BSTOCKS, BSTOCK_SYMBOLS, type BStockSymbol } from './bnb-stocks';

/** Atlas's Multi-Feed contract on BNB Chain mainnet: every "BNB Chain XXXB/USD" feed (atlasoracle.io/feeds). */
export const ATLAS_MULTI_FEED = '0xeace519ebb14fb8404fa6ddd23c3b34abade44aa';
export const ATLAS_DECIMALS = 18;
/** Atlas writes a bStock price at least every 60 s. */
export const ATLAS_HEARTBEAT = 60;
/**
 * Oldest Atlas price a fixing accepts, seconds: 15 heartbeats. When Atlas's sources disagree too much it stops
 * publishing ("publishes last trusted value and halts", atlasoracle.io/consensus-score); the price then goes stale
 * and the check waits, retried every keeper run, until Atlas publishes again.
 */
export const ATLAS_STALENESS = 900;

/**
 * Per bStock: Atlas's feed number (atlasoracle.io/feeds/<id>, also the Multi-Feed's 4-byte id), CoinMarketCap's id
 * of the same token (pro-api /v1/cryptocurrency/map, matched on the BNB Chain token address), and the bounds every
 * fixing must sit in (a tenth to ten times the price on 2026-11-25, two significant figures).
 */
export const ATLAS_BSTOCKS: Record<
  BStockSymbol,
  { atlasId: number; cmcId: number; minPrice: number; maxPrice: number }
> = {
  TSLAB: { atlasId: 933, cmcId: 40214, minPrice: 36, maxPrice: 3_600 },
  NVDAB: { atlasId: 934, cmcId: 40215, minPrice: 14, maxPrice: 1_400 },
  AAPLB: { atlasId: 979, cmcId: 40927, minPrice: 35, maxPrice: 3_500 },
  MSFTB: { atlasId: 943, cmcId: 40589, minPrice: 48, maxPrice: 4_800 },
  AMZNB: { atlasId: 981, cmcId: 40929, minPrice: 24, maxPrice: 2_400 },
  GOOGLB: { atlasId: 952, cmcId: 40793, minPrice: 27, maxPrice: 2_700 },
  METAB: { atlasId: 944, cmcId: 40592, minPrice: 58, maxPrice: 5_800 },
};

/** One Atlas-priced underlying, in the shape of a catalogue feed (feeds-catalogue.ts). */
export interface AtlasFeed {
  symbol: BStockSymbol;
  name: string;
  assetClass: 'Stock tokens';
  /** Keyed feed reference: the Multi-Feed contract and Atlas's feed id. */
  feed: string;
  feedChain: typeof BSC_MAINNET_FEED_CHAIN;
  decimals: number;
  heartbeat: number;
  staleness: number;
  minPrice: number;
  maxPrice: number;
  risk: 'atlas';
  marketHours: '24/7';
}

/** Binance's bStocks as underlyings, each on its Atlas feed. */
export const ATLAS_CATALOGUE: readonly AtlasFeed[] = BSTOCK_SYMBOLS.map((s) => ({
  symbol: s,
  name: `${BSTOCKS[s].name} (bStock)`,
  assetClass: 'Stock tokens',
  feed: keyedFeed(ATLAS_MULTI_FEED, ATLAS_BSTOCKS[s].atlasId),
  feedChain: BSC_MAINNET_FEED_CHAIN,
  decimals: ATLAS_DECIMALS,
  heartbeat: ATLAS_HEARTBEAT,
  staleness: ATLAS_STALENESS,
  minPrice: ATLAS_BSTOCKS[s].minPrice,
  maxPrice: ATLAS_BSTOCKS[s].maxPrice,
  risk: 'atlas',
  marketHours: '24/7',
}));

/** CoinMarketCap's id of the token an Atlas feed reference prices (its second source), if it is one of ours. */
export function cmcIdOfFeed(f: { feed: string; feedChain: string }): number | undefined {
  if (f.feedChain !== BSC_MAINNET_FEED_CHAIN) return undefined;
  const ref = f.feed.toLowerCase();
  const s = BSTOCK_SYMBOLS.find((x) => keyedFeed(ATLAS_MULTI_FEED, ATLAS_BSTOCKS[x].atlasId) === ref);
  return s ? ATLAS_BSTOCKS[s].cmcId : undefined;
}
