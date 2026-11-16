/**
 * Where notes.markets' B20 stand-ins are deployed on Base Sepolia (docs/BASE-STOCKS.md). Written by
 * scripts/base-stocks.ts apply from deployments/base-stocks/base-sepolia.json (owner 0x298afB9424188C7eA7c01556D8CAE6ff4768de0a). Edit by hand only to move to other addresses.
 */
import type { B20Deployment } from './base-stocks';

export const BASE_SEPOLIA_STOCKS: B20Deployment = {
  feedChain: 'ethereum-testnet-sepolia-base-1',
  faucet: '0x5724c3362795733F7906826Bfaa71b758A13eeB3',
  tokens: {
    TSLAc: { token: '0xA1d0c4af9036f16a92fb26C47502494d393E6aeb', multiplierFeed: '0x31FAa920215E089A75df0CAd4E45d2f237b59f6C' },
    AMZNc: { token: '0xC30E1Aa84c2344E0C94A8872e11D630C81339c9B', multiplierFeed: '0xF3D825E904e03c59b720395Ff2641567a94aC81A' },
    NVDAc: { token: '0xC22886C920E9B51A0F16e11C90B155921E955C9D', multiplierFeed: '0x379557862668267c486c2EB7B0d3428314e27665' },
    AAPLc: { token: '0xAd47c568D3e058292f6b0CC130385034C65C5758', multiplierFeed: '0x1a226DA7F988B38882ba441914A50801635af4Ca' },
    MSFTc: { token: '0x3c4c95F15F7F6E877bbC8D84f57cE48571a001F1', multiplierFeed: '0x63424c1df913a64db697e780c5293e95194489b1' },
    METAc: { token: '0x5DBB2f20834236926Fe7826156b39a4a86A7d6A5', multiplierFeed: '0x1878d39F800437b92582c306e76B8c051C6a8FA2' },
  },
};
