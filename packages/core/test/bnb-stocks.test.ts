import { describe, expect, it } from 'vitest';
import {
  BNB_TESTNET_FEED_CHAIN,
  BSTOCK_SYMBOLS,
  BSTOCKS,
  CASH_TOKENS,
  CHAIN_TOKENS,
  cashTokenOf,
  collateralChoices,
  collateralFeed,
  collateralMultiplierFeed,
  collateralSymbolOfAsset,
  collateralTokenOf,
  compileTemplate,
  deliverableToken,
  EXAMPLE_PRODUCTS,
  EXTERNAL_TOKENS,
  FEED_CHAIN_LABELS,
  FEEDS,
  instantiateProduct,
  isBStockSymbol,
  NOTE_CHAIN_LABELS,
  pendingPlan,
  RECEIPTS,
  STOCK_TOKEN_FAUCETS,
  toChain,
  undeployedTokensOf,
  validateProductParams,
  wirePlan,
  XC_CHAINS,
  type ProductParams,
} from '../src';

const BNB = 'bnb-testnet' as const;
const BASE = 'base-sepolia' as const;
const RH = 'robinhood-testnet' as const;

/** A BNB Chain note on TSLA, physically settled (in TSLAB), backed by TSLAB pledged into the note. */
const bnbTsla: ProductParams = {
  ...EXAMPLE_PRODUCTS.fcn,
  name: '12M FCN on TSLA (BNB Chain), physical',
  chain: BNB,
  underlyings: [FEEDS.TSLA],
  settlement: 'physical',
  collateral: [{ symbol: 'TSLAB', haircutPct: 60 }],
};

describe("Binance's bStocks on BNB Chain: notes.markets stand-ins on BNB Chain testnet", () => {
  it('knows BNB Chain testnet as a third note chain, settled in the nmUSD test dollar', () => {
    expect(NOTE_CHAIN_LABELS[BNB]).toBe('BNB Chain testnet');
    expect(cashTokenOf(BNB)).toEqual({ token: 'nmUSD', decimals: 6 });
    expect(XC_CHAINS[BNB]).toMatchObject({
      chainId: 97,
      selector: '13264668187771770619',
      creName: 'binance_smart_chain-testnet',
    });
    expect(FEED_CHAIN_LABELS[BNB_TESTNET_FEED_CHAIN]).toBe('BNB Chain testnet');
    expect(Object.keys(CHAIN_TOKENS[BNB]).sort()).toEqual(['nmUSD', ...BSTOCK_SYMBOLS].sort());
    expect(collateralSymbolOfAsset('Collateral nmUSD')).toBe('USD');
  });

  it('maps each stand-in to its real bStock and the share it represents', () => {
    expect(BSTOCK_SYMBOLS).toEqual(['TSLAB', 'NVDAB', 'AAPLB', 'MSFTB', 'AMZNB', 'GOOGLB', 'METAB']);
    for (const s of BSTOCK_SYMBOLS) {
      const b = BSTOCKS[s];
      expect(b.decimals).toBe(18);
      expect(b.mainnetToken).toMatch(/^0x[0-9a-fA-F]{40}$/);
      expect(FEEDS[b.ticker], b.ticker).toBeDefined();
      expect(CHAIN_TOKENS[BNB][s]).toMatchObject({ token: s, decimals: 18, valuedAs: s });
      expect(CHAIN_TOKENS[BNB][s].bstock).toMatchObject({ delivers: b.ticker, standIn: true });
    }
    expect(isBStockSymbol('TSLAB')).toBe(true);
    expect(isBStockSymbol('TSLAc')).toBe(false);
  });

  it('values a bStock as its share price x its multiplier, never as the share alone', () => {
    expect(collateralFeed('TSLAB')).toEqual(FEEDS.TSLA);
    expect(collateralMultiplierFeed('TSLAB')).toMatchObject({ symbol: 'TSLAB', feedChain: BNB_TESTNET_FEED_CHAIN });
    expect(collateralMultiplierFeed('TSLA')).toBeUndefined();
    expect(collateralMultiplierFeed('TSLAc')).toBeUndefined();
    const prod = instantiateProduct(bnbTsla);
    expect(prod.assets.find((a) => a.id === 'col_TSLAB')).toMatchObject({ name: 'Collateral TSLAB', decimals: 18 });
    const c = compileTemplate({ product: bnbTsla });
    const names = c.def.fields.map((f) => f.name);
    expect(names).toEqual(expect.arrayContaining(['pxs_TSLAB', 'pxm_TSLAB', 'px_TSLAB']));
    expect(prod.bpmnXml).toMatch(/pxs_TSLAB \* pxm_TSLAB/);
    // Coverage reads px_TSLAB like any other collateral price.
    expect(prod.bpmnXml).toMatch(/\* px_TSLAB \* haircut_TSLAB/);
  });

  it('delivers a share underlying in its bStock at shares / multiplier', () => {
    expect(deliverableToken({ chain: BNB }, 'TSLA')).toMatchObject({
      token: 'TSLAB',
      decimals: 18,
      multiplier: { field: 'mult_TSLA', feed: { feedChain: BNB_TESTNET_FEED_CHAIN } },
    });
    expect(deliverableToken({ chain: BNB }, 'GOOGL')).toMatchObject({ token: 'GOOGLB' });
    expect(deliverableToken({ chain: BNB }, 'ETH')).toBeUndefined();
    expect(instantiateProduct(bnbTsla).bpmnXml).toMatch(/1 \/ initialLevel \/ mult_TSLA/);
  });

  it('is not offered, served or wired before the BNB deploy', () => {
    expect(EXTERNAL_TOKENS[BNB]).toEqual({});
    expect(CASH_TOKENS[BNB]).toBeUndefined();
    expect(STOCK_TOKEN_FAUCETS[BNB]).toBeUndefined();
    expect(undeployedTokensOf(bnbTsla).sort()).toEqual(['TSLAB']);
    expect(validateProductParams(bnbTsla).join(' ')).toMatch(/TSLAB is not deployed yet/);
    expect(collateralChoices({ chain: BNB }).filter((c) => c.token)).toEqual([]);
    // The network picker settles in cash and drops what cannot be pledged yet.
    const moved = toChain({ ...bnbTsla, chain: undefined }, BNB);
    expect(moved.settlement).toBe('cash');
    expect(moved.collateral).toEqual([{ symbol: 'USD', haircutPct: 100 }]);
    // Every pair with BNB Chain waits in pendingPlan.
    expect(wirePlan(RH, BNB)).toEqual([]);
    expect(pendingPlan(RH, BNB).map((w) => w.symbol)).toEqual(['nmUSD.bnb', ...BSTOCK_SYMBOLS.map((s) => `${s}.bnb`)]);
  });

  it('lets notes on the other chains lock bStocks on BNB Chain, and BNB notes lock theirs', () => {
    const rhNote: ProductParams = {
      ...EXAMPLE_PRODUCTS.phoenix,
      collateralChain: BNB,
      collateral: [{ symbol: 'NVDAB', haircutPct: 60 }],
    };
    expect(collateralTokenOf(rhNote, 'NVDAB')).toEqual({ token: 'NVDAB.bnb', decimals: 18 });
    expect(RECEIPTS['NVDAB.bnb']).toMatchObject({ homes: [RH, BASE], asset: BNB, symbol: 'NVDAB' });
    expect(instantiateProduct(rhNote).bpmnXml).toMatch(/pxs_NVDAB \* pxm_NVDAB/);
    const bnbNote: ProductParams = {
      ...EXAMPLE_PRODUCTS.phoenix,
      chain: BNB,
      collateralChain: RH,
      collateral: [{ symbol: 'TSLA', haircutPct: 60 }],
    };
    expect(collateralTokenOf(bnbNote, 'TSLA')).toEqual({ token: 'TSLA.rh', decimals: 18 });
    expect(RECEIPTS['TSLA.rh'].homes).toEqual([BASE, BNB]);
    const viaBase: ProductParams = {
      ...bnbNote,
      collateralChain: BASE,
      collateral: [{ symbol: 'TSLAc', haircutPct: 60 }],
    };
    expect(collateralTokenOf(viaBase, 'TSLAc')).toEqual({ token: 'TSLAc.base', decimals: 8 });
    expect(validateProductParams(viaBase)).toEqual([]);
  });
});
