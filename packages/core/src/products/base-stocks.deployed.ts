/**
 * Where notes.markets' B20 stand-ins are deployed on Base Sepolia (docs/BASE-STOCKS.md). NOT DEPLOYED YET: every
 * address is the zero placeholder (NOT_DEPLOYED), so no stand-in is served, priced, offered or wired until
 * scripts/deploy-base-stocks.sh deploys them and rewrites this file from deployments/base-stocks/base-sepolia.json
 * (npx tsx scripts/base-stocks.ts apply). Edit by hand only to move to other addresses.
 */
import type { B20Deployment } from './base-stocks';

const Z = '0x0000000000000000000000000000000000000000' as const;

export const BASE_SEPOLIA_STOCKS: B20Deployment = {
  feedChain: 'ethereum-testnet-sepolia-base-1',
  faucet: Z,
  tokens: {
    TSLAc: { token: Z, multiplierFeed: Z },
    AMZNc: { token: Z, multiplierFeed: Z },
    NVDAc: { token: Z, multiplierFeed: Z },
    AAPLc: { token: Z, multiplierFeed: Z },
    MSFTc: { token: Z, multiplierFeed: Z },
    METAc: { token: Z, multiplierFeed: Z },
  },
};
