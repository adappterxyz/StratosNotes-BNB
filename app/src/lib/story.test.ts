import { describe, expect, it } from 'vitest';
import {
  EXAMPLE_PRODUCTS,
  EXAMPLE_WORST_OF,
  FEEDS,
  simulatePerf,
  totalPerUnit,
  type ProductParams,
  type ProductType,
} from '@sn/core';
import { barSentence, linesOf, plainName, playOut, scenarios, zonesOf } from './story';

const tslaNvda: ProductParams = {
  ...EXAMPLE_WORST_OF,
  underlyings: [FEEDS.TSLA, FEEDS.NVDA],
  observations: 3,
  couponRatePct: 2.5,
};

describe('plain names', () => {
  it('names each product type from its terms', () => {
    expect(plainName(tslaNvda)).toBe('Income while Tesla and NVIDIA hold 70%');
    expect(plainName(EXAMPLE_PRODUCTS.fcn)).toBe('Fixed income on Ethereum, protected to 60%');
    expect(plainName({ ...EXAMPLE_PRODUCTS['reverse-convertible'], underlyings: [FEEDS.TSLA] })).toBe(
      'High income on Tesla, protected to 70%',
    );
    expect(plainName(EXAMPLE_PRODUCTS.snowball)).toBe('Growing payout on Ethereum, repaid above 100%');
    expect(plainName(EXAMPLE_PRODUCTS.ppn)).toBe("100% protected, plus Ethereum's rise");
  });
});

describe('the lines and zones', () => {
  it('a phoenix has all three lines, lowest first', () => {
    expect(linesOf(tslaNvda).map((l) => [l.key, l.pct])).toEqual([
      ['knockIn', 60],
      ['coupon', 70],
      ['autocall', 100],
    ]);
    expect(zonesOf(tslaNvda, 30, 130).map((z) => z.tone)).toEqual(['loss', 'safe', 'coupon', 'call']);
  });
  it('products without some lines simply lack them', () => {
    expect(linesOf(EXAMPLE_PRODUCTS['reverse-convertible']).map((l) => l.key)).toEqual(['knockIn']);
    expect(zonesOf(EXAMPLE_PRODUCTS['reverse-convertible'], 30, 130).map((z) => z.tone)).toEqual(['loss', 'coupon']);
    expect(linesOf(EXAMPLE_PRODUCTS.ppn).map((l) => l.key)).toEqual(['start']);
    expect(zonesOf(EXAMPLE_PRODUCTS.ppn, 30, 130).map((z) => z.tone)).toEqual(['safe', 'gain']);
    expect(zonesOf(EXAMPLE_PRODUCTS.snowball, 30, 130).map((z) => z.tone)).toEqual(['loss', 'safe', 'call']);
    expect(zonesOf(EXAMPLE_PRODUCTS.fcn, 30, 130).map((z) => z.tone)).toEqual(['loss', 'coupon', 'call']);
  });
  it('says where the weakest stands', () => {
    const s = barSentence(tslaNvda, [
      { sym: 'TSLA', pct: 107.9, worst: false },
      { sym: 'NVDA', pct: 83.9, worst: true },
    ]);
    expect(s).toBe(
      'The weaker stock (NVIDIA) is 13.9 points above the coupon line, 16.1 points short of the early-repayment line.',
    );
  });
});

describe('play the note', () => {
  const types = Object.keys(EXAMPLE_PRODUCTS) as ProductType[];
  it.each(types)('%s: the total is the reference payoff, for every scenario', (t) => {
    const p = EXAMPLE_PRODUCTS[t];
    for (const s of scenarios(p)) {
      const played = playOut(p, s.perfs);
      const ref =
        totalPerUnit(
          simulatePerf(
            p,
            s.perfs.map((x) => x / 100),
          ),
        ) * 100;
      expect(played.total).toBeCloseTo(ref, 6);
      expect(played.events.length).toBeGreaterThan(0);
    }
  });
  it('a memory coupon pays the missed ones', () => {
    const played = playOut(tslaNvda, [65, 80, 90]);
    expect(played.events.map((e) => e.kind)).toEqual(['none', 'coupon', 'coupon', 'par']);
    expect(played.events[1].amount).toBeCloseTo(5);
    expect(played.events[1].text).toMatch(/1 missed before/);
  });
  it('early repayment ends the note', () => {
    const played = playOut(tslaNvda, [95, 105, 50]);
    expect(played.how).toBe('call');
    expect(played.calledAt).toBe(2);
    expect(played.total).toBeCloseTo(105);
  });
});
