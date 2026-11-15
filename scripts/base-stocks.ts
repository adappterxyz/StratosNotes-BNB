/**
 * notes.markets' B20 stock stand-ins on Base Sepolia (docs/BASE-STOCKS.md): the helper behind
 * scripts/deploy-base-stocks.sh, and the multiplier sync. packages/core is the single source of truth for which
 * stocks there are (B20_STOCKS) and where they are deployed (BASE_SEPOLIA_STOCKS, base-stocks.deployed.ts).
 * Every chain read here is a read-only eth_call; nothing here signs or sends a transaction.
 *
 *   npx tsx scripts/base-stocks.ts env
 *       shell assignments for DeployBaseStocks.s.sol: SYMBOLS, NAMES, DECIMALS, REAL (the Coinbase tokens on Base
 *       mainnet) and MULTIPLIERS, read from those tokens on Base mainnet now (RPC_BASE_MAINNET, default
 *       https://mainnet.base.org), so each stand-in starts at its real token's multiplier.
 *   npx tsx scripts/base-stocks.ts apply <record> [<out.ts>]
 *       check a deployments/base-stocks/<chain>.json record (every stock, addresses) and write it as core's
 *       base-stocks.deployed.ts (default packages/core/src/products/base-stocks.deployed.ts).
 *   npx tsx scripts/base-stocks.ts extend-env <record>
 *       shell assignments for adding the stand-ins to the Robinhood-home / Base-vault pair (EXTEND_PAIR=1): TOKENS,
 *       DECIMALS, SYMBOLS of the TSLAc.base… receipts.
 *   npx tsx scripts/base-stocks.ts extend-assemble <xc-record> <receipts.json> <out>
 *       merge the new receipts (DeployCrossChain.s.sol ROLE=receipts output) into the pair's record and check it.
 *   npx tsx scripts/base-stocks.ts sync [<record>]
 *       compare each stand-in's multiplier (Base Sepolia, RPC_BASE_SEPOLIA) with its real token's (Base mainnet) and
 *       PRINT the owner's `cast send … setMultiplier` for each one out of step. It never sends it.
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPublicClient, http, type Address } from 'viem';
import {
  B20_STOCKS,
  B20_SYMBOLS,
  b20Abi,
  BASE_SEPOLIA_STOCKS,
  checkCrossChainDeployment,
  isDeployedAddress,
  RECEIPT_SUFFIX,
  type B20Symbol,
  type CrossChainDeployment,
} from '../packages/core/src';

const MAINNET_RPC = process.env.RPC_BASE_MAINNET ?? 'https://mainnet.base.org';
const SEPOLIA_RPC = process.env.RPC_BASE_SEPOLIA ?? 'https://sepolia.base.org';
const CORE_FILE = 'packages/core/src/products/base-stocks.deployed.ts';
const ADDR = /^0x[0-9a-fA-F]{40}$/;

/** deployments/base-stocks/<chain>.json, as DeployBaseStocks.s.sol writes it. */
interface StandInRecord {
  chainId: number;
  owner: string;
  faucet: string;
  tokens: Record<
    string,
    { token: string; multiplierFeed: string; multiplier: number | string; mainnetToken: string; decimals: number }
  >;
}

const read = <T>(p: string): T => JSON.parse(readFileSync(p, 'utf8')) as T;
/** forge's writeJson nests serialized objects as strings; accept both. */
function readRecord(p: string): StandInRecord {
  const r = read<StandInRecord & { tokens: unknown }>(p);
  const tokens = (typeof r.tokens === 'string' ? JSON.parse(r.tokens) : r.tokens) as Record<string, unknown>;
  return {
    ...r,
    tokens: Object.fromEntries(
      Object.entries(tokens).map(([k, v]) => [k, (typeof v === 'string' ? JSON.parse(v) : v) as never]),
    ),
  };
}

/** What is wrong with a stand-in record (empty: nothing). */
export function checkRecord(r: StandInRecord): string[] {
  const e: string[] = [];
  if (r.chainId !== 84532 && r.chainId !== 31337) e.push(`chainId ${r.chainId}: stand-ins live on Base Sepolia`);
  if (!ADDR.test(r.faucet)) e.push('faucet is not an address');
  for (const s of B20_SYMBOLS) {
    const t = r.tokens[s];
    if (!t) {
      e.push(`${s} missing`);
      continue;
    }
    if (!isDeployedAddress(t.token)) e.push(`${s} token is not an address`);
    if (!isDeployedAddress(t.multiplierFeed)) e.push(`${s} multiplierFeed is not an address`);
    if (t.mainnetToken.toLowerCase() !== B20_STOCKS[s].mainnetToken.toLowerCase())
      e.push(`${s} stands in for ${t.mainnetToken}, not ${B20_STOCKS[s].mainnetToken}`);
    if (Number(t.decimals) !== B20_STOCKS[s].decimals) e.push(`${s} decimals ${t.decimals}`);
  }
  return e;
}

const client = (rpc: string) => createPublicClient({ transport: http(rpc) });
const multiplierOf = (rpc: string, token: string) =>
  client(rpc).readContract({ address: token as Address, abi: b20Abi, functionName: 'multiplier' });

const [cmd, ...args] = process.argv.slice(2);

if (cmd === 'env') {
  const mults = await Promise.all(B20_SYMBOLS.map((s) => multiplierOf(MAINNET_RPC, B20_STOCKS[s].mainnetToken)));
  const out = {
    SYMBOLS: B20_SYMBOLS.join(','),
    NAMES: B20_SYMBOLS.map((s) => B20_STOCKS[s].name).join(','),
    DECIMALS: B20_SYMBOLS.map((s) => B20_STOCKS[s].decimals).join(','),
    REAL: B20_SYMBOLS.map((s) => B20_STOCKS[s].mainnetToken).join(','),
    MULTIPLIERS: mults.map(String).join(','),
  };
  // NAMES has spaces: quoted for eval.
  for (const [k, v] of Object.entries(out)) console.log(`${k}='${v}'`);
} else if (cmd === 'apply') {
  const [file, outFile = CORE_FILE] = args;
  const r = readRecord(file);
  const errs = checkRecord(r);
  if (errs.length) throw new Error(`${file}: ${errs.join('; ')}`);
  const rows = B20_SYMBOLS.map(
    (s) => `    ${s}: { token: '${r.tokens[s].token}', multiplierFeed: '${r.tokens[s].multiplierFeed}' },`,
  ).join('\n');
  const ts = `/**
 * Where notes.markets' B20 stand-ins are deployed on Base Sepolia (docs/BASE-STOCKS.md). Written by
 * scripts/base-stocks.ts apply from ${file} (owner ${r.owner}). Edit by hand only to move to other addresses.
 */
import type { B20Deployment } from './base-stocks';

export const BASE_SEPOLIA_STOCKS: B20Deployment = {
  feedChain: 'ethereum-testnet-sepolia-base-1',
  faucet: '${r.faucet}',
  tokens: {
${rows}
  },
};
`;
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, ts);
  console.log(`${outFile}: ${B20_SYMBOLS.length} stand-ins and the faucet ${r.faucet}`);
} else if (cmd === 'extend-env') {
  const r = readRecord(args[0]);
  const out = {
    XS_TOKENS: B20_SYMBOLS.map((s) => r.tokens[s].token).join(','),
    XS_DECIMALS: B20_SYMBOLS.map((s) => B20_STOCKS[s].decimals).join(','),
    XS_SYMBOLS: B20_SYMBOLS.map((s) => `${s}.${RECEIPT_SUFFIX['base-sepolia']}`).join(','),
  };
  for (const [k, v] of Object.entries(out)) console.log(`${k}=${v}`);
} else if (cmd === 'extend-assemble') {
  const [xcFile, receiptsFile, outFile] = args;
  const x = read<CrossChainDeployment>(xcFile);
  const w = read<{ receipts: Record<string, string> | string; vault: string }>(receiptsFile);
  const receipts = typeof w.receipts === 'string' ? (JSON.parse(w.receipts) as Record<string, string>) : w.receipts;
  const remote = x.remotes.find((r) => r.chain === 'base-sepolia');
  if (!remote) throw new Error(`${xcFile}: no Base Sepolia vault behind this gateway`);
  if (remote.vault.toLowerCase() !== w.vault.toLowerCase()) throw new Error('the gateway answers to another vault');
  for (const s of B20_SYMBOLS) {
    const sym = `${s}.${RECEIPT_SUFFIX['base-sepolia']}`;
    if (!receipts[sym]) throw new Error(`no receipt for ${sym}`);
    remote.receipts[sym] = {
      receipt: receipts[sym],
      token: BASE_SEPOLIA_STOCKS.tokens[s as B20Symbol].token,
      decimals: B20_STOCKS[s].decimals,
      valuedAs: s,
    };
  }
  const errs = checkCrossChainDeployment(x);
  if (errs.length) throw new Error(`${outFile}: ${errs.join('; ')}`);
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(x, null, 2) + '\n');
  console.log(`${outFile}: + ${B20_SYMBOLS.map((s) => `${s}.base`).join(', ')}`);
} else if (cmd === 'sync') {
  const tokens = args[0]
    ? Object.fromEntries(Object.entries(readRecord(args[0]).tokens).map(([s, t]) => [s, t.token]))
    : Object.fromEntries(B20_SYMBOLS.map((s) => [s, BASE_SEPOLIA_STOCKS.tokens[s].token]));
  let behind = 0;
  for (const s of B20_SYMBOLS) {
    const real = await multiplierOf(MAINNET_RPC, B20_STOCKS[s].mainnetToken);
    if (!isDeployedAddress(tokens[s])) {
      console.log(`${s}: real ${real} (stand-in not deployed)`);
      continue;
    }
    const mine = await multiplierOf(SEPOLIA_RPC, tokens[s]);
    if (mine === real) {
      console.log(`${s}: ${mine} = real`);
      continue;
    }
    behind++;
    console.log(`${s}: stand-in ${mine}, real ${real}. As the owner (not run here):`);
    console.log(`  cast send ${tokens[s]} 'setMultiplier(uint256)' ${real} --rpc-url ${SEPOLIA_RPC} --account <owner>`);
  }
  console.log(behind ? `${behind} stand-in(s) out of step` : 'every deployed stand-in matches its real token');
} else {
  console.error(
    'usage: base-stocks.ts env | apply <record> [out] | extend-env <record> | extend-assemble <xc> <receipts> <out> | sync [record]',
  );
  process.exit(1);
}
