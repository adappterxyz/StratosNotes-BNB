/**
 * Base builder code (ERC-8021): a short id from dashboard.base.org, appended to the calldata of every transaction a
 * wallet sends from this app on a Base chain, so Base can attribute the activity to notes.markets. Contracts ignore
 * the extra bytes. Set at build time with VITE_BUILDER_CODE; unset, nothing is appended.
 */
import { concat, numberToHex, stringToHex, type Hex } from 'viem';

/** Base mainnet and Base Sepolia: the chains whose transactions carry the code. */
export const BUILDER_CODE_CHAINS: readonly number[] = [8453, 84532];

/** Sixteen bytes of 0x8021 repeated: marks calldata that ends in an ERC-8021 suffix. */
const ERC_8021_MARKER: Hex = `0x${'8021'.repeat(8)}`;

/**
 * The ERC-8021 suffix (schema 0, the canonical registry) for a builder code: the code in ASCII, its length, the
 * schema id, the marker (read from the end of the calldata backwards). Throws on a code the format cannot carry.
 */
export function builderCodeSuffix(code: string): Hex {
  if (!/^[\x21-\x7e]{1,255}$/.test(code) || code.includes(','))
    throw new Error(`Not a builder code: ${JSON.stringify(code)}`);
  return concat([stringToHex(code), numberToHex(code.length, { size: 1 }), '0x00', ERC_8021_MARKER]);
}

/** The suffix for transactions on `chainId`, or undefined: no code is set, or the chain is not a Base chain. */
export function builderSuffixFor(
  chainId: number,
  code: string | undefined = import.meta.env.VITE_BUILDER_CODE,
): Hex | undefined {
  const c = code?.trim();
  if (!c || !BUILDER_CODE_CHAINS.includes(chainId)) return undefined;
  return builderCodeSuffix(c);
}
