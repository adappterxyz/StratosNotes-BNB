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
  collateralRefMultiplierFeed,
  evalExpr,
  RH_STOCK_TOKENS,
  RH_TOKEN_CHAIN,
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
    expect(names).toEqual(expect.arrayContaining(['pxs_TSLAB', 'pxm_TSLAB', 'pxr_TSLAB', 'px_TSLAB']));
    // The stock feed is the price of Robinhood's token: divided by Robinhood's multiplier it is the share price.
    expect(prod.bpmnXml).toMatch(/pxs_TSLAB \* pxm_TSLAB \/ pxr_TSLAB/);
    expect(collateralRefMultiplierFeed('TSLAB')).toMatchObject({
      feed: RH_STOCK_TOKENS.TSLA,
      feedChain: RH_TOKEN_CHAIN,
    });
    expect(collateralRefMultiplierFeed('TSLA')).toBeUndefined();
    expect(collateralRefMultiplierFeed('TSLAc')).toBeUndefined();
    // The engine's own arithmetic (10-decimal fixed point) on the compiled formula, through a 2:1 split.
    const at = (n: string) => c.def.fields.findIndex((f) => f.name === n);
    const cap = c.def.steps.flatMap((s) => s.captures).find((x) => x.field === at('px_TSLAB') && x.expr !== 0xffff)!;
    const px = (feed: number, bstock: number, robinhood: number) => {
      const v: Record<number, bigint> = {
        [at('pxs_TSLAB')]: BigInt(Math.round(feed * 1e10)),
        [at('pxm_TSLAB')]: BigInt(Math.round(bstock * 1e10)),
        [at('pxr_TSLAB')]: BigInt(Math.round(robinhood * 1e10)),
      };
      return (
        Number(
          evalExpr(
            c.def.exprs[cap.expr],
            c.def.fields.map((f) => f.kind),
            (f) => v[f] ?? null,
          ),
        ) / 1e10
      );
    };
    // TSLA at 400 a share, every token one share: a bStock is worth 400.
    expect(px(400, 1, 1)).toBe(400);
    // After a 2:1 split (share 200, both tokens 2 shares): the Robinhood feed still reads 400, the bStock is worth 400.
    expect(px(400, 2, 2)).toBe(400);
    // Reinvested dividends drift apart (Robinhood 1.0017, the bStock 1.0013), share at 400: 400 x 1.0013.
    expect(px(400 * 1.0017, 1.0013, 1.0017)).toBeCloseTo(400 * 1.0013, 6);
    // Coverage reads px_TSLAB like any other collateral price.
    expect(prod.bpmnXml).toMatch(/\* px_TSLAB \* haircut_TSLAB/);
  });

  it("delivers a share underlying in its bStock at shares / multiplier, the shares from Robinhood's multiplier", () => {
    expect(deliverableToken({ chain: BNB }, 'TSLA')).toMatchObject({
      token: 'TSLAB',
      decimals: 18,
      multiplier: { field: 'mult_TSLA', feed: { feedChain: BNB_TESTNET_FEED_CHAIN } },
    });
    expect(deliverableToken({ chain: BNB }, 'GOOGL')).toMatchObject({ token: 'GOOGLB' });
    expect(deliverableToken({ chain: BNB }, 'ETH')).toBeUndefined();
    expect(deliverableToken({ chain: BNB }, 'TSLA')?.reference).toMatchObject({ field: 'rmult_TSLA' });
    expect(instantiateProduct(bnbTsla).bpmnXml).toMatch(/1 \/ initialLevel \* rmult_TSLA \/ mult_TSLA/);
  });

  it('is offered, served and wired now BNB Chain testnet is deployed', () => {
    for (const s of ['nmUSD', ...BSTOCK_SYMBOLS]) expect(EXTERNAL_TOKENS[BNB][s]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(CASH_TOKENS[BNB]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(STOCK_TOKEN_FAUCETS[BNB]).toMatch(/^https:\/\/testnet\.bscscan\.com\/address\/0x/);
    expect(undeployedTokensOf(bnbTsla)).toEqual([]);
    expect(validateProductParams(bnbTsla)).toEqual([]);
    expect(
      collateralChoices({ chain: BNB })
        .filter((c) => c.token)
        .map((c) => c.token),
    ).toEqual(['nmUSD', ...BSTOCK_SYMBOLS]);
    // The network picker keeps physical delivery in TSLAB on BNB Chain.
    expect(toChain({ ...bnbTsla, chain: undefined }, BNB).settlement).toBe('physical');
    // Every pair with BNB Chain is wired, nothing pending.
    expect(wirePlan(RH, BNB).map((w) => w.symbol)).toEqual(['nmUSD.bnb', ...BSTOCK_SYMBOLS.map((s) => `${s}.bnb`)]);
    expect(pendingPlan(RH, BNB)).toEqual([]);
  });

  it('lets notes on the other chains lock bStocks on BNB Chain, and BNB notes lock theirs', () => {
    const rhNote: ProductParams = {
      ...EXAMPLE_PRODUCTS.phoenix,
      collateralChain: BNB,
      collateral: [{ symbol: 'NVDAB', haircutPct: 60 }],
    };
    expect(collateralTokenOf(rhNote, 'NVDAB')).toEqual({ token: 'NVDAB.bnb', decimals: 18 });
    expect(RECEIPTS['NVDAB.bnb']).toMatchObject({ homes: [RH, BASE], asset: BNB, symbol: 'NVDAB' });
    expect(instantiateProduct(rhNote).bpmnXml).toMatch(/pxs_NVDAB \* pxm_NVDAB \/ pxr_NVDAB/);
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
