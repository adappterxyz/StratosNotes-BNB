import { describe, expect, it } from 'vitest';
import {
  B20_STOCKS,
  B20_SYMBOLS,
  BASE_MAINNET_FEED_CHAIN,
  BASE_SEPOLIA_FEED_CHAIN,
  CHAIN_TOKENS,
  collateralFeed,
  collateralTokenOf,
  compileTemplate,
  DEFAULT_HAIRCUT,
  deliverableToken,
  EVM_FEED_CHAINS,
  EXAMPLE_PRODUCTS,
  EXTERNAL_TOKENS,
  FEED_CHAIN_LABELS,
  FEEDS,
  instantiateProduct,
  isB20Symbol,
  pendingPlan,
  RECEIPTS,
  simulateNote,
  STOCK_TOKEN_FAUCETS,
  toChain,
  undeployedTokensOf,
  validateProductParams,
  wirePlan,
  type ProductParams,
} from '../src';

const BASE = 'base-sepolia' as const;
const RH = 'robinhood-testnet' as const;

/** A Base note on TSLA, physically settled (in TSLAc), backed by TSLAc pledged into the note. */
const baseTsla: ProductParams = {
  ...EXAMPLE_PRODUCTS.fcn,
  name: '12M FCN on TSLA (Base), physical',
  chain: BASE,
  underlyings: [FEEDS.TSLA],
  settlement: 'physical',
  collateral: [{ symbol: 'TSLAc', haircutPct: 60 }],
};

describe('Coinbase B20 stocks on Base: notes.markets stand-ins on Base Sepolia', () => {
  it('maps every stand-in to its real Coinbase token and per-token Chainlink feed on Base mainnet', () => {
    expect(B20_SYMBOLS).toEqual(['TSLAc', 'AMZNc', 'NVDAc', 'AAPLc', 'MSFTc', 'METAc']);
    for (const s of B20_SYMBOLS) {
      const b = B20_STOCKS[s];
      expect(b.symbol).toBe(s);
      expect(s).toBe(`${b.ticker}c`);
      expect(b.decimals).toBe(8);
      expect(b.mainnetToken).toMatch(/^0x[bB]20{18}/); // B20 precompile range;
      expect(b.feed).toMatch(/^0x[0-9a-fA-F]{40}$/);
      // The share it delivers for has a share-price feed in the catalogue (underlyings stay share prices).
      expect(FEEDS[b.ticker].feedChain).toBe('robinhood-mainnet');
      const t = CHAIN_TOKENS[BASE][s];
      expect(t).toMatchObject({ token: s, decimals: 8, valuedAs: s, b20: { delivers: b.ticker, standIn: true } });
      expect(t.name).toMatch(/test stand-in for Coinbase/);
      expect(DEFAULT_HAIRCUT[s]).toBe(60);
    }
    expect(new Set(B20_SYMBOLS.map((s) => B20_STOCKS[s].feed.toLowerCase())).size).toBe(B20_SYMBOLS.length);
  });

  it('keeps the two kinds of price apart: shares for underlyings, per-token feeds for B20 collateral', () => {
    // TSLA (Robinhood's token, 1:1 a share) is priced with the share feed; TSLAc with Coinbase TSLA's own feed.
    expect(collateralFeed('TSLA')).toEqual(FEEDS.TSLA);
    expect(collateralFeed('TSLAc')).toMatchObject({
      feed: B20_STOCKS.TSLAc.feed,
      feedChain: BASE_MAINNET_FEED_CHAIN,
      staleness: 345_600,
    });
    expect(collateralFeed('TSLAc')!.feed).not.toBe(FEEDS.TSLA.feed);
    expect(collateralFeed('USD')).toBeUndefined();
    expect(isB20Symbol('TSLAc')).toBe(true);
    expect(isB20Symbol('TSLA')).toBe(false);
    // Both Base feed chains are read by CRE's EVM capability (and the fallback keeper), labelled for the app.
    expect(EVM_FEED_CHAINS[BASE_MAINNET_FEED_CHAIN].chainId).toBe(8453);
    expect(EVM_FEED_CHAINS[BASE_SEPOLIA_FEED_CHAIN].chainId).toBe(84532);
    expect(FEED_CHAIN_LABELS[BASE_MAINNET_FEED_CHAIN]).toBe('Base');
  });

  it('compiles a Base TSLA note delivering shares / multiplier in TSLAc, its collateral valued per token', () => {
    const prod = instantiateProduct(baseTsla);
    expect(prod.assets.find((a) => a.id === 'd_TSLA')).toMatchObject({ token: 'TSLAc', decimals: 8 });
    expect(prod.assets.find((a) => a.id === 'col_TSLAc')).toMatchObject({ name: 'Collateral TSLAc', decimals: 8 });
    const xml = prod.bpmnXml;
    // The underlying is the TSLA share feed (strike and observations); px_TSLAc the per-token feed on Base mainnet.
    expect(xml).toContain(FEEDS.TSLA.feed);
    expect(xml).toContain(B20_STOCKS.TSLAc.feed);
    expect(xml).toContain('px_TSLAc');
    // The multiplier is read at the final observation only, from the Base Sepolia multiplier feed.
    expect(xml).toContain('mult_TSLA');
    expect(xml).toContain(BASE_SEPOLIA_FEED_CHAIN);
    expect(xml).toMatch(/1 \/ initialLevel \/ mult_TSLA/);
    const c = compileTemplate({ product: baseTsla });
    const multField = c.def.fields.findIndex((f) => f.name === 'mult_TSLA');
    expect(multField).toBeGreaterThanOrEqual(0);
    const capturing = c.def.steps.filter((s) => s.captures.some((x) => x.field === multField)).map((s) => s.id);
    expect(capturing).toEqual([`Task_Observe${baseTsla.observations}`]);
    // A Robinhood Chain note on TSLA delivers Robinhood's token 1:1: no multiplier.
    const rh = instantiateProduct({ ...baseTsla, chain: undefined, collateral: [{ symbol: 'TSLA', haircutPct: 60 }] });
    expect(rh.bpmnXml).not.toContain('mult_TSLA');
    expect(rh.bpmnXml).toMatch(/1 \/ initialLevel"|1 \/ initialLevel</);
  });

  it('delivers per worst performer in a basket, each B20 with its own multiplier', () => {
    const basket: ProductParams = {
      ...EXAMPLE_PRODUCTS['reverse-convertible'],
      chain: BASE,
      underlyings: [FEEDS.TSLA, FEEDS.NVDA, FEEDS.ETH],
      settlement: 'physical',
    };
    const xml = instantiateProduct(basket).bpmnXml;
    expect(xml).toContain('1 / initialLevel_TSLA / mult_TSLA');
    expect(xml).toContain('1 / initialLevel_NVDA / mult_NVDA');
    // ETH is delivered as WETH, 1:1.
    expect(xml).toMatch(/1 \/ initialLevel_ETH["<]/);
    expect(deliverableToken(basket, 'NVDA')).toMatchObject({ token: 'NVDAc', multiplier: { field: 'mult_NVDA' } });
  });

  it('the reference payoff delivers units / strike / multiplier', () => {
    const r = simulateNote(baseTsla, {
      perfs: [0.9, 0.95, 0.8, 0.5],
      sold: 1000,
      ratio: 0,
      collateral: [],
      worstAtMaturity: { symbol: 'TSLA', strike: 250, multiplier: 1.25 },
    });
    expect(r.perUnit.deliver.TSLA).toBeCloseTo(1 / 250 / 1.25, 12);
  });

  it('is offered, served and wired now the stand-ins are deployed on Base Sepolia', () => {
    for (const s of B20_SYMBOLS) expect(EXTERNAL_TOKENS[BASE][s]).toMatch(/^0x[0-9a-fA-F]{40}$/);
    expect(undeployedTokensOf(baseTsla)).toEqual([]);
    expect(validateProductParams(baseTsla)).toEqual([]);
    // The network picker keeps physical delivery in TSLAc on Base.
    const moved = toChain({ ...baseTsla, chain: undefined }, BASE);
    expect(moved.settlement).toBe('physical');
    // The Robinhood-home / Base-vault pair: the stand-ins are wired, nothing pending.
    expect(wirePlan(RH, BASE).map((w) => w.symbol)).toEqual([
      'USDC.base',
      'WETH.base',
      ...B20_SYMBOLS.map((s) => `${s}.base`),
    ]);
    expect(pendingPlan(RH, BASE)).toEqual([]);
    expect(STOCK_TOKEN_FAUCETS[BASE]).toMatch(/^https:\/\/sepolia\.basescan\.org\/address\/0x/);
  });

  it('lets a Robinhood Chain note lock a Base stock on Base, valued with the per-token feed', () => {
    const p: ProductParams = {
      ...EXAMPLE_PRODUCTS.phoenix,
      collateralChain: BASE,
      collateral: [{ symbol: 'NVDAc', haircutPct: 60 }],
    };
    expect(collateralTokenOf(p, 'NVDAc')).toEqual({ token: 'NVDAc.base', decimals: 8 });
    expect(RECEIPTS['NVDAc.base']).toMatchObject({ homes: [RH, 'bnb-testnet'], asset: BASE, symbol: 'NVDAc' });
    expect(instantiateProduct(p).bpmnXml).toContain(B20_STOCKS.NVDAc.feed);
    expect(validateProductParams(p)).toEqual([]);
  });
});
