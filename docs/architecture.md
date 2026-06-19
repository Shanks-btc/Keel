# Keel — Architecture

How Keel is put together: the layers, the data flow, the loop, the guardrails,
the self-custody model, and the UI. This is the technical companion to
`docs/plan.md`.

---

## 1. Layered design

Each layer has one job. The separation is deliberate and must be preserved.

```
            ┌──────────────────────────────────────────────────────┐
            │                      Keel agent                       │
            │                                                       │
  CMC  ───▶  │  Perception ──▶ Risk engine ──▶ Mode + target alloc  │
 (data)     │                                     │                 │
            │                                     ▼                 │
            │                      Guardrails (allowlist, caps,     │
            │                       slippage, drawdown kill-switch) │
            │                                     │                 │
            │                                     ▼                 │
  TWAK ◀───  │                 Execution (self-custody swap)  ──────┼──▶ BSC
 (sign/swap)│                                     │                 │  (tx hash)
            │                                     ▼                 │
            │                  Decision + proof logging             │
            │                                     │                 │
  x402 ◀───  │      (rationed paid confirmation, inside loop)       │
            │                                                       │
 BNB SDK ◀─  │      (on-chain identity / metadata, out-of-band)     │
            └──────────────────────────────────────────────────────┘
```

### Perception — CMC
Reads price, 1h change, 24h change, and Fear & Greed. These four values are the
only market inputs the risk engine consumes today. Node global `fetch`; header
`X-CMC_PRO_API_KEY`.

### Decision — risk engine
Collapses the signals into one score `R` (formula in `docs/risk-policy.md`),
maps `R` to a mode (risk-on / neutral / risk-off) and a target volatile
exposure. Pure, deterministic, no side effects.

### Execution — TWAK (sole execution layer)
The only component that signs and sends. Self-custody local signing; keys never
leave the machine (sealed keystore in `~/.twak`, password in OS keychain). Spot
swaps only, via the confirmed quote/execute command forms. Computes the rotation
from current holdings toward the target allocation, within guardrails.

### Payments — x402 (rationed, in-loop)
One paid confirmation call when it genuinely helps a decision (e.g. confirming a
regime change), using TWAK's native x402 (`request`) with a hard `--max-payment`
cap, on Base/USDC. Real spend, not decoration; skipped when not needed.

### Identity — BNB Agent SDK (out-of-band)
Registers the agent's on-chain identity / metadata via `bnbagent` (ERC-8004,
gas-free). **Never executes trades.** Optional risk-score-as-metadata only.

### Venue — BSC
All swaps and proofs settle on BNB Smart Chain. Cheap gas + fast blocks make
frequent rebalancing viable. Every action yields a tx hash usable as proof.

---

## 2. The loop

1. Perceive (CMC: price, 1h, 24h, Fear & Greed).
2. Score risk → `R`.
3. Select mode + target volatile exposure.
4. Compare to current holdings; decide buy / sell / rebalance / hold within the
   **rebalance band** (to avoid churn under simulated/real tx costs).
5. Run guardrail checks (allowlist, per-trade cap, daily-loss cap, slippage,
   drawdown). If max-drawdown breached → **kill-switch** → rotate to stables.
6. If a trade is warranted, get a TWAK quote, validate slippage via
   `priceImpact` / `minReceived`, then execute (self-custody sign + send).
7. Optionally pay one x402 confirmation call when a regime change needs it.
8. Log the decision, the reason, and the tx hash (proof).
9. Sleep until next cycle. Ensure at least one action per day (liveness).

---

## 3. Guardrails

| Guardrail | Purpose |
|-----------|---------|
| Token allowlist | Only ETH, CAKE, LINK, USDT, USDC, USD1, FDUSD are tradeable; BNB gas-only. |
| Per-trade cap | Limits the size of any single swap. |
| Daily-loss cap | Halts new risk-taking after a daily loss threshold. |
| Slippage limit | Rejects a swap whose `priceImpact` / `minReceived` is worse than allowed. |
| Max-drawdown kill-switch | Hard backstop: on breach, rotate to stables. Never to dust. |

The agent **never drains to dust** — risk-off and the kill-switch both target
**stables** (full value, in-scope), never an empty wallet.

---

## 4. Self-custody model

- Wallet created locally via TWAK; encrypted keystore in `~/.twak`; password in
  the OS keychain.
- No private key or seed is exported (TWAK exposes no export command — keys stay
  sealed). Backup = the `~/.twak` directory + keychain password.
- Every signature happens locally through TWAK for the whole trade loop. There is
  **no custodial step anywhere**.

---

## 5. Repo / module structure (target)

```
keel/
  apps/
    web/                  # the dashboard (Next.js + TS + Tailwind + Recharts)
  src/ (or agent/)        # the structured agent (from keel.cjs)
    perception/           # CMC reads
    risk/                 # risk engine (pure)
    guardrails/           # caps, slippage, drawdown, kill-switch (pure)
    execution/            # TWAK wrapper (quote, execute, balance)
    identity/             # bnbagent registration (out-of-band)
    payments/             # x402 rationed call
    loop/                 # orchestration + logging
  docs/
  proofs/
  keel.cjs                # dry-run prototype (kept as reference)
```

Use npm workspaces. Do not switch package managers.

---

## 6. UI architecture — Professional Autonomous Trading Terminal

Stack: **Next.js + TypeScript + Tailwind + Recharts**, in `apps/web`, **mock data
first**. No landing page, no settings yet.

### Feel
Trading-native, human-designed, professional, clean, serious, proof-driven,
self-custody, risk-controlled. **Not** AI-generated, cyberpunk, neon,
glassmorphic, fake-futuristic, generic SaaS, or a generic AI-agent dashboard.
Reference: TradingView clarity, Binance/OKX seriousness, Hyperliquid/dYdX
structure, Stripe typography, Linear/Vercel polish, Datadog log/proof reliability.

### Design tokens
```
Background:      #0B0F14
Surface:         #10161F
Card:            #131A24
Card elevated:   #161F2B
Border:          #263241
Text primary:    #F8FAFC
Text secondary:  #94A3B8
Text muted:      #64748B
Buy / profit / risk-on:   #22C55E (green)
Sell / loss / risk-off:   #EF4444 (red)
Neutral / warning:        #F59E0B (amber)
Proof / action links:     #3B82F6 (blue)  — blue ONLY for proof/links
```

### Typography
- **Geist Sans** — interface text.
- **Geist Mono** — portfolio numbers, prices, percentages, tx hashes, wallet
  addresses, timestamps, logs. **Tabular numbers** on.

### Layout
1. **Top trading bar** — Keel wordmark + subtitle, agent status, current mode,
   wallet short address, last updated (live), Pause/Resume, Refresh.
2. **Trading summary row** (above the fold): Portfolio Value, 24h PnL, Current
   Exposure, Latest Swap, Current Drawdown.
3. **Main trading grid**:
   - Portfolio Allocation (donut)
   - Spot Holdings (table)
   - Market Signals
   - Risk Score Breakdown (3 components only)
   - Drawdown Guardrail (chart)
   - Latest Autonomous Swap
   - Proof Trail
   - x402 Confirmation
4. **Bottom**: Swap / Decision Log (table), System Health, Agent Controls.

### Components
`AppShell`, `TopTradingBar`, `TradingSummaryRow`, `PortfolioValueCard`,
`PnLCard`, `ExposureCard`, `LatestSwapCard`, `DrawdownSummaryCard`,
`PortfolioAllocationCard`, `SpotHoldingsTable`, `MarketSignalsCard`,
`RiskScoreBreakdownCard`, `DrawdownGuardrailChart`, `LatestAutonomousSwapCard`,
`ProofTrailCard`, `X402ConfirmationCard`, `SwapDecisionLogTable`,
`SystemHealthCard`, `AgentControls`.

### Table columns
**Spot Holdings:** Asset · Role (Volatile / Stable / Gas) · Balance · USD Value ·
Allocation % · 24h Change.
**Swap / Decision Log:** Time · Mode · Action (Buy / Sell / Rebalance / Hold) ·
Route (e.g. `USDT → ETH`) · Size · Value · Reason · Tx Hash.

### Risk Score Breakdown — honesty constraint
Show **only** the three components the engine computes: 1h price change, 24h
price change, Fear & Greed. Do not display Volatility / Liquidity / Derivatives /
Correlation unless the code actually computes them.

### Language rules
Allowed: spot swap, buy, sell, rebalance, volatile allocation, stable
allocation, spot holdings, latest swap, swap route, tx hash, proof trail,
drawdown guardrail.
Forbidden: PERP, futures, leverage, long, short, entry price, mark price,
liquidation, order book, manual-exchange language.

### Mock data shape (first build)
Provide typed mock objects for: portfolio value + 24h series, PnL (realized /
unrealized), exposure, holdings[], allocation[], market signals, risk score +
3 components, drawdown series + limits, latest swap (route, amountIn, amountOut,
value, reason, time, txHash), proof trail entries, x402 confirmations, swap log
rows, system health items, agent status/mode.