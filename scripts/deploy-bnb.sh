#!/usr/bin/env bash
# BNB Chain testnet as the third note chain (docs/BNB-CHAIN.md), end to end:
#   1. the engine and lens on BNB Chain testnet (scripts/deploy-testnets.sh CHAINS=bnb-testnet);
#   2. notes.markets' test tokens there: the nmUSD test dollar, one stand-in per bStock (each at its real token's
#      multiplier, read from BNB Chain mainnet now), their multiplier feeds and the faucet
#      (script/DeployBnbStocks.s.sol) -> deployments/bnb-stocks/bnb-testnet.json, and core's bnb-stocks.deployed.ts;
#   3. cross-chain collateral, four new pairs (scripts/deploy-crosschain.sh):
#        BNB home  <- vault on Robinhood Chain (USDG, WETH, TSLA, AMZN, AMD, PLTR .rh)
#        BNB home  <- vault on Base Sepolia     (USDC, WETH, the B20 stand-ins .base)
#        Robinhood Chain home <- vault on BNB   (nmUSD and the bStocks stand-ins .bnb; the gateway is kept)
#        Base home            <- vault on BNB   (the same; the gateway is kept)
#   4. the CRE staging config and the server configs (each step regenerates them on a live run).
#
#   REHEARSAL=1 bash scripts/deploy-bnb.sh     # all of it on anvil forks of the three chains: nothing live is touched
#   bash scripts/deploy-bnb.sh                 # live (needs tBNB on BNB Chain testnet for the deployer)
#
# A live run skips what is already deployed (the engine, the tokens' record, a pair whose gateway already has the
# vault), so it can be re-run after a failure. The deployer key is read from .keys/deployer.json by each step and
# handed to forge in its environment only, never printed. A rehearsal writes only under deployments/local/rehearsal/
# and restores core's bnb-stocks.deployed.ts on exit.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.foundry/bin:$PATH"
REHEARSAL="${REHEARSAL:-0}"
CORE_FILE="packages/core/src/products/bnb-stocks.deployed.ts"
export RPC_ROBINHOOD_TESTNET="${RPC_ROBINHOOD_TESTNET:-https://rpc.testnet.chain.robinhood.com}"
export RPC_BASE_SEPOLIA="${RPC_BASE_SEPOLIA:-https://sepolia.base.org}"
export RPC_BNB_TESTNET="${RPC_BNB_TESTNET:-https://bsc-testnet-rpc.publicnode.com}"
[ -f .keys/deployer.json ] || { echo "missing .keys/deployer.json"; exit 1; }
DEPLOYER="$(python3 -c "import json;print(json.load(open('.keys/deployer.json'))[0]['address'])")"
deployer_key() { python3 -c "import json;k=json.load(open('$ROOT/.keys/deployer.json'))[0]['private_key'];print(k if k.startswith('0x') else '0x'+k)"; }
OWNER="${OWNER:-$DEPLOYER}"

OUTBASE="deployments"
PIDS=()
CORE_BACKUP=""
cleanup() {
  for p in "${PIDS[@]:-}"; do [ -n "$p" ] && kill "$p" 2>/dev/null || true; done
  if [ -n "$CORE_BACKUP" ] && [ -f "$CORE_BACKUP" ]; then cp "$CORE_BACKUP" "$CORE_FILE"; rm -f "$CORE_BACKUP"; echo "(rehearsal: $CORE_FILE restored)"; fi
}
trap cleanup EXIT
if [ "$REHEARSAL" = "1" ]; then
  OUTBASE="deployments/local/rehearsal"
  CORE_BACKUP="$(mktemp)"; cp "$CORE_FILE" "$CORE_BACKUP"
  # One fork per chain, shared by every step (FORKS=1), so later steps see what earlier ones deployed.
  port=28800
  for pair in "robinhood-testnet:46630:RPC_ROBINHOOD_TESTNET" "base-sepolia:84532:RPC_BASE_SEPOLIA" "bnb-testnet:97:RPC_BNB_TESTNET"; do
    IFS=: read -r chain id var <<<"$pair"
    port=$((port + 1))
    anvil --fork-url "${!var}" --chain-id "$id" --port "$port" --silent & PIDS+=($!)
    for _ in $(seq 1 60); do cast chain-id --rpc-url "http://127.0.0.1:$port" >/dev/null 2>&1 && break; sleep 1; done
    cast rpc anvil_setBalance "$DEPLOYER" 0x8AC7230489E80000 --rpc-url "http://127.0.0.1:$port" >/dev/null   # 10, fork only
    export "$var=http://127.0.0.1:$port"
    echo "fork: $chain at http://127.0.0.1:$port"
  done
  export REHEARSAL=1 FORKS=1
  rm -rf "$OUTBASE/bnb-stocks" "$OUTBASE/bnb-testnet.json" "$OUTBASE/crosschain"
  mkdir -p "$OUTBASE"
else
  bal="$(cast balance "$DEPLOYER" --rpc-url "$RPC_BNB_TESTNET" --ether)"
  echo "== BNB Chain testnet: deployer $DEPLOYER has $bal tBNB"
  python3 -c "import sys; sys.exit(0 if float('$bal') >= 0.03 else 1)" \
    || { echo "fund the deployer with tBNB first (~0.03: engine, tokens, a gateway with a 0.005 fee pool, two vaults; https://www.bnbchain.org/en/testnet-faucet)"; exit 1; }
fi

echo "== 1/4 engine on BNB Chain testnet"
CHAINS=bnb-testnet bash scripts/deploy-testnets.sh

echo "== 2/4 nmUSD, the bStocks stand-ins, their multiplier feeds and the faucet"
RECORD="$OUTBASE/bnb-stocks/bnb-testnet.json"
if [ "$REHEARSAL" != "1" ] && [ -f "$RECORD" ] && [ "${REDEPLOY:-0}" != "1" ]; then
  echo "   $RECORD exists: the tokens are deployed (REDEPLOY=1 deploys new ones; notes holding the old ones keep them)"
else
  eval "$(npx tsx scripts/bnb-stocks.ts env)"
  echo "   multipliers from BNB Chain mainnet: $MULTIPLIERS"
  mkdir -p "$(dirname "$RECORD")"
  (cd packages/evm-engine && export DEPLOYER_KEY="$(deployer_key)" && \
    OWNER="$OWNER" SYMBOLS="$SYMBOLS" NAMES="$NAMES" MULTIPLIERS="$MULTIPLIERS" REAL="$REAL" OUT="$ROOT/$RECORD" \
    forge script script/DeployBnbStocks.s.sol --rpc-url "$RPC_BNB_TESTNET" --broadcast --slow > "$ROOT/$OUTBASE/deploy-bnb-stocks.log" 2>&1) \
    || { echo "token deploy failed (see $OUTBASE/deploy-bnb-stocks.log)"; exit 1; }
fi
npx tsx scripts/bnb-stocks.ts apply "$RECORD"
# Read back: symbol, decimals, the multiplier as the feed answers it, the faucet a minter of each.
python3 - "$RECORD" <<'PY' > "$ROOT/$OUTBASE/bnb-readback.txt"
import json, sys
r = json.load(open(sys.argv[1]))
t = r['tokens']; t = json.loads(t) if isinstance(t, str) else t
print(r['cash'], r['faucet'])
for s, v in t.items():
    v = json.loads(v) if isinstance(v, str) else v
    print(s, v['token'], v['multiplierFeed'], v['multiplier'])
PY
{ read -r CASH FAUCET; while read -r sym tok feed mult; do
    [ "$(cast call "$tok" 'symbol()(string)' --rpc-url "$RPC_BNB_TESTNET" | tr -d '"')" = "$sym" ] || { echo "$sym: symbol mismatch"; exit 1; }
    [ "$(cast call "$feed" 'latestAnswer()(int256)' --rpc-url "$RPC_BNB_TESTNET" | cut -d' ' -f1)" = "$mult" ] || { echo "$sym: the feed does not answer $mult"; exit 1; }
    [ "$(cast call "$tok" 'minter(address)(bool)' "$FAUCET" --rpc-url "$RPC_BNB_TESTNET")" = "true" ] || { echo "$sym: the faucet is not a minter"; exit 1; }
    echo "   $sym $tok (multiplier $mult, feed $feed)"
  done; } < "$ROOT/$OUTBASE/bnb-readback.txt"
CASH="$(head -1 "$ROOT/$OUTBASE/bnb-readback.txt" | cut -d' ' -f1)"
echo "   nmUSD $CASH ($(cast call "$CASH" 'decimals()(uint8)' --rpc-url "$RPC_BNB_TESTNET") decimals), faucet $(head -1 "$ROOT/$OUTBASE/bnb-readback.txt" | cut -d' ' -f2)"
if [ "$REHEARSAL" = "1" ]; then
  # The faucet works: anvil's account #2 claims everything once.
  ANVIL_KEY2=0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a
  FAUCET="$(head -1 "$ROOT/$OUTBASE/bnb-readback.txt" | cut -d' ' -f2)"
  cast send "$FAUCET" 'claimAll()' --private-key "$ANVIL_KEY2" --rpc-url "$RPC_BNB_TESTNET" >/dev/null
  echo "   faucet claimAll: nmUSD $(cast call "$CASH" 'balanceOf(address)(uint256)' "$(cast wallet address "$ANVIL_KEY2")" --rpc-url "$RPC_BNB_TESTNET" | cut -d' ' -f1) (6 decimals)"
fi

rm -f "$ROOT/$OUTBASE/bnb-readback.txt"

echo "== 3/4 cross-chain pairs"
for pair in "bnb-testnet robinhood-testnet" "bnb-testnet base-sepolia" "robinhood-testnet bnb-testnet" "base-sepolia bnb-testnet"; do
  read -r H A <<<"$pair"
  xc="$OUTBASE/crosschain/$H.json"; [ -f "$xc" ] || xc="deployments/crosschain/$H.json"
  if [ -f "$xc" ] && python3 -c "import json,sys;r=json.load(open('$xc'));sys.exit(0 if any(x['chain']=='$A' for x in r['remotes']) else 1)"; then
    echo "   notes on $H <- $A: already wired ($xc), skipped"
    continue
  fi
  echo "   notes on $H <- collateral on $A"
  HOME_CHAIN="$H" ASSET_CHAIN="$A" bash scripts/deploy-crosschain.sh
done

echo "== 4/4 configs"
if [ "$REHEARSAL" = "1" ]; then
  for f in "$OUTBASE"/crosschain/*.json; do npx tsx scripts/xc-plan.ts check "$f"; done
  echo "done (rehearsal): $OUTBASE/"
else
  npx tsx scripts/cre-config.ts staging
  npx tsx scripts/server-config.ts
  echo "done. Then: commit deployments/ and core's bnb-stocks.deployed.ts, deploy the Worker (npm run deploy), restart the keeper and the issuer bots (pm2; ops/ecosystem.config.cjs now starts one for BNB Chain testnet)."
fi
