/**
 * Where a note runs, chosen first: each network this deployment serves (from /api/config), its cash token (USDG on
 * Robinhood Chain, USDC on Base) and the tokens it takes as collateral, read from @sn/core's CHAIN_TOKENS so new
 * tokens on a chain show up here by themselves. ChainCards opens the Issue page, ChainPicker is the compact switch on
 * the wizard's first step, ChainChip keeps the choice in view on every step.
 */
import { ArrowLeftRight } from 'lucide-react';
import { CHAIN_CASH, CHAIN_TOKENS, isNoteChain, NOTE_CHAIN_SHORT } from '@sn/core';
import { AssetIcon, AssetStack } from '../AssetIcon';

type Chain = { key: string; name: string };

/** "Robinhood Chain", "Base". */
export const shortName = (c: Chain) => (isNoteChain(c.key) ? NOTE_CHAIN_SHORT[c.key] : c.name);
/** The chain's cash token, or its served stablecoin. */
export const cashOn = (c: Chain & { stablecoin?: { symbol: string } }) =>
  isNoteChain(c.key) ? CHAIN_CASH[c.key].token : (c.stablecoin?.symbol ?? 'USD');
/** The tokens a note on this chain can take as collateral or deliver, besides its cash. */
export function tokensOn(key: string): string[] {
  if (!isNoteChain(key)) return [];
  return Object.values(CHAIN_TOKENS[key])
    .filter((t) => t.valuedAs && t.valuedAs !== 'USD')
    .map((t) => t.token);
}

export function ChainPicker({
  chains,
  value,
  onPick,
}: {
  chains: ReadonlyArray<Chain>;
  value: string;
  onPick: (key: string) => void;
}) {
  return (
    <div className="seg" role="radiogroup" aria-label="Network" data-chain-picker>
      {chains.map((c) => (
        <button
          key={c.key}
          type="button"
          role="radio"
          aria-checked={c.key === value}
          className={c.key === value ? 'active' : ''}
          data-chain={c.key}
          onClick={() => c.key !== value && onPick(c.key)}
          title={`${c.name}${isNoteChain(c.key) ? `: paid in ${CHAIN_CASH[c.key].token}` : ''}`}
        >
          {shortName(c)}
        </button>
      ))}
    </div>
  );
}

/** The Issue page's first choice: one card per network, with what it raises and what it takes. */
export function ChainCards({
  chains,
  value,
  onPick,
}: {
  chains: ReadonlyArray<Chain & { stablecoin?: { symbol: string } }>;
  value: string | null;
  onPick: (key: string) => void;
}) {
  return (
    <div className="iw-chains" role="radiogroup" aria-label="Where the note runs" data-chain-cards>
      {chains.map((c) => {
        const cash = cashOn(c);
        const toks = tokensOn(c.key);
        return (
          <button
            key={c.key}
            type="button"
            role="radio"
            aria-checked={c.key === value}
            className={`iw-chain${c.key === value ? ' on' : ''}`}
            data-chain={c.key}
            onClick={() => onPick(c.key)}
          >
            <span className="iw-chain-name">{shortName(c)}</span>
            <span className="iw-chain-cash">
              <AssetIcon sym={cash} size={18} />
              Raise {cash}
            </span>
            {toks.length > 0 && (
              <span className="iw-chain-toks">
                <AssetStack syms={toks.slice(0, 6)} size={16} label={false} />
                <span>{toks.join(', ')}</span>
              </span>
            )}
            <span className="iw-chain-net">{c.name}</span>
          </button>
        );
      })}
    </div>
  );
}

/** The choice, in view on every step: "Base · USDC", with a way to change it. */
export function ChainChip({
  chain,
  onChange,
}: {
  chain: (Chain & { stablecoin?: { symbol: string } }) | undefined;
  onChange?: () => void;
}) {
  if (!chain) return null;
  const cash = cashOn(chain);
  return (
    <span className="iw-chip" data-chain-chip={chain.key}>
      <AssetIcon sym={cash} size={16} />
      <span>
        Runs on <b>{shortName(chain)}</b> · raises <b>{cash}</b>
      </span>
      {onChange && (
        <button type="button" className="linkish" onClick={onChange}>
          <ArrowLeftRight className="i" />
          Change
        </button>
      )}
    </span>
  );
}

/** What a note on `key` can deliver and pledge, in one line for the network field's hint. */
export function chainHint(key: string): string {
  const cash = isNoteChain(key) ? CHAIN_CASH[key].token : 'its stablecoin';
  const toks = tokensOn(key);
  const name = isNoteChain(key) ? NOTE_CHAIN_SHORT[key] : key;
  const other =
    key === 'base-sepolia'
      ? " Robinhood's stock tokens, USDG or WETH can also back it, locked on Robinhood Chain via Chainlink CCIP."
      : key === 'robinhood-testnet'
        ? ' USDC or WETH can also back it, locked on Base via Chainlink CCIP.'
        : '';
  return `Notes on ${name} are issued and paid in ${cash} there. Below the money-back line a note can deliver ${toks.length ? toks.join(', ') : 'nothing but cash'}; every other underlying settles in cash. Collateral: ${[cash, ...toks].join(', ')} pledged into the note.${other}`;
}
