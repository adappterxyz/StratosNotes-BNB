/**
 * Where notes.markets' BNB Chain testnet tokens are deployed (docs/BNB-CHAIN.md). Written by
 * scripts/bnb-stocks.ts apply from deployments/bnb-stocks/bnb-testnet.json (owner 0x298afB9424188C7eA7c01556D8CAE6ff4768de0a). Edit by hand only to move to other addresses.
 */
import type { BnbDeployment } from './bnb-stocks';

export const BNB_TESTNET_DEPLOYMENT: BnbDeployment = {
  feedChain: 'binance_smart_chain-testnet',
  faucet: '0xC7cdfBfE828E99b9bdF14CF1aBaA49b44922c8A6',
  cash: '0x199816ce7e0b2366b408D6F8c3158844f06E3099',
  tokens: {
    TSLAB: { token: '0x5Daa05c6D9866AEC94D7E73462e09F8bC40C6fcD', multiplierFeed: '0xb50E2A93437eDac4885295cC022837AFF0dD9df4' },
    NVDAB: { token: '0xf1Ef65D880e9bcE21252ffbAcbcb5FBC2a0f5B07', multiplierFeed: '0xD685fAb17186FdED106f2B258e8e637eadc8ad83' },
    AAPLB: { token: '0x23a651EEfB67188C8dAEc683c3e820bF26D47C12', multiplierFeed: '0xdFf0853baa3D226dB46Be5CeDF5E085EA5681a50' },
    MSFTB: { token: '0x31FAa920215E089A75df0CAd4E45d2f237b59f6C', multiplierFeed: '0x23F3204db957A78cE3E193fCEd3ff023D2ef3068' },
    AMZNB: { token: '0xF3D825E904e03c59b720395Ff2641567a94aC81A', multiplierFeed: '0xA97Ef64C0663b36E2d7F0a53399355286Db8b682' },
    GOOGLB: { token: '0x379557862668267c486c2EB7B0d3428314e27665', multiplierFeed: '0xEb0F67BDCfC42C005b101025be8d96861de77e5F' },
    METAB: { token: '0x1a226DA7F988B38882ba441914A50801635af4Ca', multiplierFeed: '0xe309a7A22acfDa92BE048dcca37FBA17800E4C52' },
  },
};
