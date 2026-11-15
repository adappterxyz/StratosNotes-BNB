#!/usr/bin/env bash
# Deploy notes.markets' TEST STAND-INS for Coinbase's B20 stock tokens on Base Sepolia (docs/BASE-STOCKS.md): one
# B20StandIn per stock in packages/core B20_STOCKS (TSLAc, AMZNc, NVDAc, AAPLc, MSFTc, METAc; 8 decimals, each starting
# at its real token's multiplier, read from Base mainnet now), a B20MultiplierFeed next to each (physical delivery reads
# the multiplier through it), and one rate-limited B20StockFaucet. Writes deployments/base-stocks/base-sepolia.json and
# core's addresses (packages/core/src/products/base-stocks.deployed.ts), then the CRE and server configs.
#
#   bash scripts/deploy-base-stocks.sh                      # Base Sepolia (needs .keys/deployer.json, ~0.003 ETH)
#   EXTEND_PAIR=1 bash scripts/deploy-base-stocks.sh        # ... and add TSLAc.base… to the Robinhood-home / Base-vault
#                                                           #     pair (vault allow on Base, receipts on Robinhood Chain)
#   EXTEND_ONLY=1 bash scripts/deploy-base-stocks.sh        # only that, for stand-ins already deployed (the record)
#   REHEARSAL=1 [EXTEND_PAIR=1] bash scripts/deploy-base-stocks.sh   # the same on anvil forks; touches nothing live
#
# A rehearsal forks Base Sepolia (and Robinhood Chain testnet with EXTEND_PAIR=1), deploys with anvil's public test key
# #0 (never .keys), checks every read-back, claims from the faucet as anvil account #2, extends the live pair's fork by
# impersonating its owner, and writes only under deployments/local/rehearsal/; core's addresses file is applied for the
# checks and restored on exit.
#
# Live: refuses if deployments/base-stocks/base-sepolia.json exists (REDEPLOY=1 replaces it). The deployer key is read
# from .keys/deployer.json at run time, handed to forge in its environment only (DEPLOYER_KEY), never printed. OWNER
# (default the deployer) owns the tokens and the faucet: it moves multipliers (scripts/base-stocks.ts sync prints the
# calls), pauses and blocks for tests. After a live run: commit the record and base-stocks.deployed.ts, redeploy the
# Worker (served tokens), rebuild the CRE workflow, restart the issuer bots.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"
REHEARSAL="${REHEARSAL:-0}"
EXTEND_ONLY="${EXTEND_ONLY:-0}"
EXTEND_PAIR="${EXTEND_PAIR:-$EXTEND_ONLY}"
RPC_BASE="${RPC_BASE_SEPOLIA:-https://sepolia.base.org}"
RPC_RH="${RPC_ROBINHOOD_TESTNET:-https://rpc.testnet.chain.robinhood.com}"
CORE_FILE="packages/core/src/products/base-stocks.deployed.ts"
XC_HOME="robinhood-testnet"

ANVIL_KEY0=0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80
ANVIL_KEY2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
if [ "$REHEARSAL" = "1" ]; then
  DEPLOYER="$(cast wallet address "$ANVIL_KEY0")"
  deployer_key() { echo "$ANVIL_KEY0"; }
  echo "rehearsal: anvil's test key #0 ($DEPLOYER) on the forks"
elif [ -f .keys/deployer.json ]; then
  DEPLOYER="$(python3 -c "import json;print(json.load(open('.keys/deployer.json'))[0]['address'])")"
  deployer_key() { python3 -c "import json;k=json.load(open('$ROOT/.keys/deployer.json'))[0]['private_key'];print(k if k.startswith('0x') else '0x'+k)"; }
else
  echo "missing .keys/deployer.json"; exit 1
fi
OWNER="${OWNER:-$DEPLOYER}"

OUTBASE="deployments"
[ "$REHEARSAL" = "1" ] && OUTBASE="deployments/local/rehearsal"
RECORD="$OUTBASE/base-stocks/base-sepolia.json"
STEPS="$ROOT/$OUTBASE/base-stocks/steps"
if [ "$EXTEND_ONLY" = "1" ]; then
  [ -f "$RECORD" ] || { echo "EXTEND_ONLY: no $RECORD (deploy the stand-ins first)"; exit 1; }
elif [ "$REHEARSAL" != "1" ] && [ -f "$RECORD" ] && [ "${REDEPLOY:-0}" != "1" ]; then
  echo "$RECORD exists: the stand-ins are deployed (REDEPLOY=1 deploys new ones; notes holding the old ones keep them)"; exit 1
fi
rm -rf "$STEPS"; mkdir -p "$STEPS"

PIDS=()
CORE_BACKUP=""
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  if [ -n "$CORE_BACKUP" ] && [ -f "$CORE_BACKUP" ]; then cp "$CORE_BACKUP" "$ROOT/$CORE_FILE" && rm -f "$CORE_BACKUP"; fi
}
trap cleanup EXIT
fork() { # chain id, upstream rpc, port -> sets FORK_URL
  anvil --fork-url "$2" --chain-id "$1" --port "$3" --silent & PIDS+=($!)
  for _ in $(seq 1 60); do cast chain-id --rpc-url "http://127.0.0.1:$3" >/dev/null 2>&1 && break; sleep 1; done
  FORK_URL="http://127.0.0.1:$3"
}
if [ "$REHEARSAL" = "1" ]; then
  fork 84532 "$RPC_BASE" 28801; RPC_BASE="$FORK_URL"
  cast rpc anvil_setBalance "$DEPLOYER" 0x8AC7230489E80000 --rpc-url "$RPC_BASE" >/dev/null   # 10 ETH, fork only
  if [ "$EXTEND_PAIR" = "1" ]; then fork 46630 "$RPC_RH" 28802; RPC_RH="$FORK_URL"; fi
fi
[ "$(cast chain-id --rpc-url "$RPC_BASE")" = "84532" ] || { echo "RPC $RPC_BASE is not Base Sepolia"; exit 1; }
if [ "$EXTEND_ONLY" != "1" ]; then
bal="$(cast balance "$DEPLOYER" --rpc-url "$RPC_BASE" --ether)"
echo "== base-sepolia: deployer $DEPLOYER has $bal ETH"
python3 -c "import sys; sys.exit(0 if float('$bal') >= 0.003 else 1)" || { echo "fund the deployer on Base Sepolia first"; exit 1; }

# The stocks and their real multipliers (read-only eth_call on Base mainnet).
eval "$(npx tsx scripts/base-stocks.ts env)"
echo "== stand-ins: ${SYMBOLS//,/, } (multipliers from Base mainnet: $MULTIPLIERS)"
head="$(cast block-number --rpc-url "$RPC_BASE")"
(cd packages/evm-engine && export DEPLOYER_KEY="$(deployer_key)" && \
  OWNER="$OWNER" SYMBOLS="$SYMBOLS" NAMES="$NAMES" DECIMALS="$DECIMALS" MULTIPLIERS="$MULTIPLIERS" REAL="$REAL" \
  OUT="$ROOT/$RECORD" forge script script/DeployBaseStocks.s.sol --rpc-url "$RPC_BASE" --broadcast --slow \
  > "$STEPS/deploy.log" 2>&1) || { echo "deploy failed (see $STEPS/deploy.log)"; exit 1; }
python3 - "$RECORD" "$head" <<'EOF'
import json, sys
p, head = sys.argv[1], int(sys.argv[2])
d = json.load(open(p))
d["block"] = head
json.dump(d, open(p, "w"), indent=2)
open(p, "a").write("\n")
EOF
bc="packages/evm-engine/broadcast/DeployBaseStocks.s.sol/84532/run-latest.json"
[ -f "$bc" ] && python3 -c "
import json;d=json.load(open('$bc'));g=sum(int(r['gasUsed'],16) for r in d['receipts']);p=max(int(r.get('effectiveGasPrice','0x0'),16) for r in d['receipts'])
print('   gas used: %d over %d transaction(s), effective gas price %.4f gwei' % (g, len(d['receipts']), p/1e9))"

# Read back every stand-in: symbol, decimals, multiplier = the real one's, the feed answers it, the faucet drips it.
FAUCET="$(python3 -c "import json;print(json.load(open('$RECORD'))['faucet'])")"
i=0
IFS=, read -ra SYMS <<< "$SYMBOLS"; IFS=, read -ra MS <<< "$MULTIPLIERS"
for s in "${SYMS[@]}"; do
  t="$(python3 -c "import json;r=json.load(open('$RECORD'));v=r['tokens'];v=json.loads(v) if isinstance(v,str) else v;x=v['$s'];x=json.loads(x) if isinstance(x,str) else x;print(x['token'],x['multiplierFeed'])")"
  tok="${t% *}"; feed="${t#* }"
  [ "$(cast call "$tok" 'symbol()(string)' --rpc-url "$RPC_BASE")" = "\"$s\"" ] || { echo "$s: wrong symbol"; exit 1; }
  [ "$(cast call "$tok" 'decimals()(uint8)' --rpc-url "$RPC_BASE")" = "8" ] || { echo "$s: wrong decimals"; exit 1; }
  m="$(cast call "$tok" 'multiplier()(uint256)' --rpc-url "$RPC_BASE" | cut -d' ' -f1)"
  [ "$m" = "${MS[$i]}" ] || { echo "$s: multiplier $m != ${MS[$i]}"; exit 1; }
  a="$(cast call "$feed" 'latestRoundData()(uint80,int256,uint256,uint256,uint80)' --rpc-url "$RPC_BASE" | sed -n 2p | cut -d' ' -f1)"
  [ "$a" = "$m" ] || { echo "$s: multiplier feed answers $a"; exit 1; }
  [ "$(cast call "$tok" 'minter(address)(bool)' "$FAUCET" --rpc-url "$RPC_BASE")" = "true" ] || { echo "$s: faucet cannot mint"; exit 1; }
  echo "   $s $tok (multiplier $m; feed $feed)"
  i=$((i + 1))
done
echo "   faucet $FAUCET, $(cast call "$FAUCET" 'tokenCount()(uint256)' --rpc-url "$RPC_BASE") tokens listed"

if [ "$REHEARSAL" = "1" ]; then
  # A public claim, as anyone would (anvil account #2, fork only), then a second one inside the cooldown must fail.
  claimer="$(cast wallet address "$ANVIL_KEY2")"
  cast rpc anvil_setBalance "$claimer" 0xDE0B6B3A7640000 --rpc-url "$RPC_BASE" >/dev/null
  cast send "$FAUCET" 'claimAll()' --private-key "$ANVIL_KEY2" --rpc-url "$RPC_BASE" >/dev/null
  first="$(python3 -c "import json;r=json.load(open('$RECORD'));v=r['tokens'];v=json.loads(v) if isinstance(v,str) else v;x=v['${SYMS[0]}'];x=json.loads(x) if isinstance(x,str) else x;print(x['token'])")"
  echo "   faucet claimAll by $claimer: ${SYMS[0]} balance $(cast call "$first" 'balanceOf(address)(uint256)' "$claimer" --rpc-url "$RPC_BASE" | cut -d' ' -f1) (8 decimals)"
  if cast send "$FAUCET" "claim(address)" "$first" --private-key "$ANVIL_KEY2" --rpc-url "$RPC_BASE" >/dev/null 2>&1; then
    echo "   faucet let a second claim through inside the cooldown"; exit 1
  fi
  echo "   a second claim inside the cooldown reverts (TooSoon)"
  CORE_BACKUP="$STEPS/base-stocks.deployed.ts.orig"
  cp "$CORE_FILE" "$CORE_BACKUP"
fi
npx tsx scripts/base-stocks.ts apply "$RECORD"
fi # EXTEND_ONLY

if [ "$EXTEND_PAIR" = "1" ]; then
  XC="deployments/crosschain/$XC_HOME.json"
  [ -f "$XC" ] || { echo "no $XC: deploy the Robinhood-home / Base-vault pair first (scripts/deploy-crosschain.sh)"; exit 1; }
  VAULT="$(python3 -c "import json;x=json.load(open('$XC'));print([r for r in x['remotes'] if r['chain']=='base-sepolia'][0]['vault'])")"
  GATEWAY="$(python3 -c "import json;print(json.load(open('$XC'))['home']['gateway'])")"
  XOWNER="$(python3 -c "import json;print(json.load(open('$XC')).get('owner',''))")"
  eval "$(npx tsx scripts/base-stocks.ts extend-env "$RECORD")"
  echo "== extend the pair: vault $VAULT (Base Sepolia) allows ${XS_SYMBOLS//.base/}, gateway $GATEWAY (Robinhood Chain) gets ${XS_SYMBOLS//,/, }"
  signer=()
  if [ "$REHEARSAL" = "1" ]; then
    # The forks keep the live owner: impersonate it (forks only).
    for r in "$RPC_BASE" "$RPC_RH"; do
      cast rpc anvil_impersonateAccount "$XOWNER" --rpc-url "$r" >/dev/null
      cast rpc anvil_setBalance "$XOWNER" 0xDE0B6B3A7640000 --rpc-url "$r" >/dev/null
    done
    signer=(--unlocked --sender "$XOWNER")
  fi
  xc_role() { # rpc, role, out
    (cd packages/evm-engine && { [ "$REHEARSAL" = "1" ] || export DEPLOYER_KEY="$(deployer_key)"; } && \
      ROLE="$2" OUT="$3" forge script script/DeployCrossChain.s.sol --rpc-url "$1" --broadcast --slow "${signer[@]}" \
      > "$STEPS/$2.log" 2>&1) || { echo "$2 failed (see $STEPS/$2.log)"; exit 1; }
  }
  CHAIN=base-sepolia VAULT="$VAULT" TOKENS="$XS_TOKENS" xc_role "$RPC_BASE" allow ""
  CHAIN="$XC_HOME" GATEWAY="$GATEWAY" REMOTE=base-sepolia TOKENS="$XS_TOKENS" DECIMALS="$XS_DECIMALS" SYMBOLS="$XS_SYMBOLS" \
    xc_role "$RPC_RH" receipts "$STEPS/receipts.json"
  for t in ${XS_TOKENS//,/ }; do
    [ "$(cast call "$VAULT" 'allowedToken(address)(bool)' "$t" --rpc-url "$RPC_BASE")" = "true" ] || { echo "vault does not allow $t"; exit 1; }
  done
  mkdir -p "$OUTBASE/crosschain"
  npx tsx scripts/base-stocks.ts extend-assemble "$XC" "$STEPS/receipts.json" "$OUTBASE/crosschain/$XC_HOME.json"
fi

if [ "$REHEARSAL" = "1" ]; then
  # What the configs would serve with these addresses (core's file is restored on exit).
  npx tsx -e "
    import { realTokens, pickCrossChain } from './packages/core/src/served-config';
    import { STOCK_TOKEN_FAUCETS } from './packages/core/src';
    import { readFileSync, existsSync } from 'node:fs';
    const t = realTokens('base-sepolia');
    console.log('   served on base-sepolia:', Object.keys(t).join(', '));
    console.log('   stock faucet:', STOCK_TOKEN_FAUCETS['base-sepolia']);
    const f = '$OUTBASE/crosschain/$XC_HOME.json';
    if (existsSync(f)) {
      const { xs, warnings } = pickCrossChain([{ file: f, data: JSON.parse(readFileSync(f, 'utf8')) }]);
      console.log('   pair record:', xs.length ? 'valid, receipts ' + Object.keys(xs[0].remotes[0].receipts).join(', ') : warnings.join('; '));
    }"
else
  npx tsx scripts/cre-config.ts staging
  npx tsx scripts/server-config.ts
fi
echo "done: $RECORD"
