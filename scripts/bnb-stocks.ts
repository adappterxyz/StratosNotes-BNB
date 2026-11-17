/**
 * notes.markets' test tokens on BNB Chain testnet (docs/BNB-CHAIN.md): the helper behind scripts/deploy-bnb.sh, and
 * the multiplier sync. packages/core is the single source of truth for which bStocks there are (BSTOCKS) and where
 * they are deployed (BNB_TESTNET_DEPLOYMENT, bnb-stocks.deployed.ts). Every chain read here is a read-only eth_call;
 * nothing here signs or sends a transaction.
 *
 *   npx tsx scripts/bnb-stocks.ts env
 *       shell assignments for DeployBnbStocks.s.sol: SYMBOLS, NAMES, REAL (Binance's bStocks on BNB Chain mainnet) and
 *       MULTIPLIERS, read from those tokens on mainnet now (uiMultiplier; RPC_BNB_MAINNET, default
 *       https://bsc-dataseed.bnbchain.org), so each stand-in starts at its real token's multiplier.
 *   npx tsx scripts/bnb-stocks.ts apply <record> [<out.ts>]
 *       check a deployments/bnb-stocks/<chain>.json record (every stock, the test dollar, the faucet) and write it as
 *       core's bnb-stocks.deployed.ts (default packages/core/src/products/bnb-stocks.deployed.ts).
 *   npx tsx scripts/bnb-stocks.ts sync [<record>]
 *       compare each stand-in's multiplier (BNB Chain testnet, RPC_BNB_TESTNET) with its real token's (mainnet) and
 *       PRINT the owner's `cast send … setUIMultiplier` for each one out of step. It never sends it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPublicClient, http, type Address } from 'viem';
import { BNB_TESTNET_DEPLOYMENT, BSTOCK_SYMBOLS, BSTOCKS, bstockAbi, isDeployedAddress } from '../packages/core/src';

const MAINNET_RPC = process.env.RPC_BNB_MAINNET ?? 'https://bsc-dataseed.bnbchain.org';
const TESTNET_RPC = process.env.RPC_BNB_TESTNET ?? 'https://bsc-testnet-rpc.publicnode.com';
const CORE_FILE = 'packages/core/src/products/bnb-stocks.deployed.ts';

/** deployments/bnb-stocks/<chain>.json, as DeployBnbStocks.s.sol writes it. */
interface BnbRecord {
  chainId: number;
  owner: string;
  faucet: string;
  cash: string;
  tokens: Record<
    string,
    { token: string; multiplierFeed: string; multiplier: number | string; mainnetToken: string; decimals: number }
  >;
}

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
/** forge's writeJson nests serialized objects as strings; accept both. */
function readRecord(p: string): BnbRecord {
  const r = read<BnbRecord & { tokens: unknown }>(p);
  const tokens = (typeof r.tokens === 'string' ? JSON.parse(r.tokens) : r.tokens) as Record<string, unknown>;
  return {
    ...r,
    tokens: Object.fromEntries(
      Object.entries(tokens).map(([k, v]) => [k, (typeof v === 'string' ? JSON.parse(v) : v) as never]),
    ),
  };
}

/** What is wrong with a BNB testnet record (empty: nothing). */
export function checkRecord(r: BnbRecord): string[] {
  const e: string[] = [];
  if (r.chainId !== 97 && r.chainId !== 31337)
    e.push(`chainId ${r.chainId}: these test tokens live on BNB Chain testnet`);
  if (!isDeployedAddress(r.faucet)) e.push('faucet is not an address');
  if (!isDeployedAddress(r.cash)) e.push('cash (nmUSD) is not an address');
  for (const s of BSTOCK_SYMBOLS) {
    const t = r.tokens[s];
    if (!t) {
      e.push(`${s} missing`);
      continue;
    }
    if (!isDeployedAddress(t.token)) e.push(`${s} token is not an address`);
    if (!isDeployedAddress(t.multiplierFeed)) e.push(`${s} multiplierFeed is not an address`);
    if (t.mainnetToken.toLowerCase() !== BSTOCKS[s].mainnetToken.toLowerCase())
      e.push(`${s} stands in for ${t.mainnetToken}, not ${BSTOCKS[s].mainnetToken}`);
    if (Number(t.decimals) !== BSTOCKS[s].decimals) e.push(`${s} decimals ${t.decimals}`);
  }
  return e;
}

const client = (rpc: string) => createPublicClient({ transport: http(rpc) });
const multiplierOf = (rpc: string, token: string) =>
  client(rpc).readContract({ address: token as Address, abi: bstockAbi, functionName: 'uiMultiplier' });

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'env') {
  const mults = await Promise.all(BSTOCK_SYMBOLS.map((s) => multiplierOf(MAINNET_RPC, BSTOCKS[s].mainnetToken)));
  const out = {
    SYMBOLS: BSTOCK_SYMBOLS.join(','),
    NAMES: BSTOCK_SYMBOLS.map((s) => BSTOCKS[s].name).join(','),
    REAL: BSTOCK_SYMBOLS.map((s) => BSTOCKS[s].mainnetToken).join(','),
    MULTIPLIERS: mults.map(String).join(','),
  };
  // NAMES has spaces and parentheses: quoted for eval.
  for (const [k, v] of Object.entries(out)) console.log(`${k}='${v}'`);
} else if (cmd === 'apply') {
  const [file, outFile = CORE_FILE] = args;
  const r = readRecord(file);
  const errs = checkRecord(r);
  if (errs.length) throw new Error(`${file}: ${errs.join('; ')}`);
  const rows = BSTOCK_SYMBOLS.map(
    (s) => `    ${s}: { token: '${r.tokens[s].token}', multiplierFeed: '${r.tokens[s].multiplierFeed}' },`,
  ).join('\n');
  const ts = `/**
 * Where notes.markets' BNB Chain testnet tokens are deployed (docs/BNB-CHAIN.md). Written by
 * scripts/bnb-stocks.ts apply from ${file} (owner ${r.owner}). Edit by hand only to move to other addresses.
 */
import type { BnbDeployment } from './bnb-stocks';

export const BNB_TESTNET_DEPLOYMENT: BnbDeployment = {
  feedChain: 'binance_smart_chain-testnet',
  faucet: '${r.faucet}',
  cash: '${r.cash}',
  tokens: {
${rows}
  },
};
`;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, ts);
  console.log(`${outFile}: nmUSD ${r.cash}, ${BSTOCK_SYMBOLS.length} stand-ins and the faucet ${r.faucet}`);
} else if (cmd === 'sync') {
  const tokens = args[0]
    ? Object.fromEntries(Object.entries(readRecord(args[0]).tokens).map(([s, t]) => [s, t.token]))
    : Object.fromEntries(BSTOCK_SYMBOLS.map((s) => [s, BNB_TESTNET_DEPLOYMENT.tokens[s].token]));
  let behind = 0;
  for (const s of BSTOCK_SYMBOLS) {
    const real = await multiplierOf(MAINNET_RPC, BSTOCKS[s].mainnetToken);
    if (!isDeployedAddress(tokens[s])) {
      console.log(`${s}: real ${real} (stand-in not deployed)`);
      continue;
    }
    const mine = await multiplierOf(TESTNET_RPC, tokens[s]);
    if (mine === real) {
      console.log(`${s}: ${mine} = real`);
      continue;
    }
    behind++;
    console.log(`${s}: stand-in ${mine}, real ${real}. As the owner (not run here):`);
    console.log(
      `  cast send ${tokens[s]} 'setUIMultiplier(uint256,uint256)' ${real} 0 --rpc-url ${TESTNET_RPC} --account <owner>`,
    );
  }
  console.log(behind ? `${behind} stand-in(s) out of step` : 'every deployed stand-in matches its real token');
} else {
  console.error('usage: bnb-stocks.ts env | apply <record> [out] | sync [record]');
  process.exit(1);
}
