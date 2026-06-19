# Keel — Readiness Checklist

A single place to see what is done, what is pending, and the exact gate before
going live. Status keywords match `docs/verify-in-docs.md`.

---

## A. Perception (CMC) — READY

- [x] CMC REST `quotes/latest` (price, 1h, 24h) — **confirmed**
- [x] Fear & Greed `v3/fear-and-greed/latest` — **confirmed**
- [x] Risk-engine inputs feed `keel.cjs` v0.2 — **confirmed**
- [ ] CMC MCP path — **not tested** (only needed if MCP is adopted)

## B. Decision (risk engine) — READY (dry-run)

- [x] Risk score + 3-component formula — **implemented & run**
- [x] Mode selection + target exposure — **implemented & run**
- [ ] Guardrails + kill-switch as structured code — **pending** (pure logic, no
  funds; build next)
- [ ] Rebalance band / anti-churn — **pending**

## C. Execution (TWAK) — PARTIAL

- [x] Authentication (`twak init`) — **confirmed**
- [x] Swap **quote** path — **confirmed**
- [x] Self-custody wallet created (sealed keystore, keychain password) —
  **confirmed**
- [~] Wallet **balance** fetch — **partial/risky** (transient `NETWORK_ERROR`;
  re-verify)
- [ ] **Tiny real swap** (execute with `--password`) — **not tested (fund-gated)**
- [ ] Live local signing of a real tx — **not tested (fund-gated)**

## D. Payments (x402) — PARTIAL

- [x] x402 **client** (`twak x402 info`: V1+V2, EIP-3009+Permit2) — **confirmed**
- [x] Settlement capability (Base/BSC, USDC, `--max-payment`) — **confirmed**
- [ ] Real **paid** `request` call — **not tested (fund-gated)**

## E. Identity (BNB Agent SDK) — PARTIAL

- [x] `pip install bnbagent` on Python 3.14.5 — **confirmed**
- [x] `resolve_network('bsc-mainnet')` (registry + gas-free) — **confirmed**
- [ ] `register_agent` on-chain (gas-free) — **not tested**

## F. Venue / proof (BSC) — PARTIAL

- [x] BSC supported (`twak chains`) — **confirmed**
- [x] Agent BSC address resolves — **confirmed**
- [ ] Real tx hash + explorer proof — **pending** (exists after first live action)

## G. Assets — READY

- [x] Allowlist (ETH, CAKE, LINK, USDT, USDC, USD1, FDUSD) verified in supported
  universe — **confirmed**
- [x] BNB = gas only; BTC/BTCB excluded — **confirmed**

## H. UI (`apps/web`) — IN PROGRESS

- [x] Stack chosen (Next.js + TS + Tailwind + Recharts) — **done**
- [x] Scaffold + design tokens started — **in progress**
- [ ] All components with mock data (spot model) — **pending**
- [ ] Build/typecheck passes — **pending**
- [ ] Live state wired in — **pending** (after agent execution is live)

## I. Docs — READY

- [x] plan, handoff, architecture, risk-policy, demo-script,
  readiness-checklist, verify-in-docs — **done**
- [ ] `proofs/integration-results.md` populated with raw outputs/tx hashes —
  **pending** (fill as live actions run)

---

## The fund-gated gate (final, before live)

Do these in order, recording raw output + tx hashes into
`proofs/integration-results.md`:

1. **Back up** `~/.twak` directory + keychain password (the wallet has no
   exported seed).
2. **Fund** the agent wallet with a small amount on BSC (plus a little BNB for
   gas) and a little USDC on Base for x402.
3. **Tiny real swap** via TWAK (`--password`) — capture tx hash.
4. **Real x402 paid call** (`twak x402 request ... --prefer-network base
   --max-payment 10000 --yes`) — capture settlement.
5. **On-chain agent registration** (`twak compete register`) — capture tx /
   status.
6. **Identity registration** via `bnbagent` (gas-free) — capture result.
7. Re-verify **wallet balance** returns cleanly.

## Go-live criteria

- All five guardrails implemented and unit-checked.
- Kill-switch verified to trigger below the intended drawdown limit.
- At least one real swap, one x402 paid call, identity + on-chain registration
  all recorded with proof in `proofs/integration-results.md`.
- Dashboard shows live state (no mock) with working tx-hash proof links.
- Liveness (≥1 action/day) scheduled; never-dust invariant holds.