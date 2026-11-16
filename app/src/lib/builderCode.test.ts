/**
 * The Base builder code: the ERC-8021 suffix (vectors from ox's Attribution.toDataSuffix), which chains carry it,
 * and that a wallet client built with it sends it at the end of the calldata.
 */
import { describe, expect, it } from 'vitest';
import { createWalletClient, custom, encodeFunctionData, parseAbi, type WalletClient } from 'viem';
import { baseSepolia } from 'viem/chains';
import { builderCodeSuffix, builderSuffixFor } from './builderCode';
import { withBuilderCode } from './chains';

const SUFFIX = '0x62635f62376b33703964610b0080218021802180218021802180218021';

describe('builder code', () => {
  it('encodes the ERC-8021 suffix', () => {
    expect(builderCodeSuffix('baseapp')).toBe('0x62617365617070070080218021802180218021802180218021');
    expect(builderCodeSuffix('bc_b7k3p9da')).toBe(SUFFIX);
  });

  it('refuses what the format cannot carry', () => {
    expect(() => builderCodeSuffix('a,b')).toThrow();
    expect(() => builderCodeSuffix('has space')).toThrow();
  });

  it('applies on Base chains only, and only when a code is set', () => {
    expect(builderSuffixFor(84532, 'bc_b7k3p9da')).toBe(SUFFIX);
    expect(builderSuffixFor(8453, ' bc_b7k3p9da ')).toBe(SUFFIX);
    expect(builderSuffixFor(46630, 'bc_b7k3p9da')).toBeUndefined();
    expect(builderSuffixFor(84532, '')).toBeUndefined();
    expect(builderSuffixFor(84532, undefined)).toBeUndefined();
  });

  it('a wallet client with the code appends it to the calldata it sends', async () => {
    const account = '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266' as const;
    const sent: Array<{ data?: string }> = [];
    const request = async ({ method, params }: { method: string; params?: unknown }) => {
      if (method === 'eth_sendTransaction') {
        sent.push((params as Array<{ data?: string }>)[0]);
        return `0x${'11'.repeat(32)}`;
      }
      if (method === 'eth_chainId') return '0x14a34';
      throw new Error(`unexpected ${method}`);
    };
    const wallet = createWalletClient({ account, chain: baseSepolia, transport: custom({ request }) }) as WalletClient;
    const abi = parseAbi(['function approve(address spender, uint256 amount)']);
    const call = { abi, address: account, functionName: 'approve', args: [account, 1n], gas: 100_000n } as const;
    const plain = encodeFunctionData(call);

    expect(withBuilderCode(wallet, undefined)).toBe(wallet);
    await withBuilderCode(wallet, SUFFIX).writeContract({ ...call, account, chain: baseSepolia });
    expect(sent[0].data).toBe(plain + SUFFIX.slice(2));
  });
});
