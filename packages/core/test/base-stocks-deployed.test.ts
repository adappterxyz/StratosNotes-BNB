/**
 * The same core once the B20 stand-ins are deployed (scripts/deploy-base-stocks.sh rewrites base-stocks.deployed.ts):
 * here that file is mocked with addresses, so the switch from "pending" to "live" is tested without a deploy.
 */
import { describe, expect, it, vi } from 'vitest';

vi.mock('../src/products/base-stocks.deployed', () => {
  const a = (n: number) => `0x${n.toString(16).padStart(40, '0')}` as `0x${string}`;
  const syms = ['TSLAc', 'AMZNc', 'NVDAc', 'AAPLc', 'MSFTc', 'METAc'];
  return {
    BASE_SEPOLIA_STOCKS: {
      feedChain: 'ethereum-testnet-sepolia-base-1',
      faucet: a(0xfa),
      tokens: Object.fromEntries(syms.map((s, i) => [s, { token: a(0x100 + i), multiplierFeed: a(0x200 + i) }])),
    },
  };
});

const {
  checkCrossChainDeployment,
  CHAIN_TOKENS,
  EXAMPLE_PRODUCTS,
  EXTERNAL_TOKENS,
  FEEDS,
  instantiateProduct,
  STOCK_TOKEN_FAUCETS,
  toChain,
  validateProductParams,
  wirePlan,
  XC_CHAINS,
} = await import('../src');
const { realTokens } = await import('../src/served-config');
type CrossChainDeployment = import('../src').CrossChainDeployment;

const BASE = 'base-sepolia' as const;
const RH = 'robinhood-testnet' as const;

describe('B20 stand-ins, deployed', () => {
  it('serves them as Base Sepolia tokens, with the faucet', () => {
    expect(EXTERNAL_TOKENS[BASE].TSLAc).toBe(CHAIN_TOKENS[BASE].TSLAc.address);
    expect(realTokens(BASE).METAc).toBe(CHAIN_TOKENS[BASE].METAc.address);
    expect(STOCK_TOKEN_FAUCETS[BASE]).toMatch(/sepolia\.basescan\.org\/address\/0x0+fa#writeContract/);
  });

  it('issues a Base TSLA note delivering TSLAc, its multiplier read from the deployed feed', () => {
    const p = {
      ...EXAMPLE_PRODUCTS.fcn,
      chain: BASE,
      underlyings: [FEEDS.TSLA],
      settlement: 'physical' as const,
      collateral: [{ symbol: 'TSLAc' as const, haircutPct: 60 }],
    };
    expect(validateProductParams(p)).toEqual([]);
    expect(instantiateProduct(p).bpmnXml).toContain(CHAIN_TOKENS[BASE].TSLAc.b20!.multiplierFeed);
    // The network picker keeps physical delivery and the TSLAc collateral on Base.
    expect(toChain({ ...p, chain: undefined }, BASE).settlement).toBe('physical');
  });

  it('wires the Base stocks into the Robinhood-home pair; an older record without them still passes', () => {
    const plan = wirePlan(RH, BASE);
    expect(plan.map((w) => w.symbol)).toEqual([
      'USDC.base',
      'WETH.base',
      'TSLAc.base',
      'AMZNc.base',
      'NVDAc.base',
      'AAPLc.base',
      'MSFTc.base',
      'METAc.base',
    ]);
    const receipt = (i: number) => `0x${(0x900 + i).toString(16).padStart(40, '0')}`;
    const rec = (items: typeof plan): CrossChainDeployment => ({
      home: {
        chain: RH,
        chainId: XC_CHAINS[RH].chainId,
        selector: XC_CHAINS[RH].selector,
        router: XC_CHAINS[RH].router,
        engine: receipt(0xe),
        gateway: receipt(0xf),
      },
      remotes: [
        {
          chain: BASE,
          chainId: XC_CHAINS[BASE].chainId,
          selector: XC_CHAINS[BASE].selector,
          router: XC_CHAINS[BASE].router,
          vault: receipt(0xa),
          receipts: Object.fromEntries(
            items.map((w, i) => [
              w.symbol,
              { receipt: receipt(i), token: w.token, decimals: w.decimals, valuedAs: w.valuedAs },
            ]),
          ),
        },
      ],
    });
    expect(checkCrossChainDeployment(rec(plan))).toEqual([]);
    // Before EXTEND_PAIR=1: the live record has only USDC.base and WETH.base. Still valid (the stocks just aren't served).
    expect(checkCrossChainDeployment(rec(plan.slice(0, 2)))).toEqual([]);
    // ...but USDC.base missing is an error, and a stock receipt must lock the deployed stand-in.
    expect(checkCrossChainDeployment(rec(plan.slice(1))).join(' ')).toMatch(/receipts/);
    const wrong = rec(plan);
    wrong.remotes[0].receipts['TSLAc.base'].token = receipt(0x55);
    expect(checkCrossChainDeployment(wrong).join(' ')).toMatch(/TSLAc.base locks/);
  });
});
