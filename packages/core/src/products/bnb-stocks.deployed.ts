/**
 * Where notes.markets' BNB Chain testnet tokens are deployed (docs/BNB-CHAIN.md). NOT DEPLOYED YET: every address is
 * the zero placeholder (NOT_DEPLOYED), so nothing here is served, priced, offered or wired until
 * scripts/deploy-bnb.sh deploys them and rewrites this file from deployments/bnb-stocks/bnb-testnet.json
 * (npx tsx scripts/bnb-stocks.ts apply). Edit by hand only to move to other addresses.
 */
import type { BnbDeployment } from './bnb-stocks';

const Z = '0x0000000000000000000000000000000000000000' as const;

export const BNB_TESTNET_DEPLOYMENT: BnbDeployment = {
  feedChain: 'binance_smart_chain-testnet',
  faucet: Z,
  cash: Z,
  tokens: {
    TSLAB: { token: Z, multiplierFeed: Z },
    NVDAB: { token: Z, multiplierFeed: Z },
    AAPLB: { token: Z, multiplierFeed: Z },
    MSFTB: { token: Z, multiplierFeed: Z },
    AMZNB: { token: Z, multiplierFeed: Z },
    GOOGLB: { token: Z, multiplierFeed: Z },
    METAB: { token: Z, multiplierFeed: Z },
  },
};
