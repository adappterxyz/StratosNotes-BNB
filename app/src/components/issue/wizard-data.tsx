/** The guided issue flow's note types, steps and the recorded demo's terms. */
import type { ReactNode } from 'react';
import { ArrowLeftRight, Flame, Layers, Repeat, ShieldCheck, Snowflake } from 'lucide-react';
import { EXAMPLE_PRODUCTS, FEEDS, type ProductParams } from '@sn/core';
import type { NoteKind } from '../../lib/readymade';

export type Kind = NoteKind;
export const PRODUCTS: Array<{ kind: Kind; icon: ReactNode; title: string; tech: string; line: string }> = [
  {
    kind: 'fcn',
    icon: <Repeat />,
    title: 'Steady income',
    tech: 'Fixed coupon note',
    line: 'The same coupon every period, whatever the price does. Can repay early.',
  },
  {
    kind: 'reverse-convertible',
    icon: <ArrowLeftRight />,
    title: 'Higher income',
    tech: 'Reverse convertible',
    line: 'A bigger fixed coupon; below the money-back line it pays back in stock or its value.',
  },
  {
    kind: 'phoenix',
    icon: <Flame />,
    title: 'Income while it holds',
    tech: 'Phoenix',
    line: 'A coupon at each check the price is above a line; missed ones can be paid later.',
  },
  {
    kind: 'snowball',
    icon: <Snowflake />,
    title: 'Growing payout',
    tech: 'Snowball',
    line: 'Nothing until it repays; then a coupon for every period that passed.',
  },
  {
    kind: 'ppn',
    icon: <ShieldCheck />,
    title: 'Capital protected',
    tech: 'Principal-protected note',
    line: 'Money back at the end, plus a share of any rise.',
  },
  {
    kind: 'worst-of',
    icon: <Layers />,
    title: 'On a basket',
    tech: 'Worst-of',
    line: 'Any of these on two or three assets: the weakest one decides.',
  },
];
export const STEPS = ['Basics', 'Terms', 'Schedule', 'Collateral', 'Review & issue'] as const;

/**
 * The recorded demo's note (?product=reverse-convertible&demo=tsla): a TSLA reverse convertible on Robinhood Chain,
 * cash-settled in USDG, secured by Robinhood's TSLA token (60% haircut) and USDG, both pledged straight into the note.
 */
export const DEMO_TSLA: ProductParams = {
  ...EXAMPLE_PRODUCTS['reverse-convertible'],
  name: 'TSLA Reverse Convertible',
  underlyings: [FEEDS.TSLA],
  settlement: 'cash',
  issuePricePct: 100,
  observations: 2,
  couponRatePct: 2.5,
  knockInBarrierPct: 70,
  collateral: [
    { symbol: 'TSLA', haircutPct: 60 },
    { symbol: 'USD', haircutPct: 100 },
  ],
  collateralRatioPct: 100,
  defaultRule: 'cap-at-owed',
  payouts: 'claim',
};
