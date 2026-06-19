# Keel — Drawdown-Aware Autonomous Spot Agent

Keel is a drawdown-aware autonomous spot trading agent running on BNB Chain.
SPOT ONLY. No perps, no leverage, no futures, no margin.

Registered agent wallet: `0x66af72374Eb358cf939bc1954b8F62EfcF08E10a`

---

## Phase 5 — Deployment Story

### What Keel does

Each day, Keel attempts one **minimum-risk qualifying trade** via a
risk-engine → gate-chain pipeline:

1. **Market signals** — fetches ETH 1h/24h change and Fear & Greed index
   from CoinMarketCap (REST). If `HUB_ENABLED=yes`, also queries the CMC
   Agent Hub MCP for enrichment (non-critical path: Hub failure falls back
   to REST automatically).
2. **Risk score** — computes `R = clamp01(|c1h|/3·0.4 + |c24h|/10·0.4 + (fg−60)/40·0.2)`
   and maps to a mode: Risk-on (R<0.33, 80% volatile target), Neutral
   (R<0.66, 45%), or Risk-off (R≥0.66, 18%).
3. **Post-formula overlays** — drawdown overlay (≤−8%: cap 45%), emergency
   mode (≤−14%: cap 18%), macro-event, TA-caution, regime-bias.
4. **Gate chain** (unmodified, in order): kill-switch → allowlist →
   per-trade cap → daily-loss cap → slippage.
5. **Asymmetric projected-drawdown gate** (additive §4): blocks
   risk-increasing trades when projected volatile exposure would exceed the
   overlay cap; risk-reducing rotations always pass.
6. **Execution** — via TWAK (`@trustwallet/cli`), the sole execution layer.
   Password is read from `BNB_WALLET_PASSWORD` and never logged.
7. **Fallback qualification** — if the normal trade is blocked, attempts a
   minimum-size (default $2) drawdown-neutral stable-to-stable swap
   (USDT → USDC). Not guaranteed to count unless organizers confirm
   stable-to-stable swaps satisfy qualification criteria.
8. **Persistence** — HWM, per-day ledger, and JSONL audit log persisted to
   `KEEL_DATA_DIR` (default `./data`).

### Honesty constraints (§0a)

These phrases are **mandatory** in code, logs, and UI. Do not substitute
marketing-positive alternatives:

- "daily qualification scheduler" (not "daily trade")
- "minimum-risk qualifying attempt" (not "guaranteed qualifying trade")
- "drawdown-neutral fallback swap" (not "DQ-proof swap")
- "drawdown-resistant" (not "drawdown-proof")
- "not guaranteed unless organizers confirm stable-to-stable counts"

### Kill-switch

Internal threshold at −18% drawdown from HWM. When triggered, the agent
flattens all volatile holdings to stables via TWAK. Kill-switch is the only
path that bypasses daily idempotency (it can re-run within the same calendar
day).

---

## Running a cycle

```bash
# Dry-run preview (no funds move):
PORTFOLIO_VALUE_USD=500 VOLATILE_VALUE_USD=280 STABLE_VALUE_USD=215 \
  npm run run:cycle

# Live execution (requires wallet funded + env vars):
I_UNDERSTAND_REAL_FUNDS=yes \
  BNB_WALLET_PASSWORD=<password> \
  CMC_PRO_API_KEY=<key> \
  PORTFOLIO_VALUE_USD=500 \
  VOLATILE_VALUE_USD=280 \
  STABLE_VALUE_USD=215 \
  npm run run:cycle
```

The runner exits after one cycle. Re-invocation on the same calendar day
returns `SKIPPED` (day ledger idempotency).

---

## Deploying on Render

See **[docs/deploy.md](docs/deploy.md)** for the full deployment guide.

Quick summary:

- **Agent runner** → Render **Cron Job**, start command: `npm run run:cycle`
- **Dashboard** → Render **Web Service**, build: `npm run build`, start: `npm start --workspace=apps/web`
- Use a **Render Disk** for persistent state (`KEEL_DATA_DIR=/data`)
- Set `I_UNDERSTAND_REAL_FUNDS=yes`, `BNB_WALLET_PASSWORD`, `CMC_PRO_API_KEY` as **encrypted secrets**
- `HUB_ENABLED=yes` and `X402_ENABLED=yes` are optional beta integrations — **never on the critical path** of the qualifying trade
- Recommended cron cadence: **hourly** (`0 * * * *`)

---

## Package structure

```
packages/
  agent/        — Risk engine, gate chain, scheduler, TWAK wrapper, persistence
  shared/       — Shared TypeScript types (no runtime deps)
apps/
  web/          — Next.js 15 dashboard with real data wiring + simulation labels
docs/
  deploy.md     — Render deployment guide
  risk-policy.md — Risk formula specification
```

---

## Key invariants

- **SPOT ONLY.** Perps, futures, leverage, margin, order book are forbidden everywhere.
- **TWAK is the sole execution layer.** No direct contract calls.
- **Allowlist is hard.** Only ETH, CAKE, LINK (volatile) and USDT, USDC,
  USD1, FDUSD (stable) may be traded. BNB is gas-only.
- **`risk/engine.ts`, `loop/cycle.ts`, `loop/gate.ts` are never modified.**
  All extensions are additive new files.
- **`BNB_WALLET_PASSWORD` never appears in logs, audit entries, returned
  objects, or committed files.** Audit output always shows `<redacted>`.
- **`I_UNDERSTAND_REAL_FUNDS=yes` is required for live execution.** Omitting
  it causes the runner to throw before any funds move.
