# Keel
### Drawdown-Resistant Autonomous SPOT Trading Agent on BNB Chain

Keel optimizes for staying alive while capturing upside. It's a self-custodied, SPOT-only autonomous agent that reads market signals, computes a transparent risk score, and rotates a portfolio on BSC — with every decision logged to a verifiable on-chain audit trail.

[Live Dashboard](https://keel-production-90fe.up.railway.app/) · [GitHub](https://github.com/Shanks-btc/Keel) · [BNB Chain Mainnet](https://bscscan.com/address/0x66af72374Eb358cf939bc1954b8F62EfcF08E10a)

---

## What Keel Does

Most autonomous trading agents chase upside and get wiped out on the first real drawdown. Keel is built backwards from that failure mode: a deterministic 3-component risk engine reads live market signals from the **CoinMarketCap Agent Hub** (with REST fallback for reliability), computes a transparent risk score, and rotates a self-custodied portfolio across BSC via **TWAK (Trust Wallet Agent Kit)**. The agent never holds custody risk for its operator — TWAK signs locally, and no private key, password, or seed phrase is ever exposed to the dashboard or stored by the app.

A daily qualification scheduler attempts the lowest-risk valid action every day — **never forced into risk, but never skipping a day either.** An asymmetric drawdown gate always permits de-risking, never blocks it. A hard kill-switch and per-trade caps stay active at all times. Every cycle's reasoning — signals used, risk score, mode, gate results, and outcome — is persisted to an audit log and surfaced live on the dashboard.

Keel does not claim to be "DQ-proof" or risk-free. It is designed to be **drawdown-resistant** and **disqualification-resistant** — and it says so, explicitly, in its own UI.

---

## Live Demo — Proof of Life

Captured against the real registered agent wallet on BSC Mainnet:

| Output | Value |
|---|---|
| Agent Wallet | `0x66af72374Eb358cf939bc1954b8F62EfcF08E10a` |
| Competition Registration | [View tx ↗](https://bscscan.com/tx/0x006151e42ceb1b151ddcd7b172b9dd2087cbabbe7fbe3a58c63274c3fa6ac305) |
| First Qualifying BSC Swap | [View tx ↗](https://bscscan.com/tx/0x99ef6856cd679a65a7d7877b97bd5a4f525b98b0b61a2589481f2a108e6d9854) |
| Execution Layer | TWAK — self-custodial, local signing |
| Custody Model | Self-custodial. No private key ever touches the dashboard. |
| Test Coverage | 270/270 tests passing |

**Independent verification** — anyone can confirm these are real, on-chain BSC transactions by opening either link above directly on BSCScan. No API key, no AetherCredit-style server in the trust path — the proof is the blockchain itself.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      Perception Layer                       │
│   CMC Agent Hub (MCP) — primary price + enrichment          │
│   REST API — always-on fallback                             │
│   Signals: price, 1h/24h change, Fear & Greed, RSI,         │
│   BTC dominance, upcoming macro events                      │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                  Deterministic Risk Engine                  │
│   R = |1h|/3·0.4 + |24h|/10·0.4 + max(0,(F&G−60)/40)·0.2     │
│   Risk-on (R<0.33) → 80% volatile                           │
│   Neutral (R<0.66) → 45% volatile                           │
│   Risk-off          → 18% volatile                          │
│   No LLM in the trading decision — fully auditable           │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Post-Formula Overlays (additive only)          │
│   Drawdown overlay — caps volatile target below mode default │
│   Macro-event de-risk — pre-emptive caution near events      │
│   TA-caution / Regime-bias — from Hub enrichment signals      │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Daily Qualification Scheduler                  │
│   Never forced into risk, but always attempts the lowest-    │
│   risk valid qualifying action — minimum-risk fallback if    │
│   nothing else qualifies                                    │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              Guardrail / Gate Chain                          │
│   Kill-switch → Allowlist → Per-trade cap → Daily-loss cap   │
│   → Slippage → Asymmetric projected-drawdown gate            │
│   (de-risking trades are never blocked by their own check)   │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                 TWAK — Sole Execution Layer                 │
│   Self-custodial, local signing. No browser-side signing.    │
│   No key ever stored or processed by the dashboard.          │
└────────────────────────┬──────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│              On-Chain Proof + Audit Trail                   │
│   Real BSC tx hash per execution. Full cycle reasoning        │
│   persisted and shown live on the dashboard.                 │
└─────────────────────────────────────────────────────────────┘
```

---

## Modules Used

### 1. TWAK (Trust Wallet Agent Kit)
The sole execution layer. Self-custodial wallet, local signing, BSC-native swap routing. TWAK is what makes Keel an *autonomous* agent rather than a signal generator someone else has to manually execute — the agent itself proposes, gates, and signs every trade.

**Why it matters:** without self-custodial execution, "autonomous" trading agents reduce to alert bots. TWAK lets Keel hold and act on its own wallet with no human in the loop, while never exposing the underlying key material anywhere in the stack.

### 2. CoinMarketCap Agent Hub (MCP)
Primary verified price source for the risk engine, with automatic REST fallback so the daily trade never depends on a beta service. Additional Hub tools (`get_crypto_technical_analysis`, `get_upcoming_macro_events`, `get_global_metrics_latest`) feed three post-formula overlays — the macro-event de-risk overlay is the headline use: Keel pre-emptively reduces volatile exposure ahead of scheduled high-impact events sourced directly from the Hub.

**Why it matters:** REST alone gives price. The Hub gives Keel context — technical conditions, macro calendar, market regime — used as real numeric inputs to a deterministic overlay, never as an LLM-driven guess.

### 3. BNB Chain (BSC)
All trading happens on BSC. The agent's identity is registered on-chain. Every qualifying swap produces a real, independently verifiable BSC transaction.

---

## Risk Engine Formula

```
R = clamp01(
      min(1, |Δ1h| / 3)  × 0.4
    + min(1, |Δ24h| / 10) × 0.4
    + max(0, (FearGreed - 60) / 40) × 0.2
)

Risk-on   (R < 0.33) → 80% volatile target
Neutral   (R < 0.66) → 45% volatile target
Risk-off  (otherwise) → 18% volatile target
```

Deterministic. No oracle, no LLM, no human judgment in the trading decision — fully reproducible from the same three inputs every time.

**Allowlist (hard-coded, enforced by gate):**
- Volatile: ETH, CAKE, LINK
- Stable: USDT, USDC, USD1, FDUSD
- BNB: gas reserve only — never counted as portfolio

---

## Tech Stack

| Layer | Technology |
|---|---|
| Agent core | Node.js, TypeScript |
| Dashboard | Next.js 15, React, Tailwind |
| Execution | TWAK (Trust Wallet Agent Kit) |
| Market data | CoinMarketCap REST + Agent Hub (MCP) |
| Blockchain | BNB Chain (BSC), self-custodial signing |
| Testing | Vitest — 270 tests passing |
| Deployment | Railway (single service, persistent volume) |

---

## Local Deployment

### Prerequisites
- Node.js 18+
- npm
- A TWAK-compatible wallet keystore (`twak init` / `twak wallet create`)

### 1. Clone Repository
```bash
git clone https://github.com/Shanks-btc/Keel.git
cd Keel
```

### 2. Install
```bash
npm install
```

### 3. Configure Environment
Copy `.env.example` to `.env` and fill in:
```
CMC_API_KEY=<your CoinMarketCap key>
HUB_ENABLED=yes
PORTFOLIO_VALUE_USD=<starting portfolio value>
VOLATILE_VALUE_USD=0
STABLE_VALUE_USD=<starting portfolio value>
BNB_WALLET_PASSWORD=<your wallet password>
I_UNDERSTAND_REAL_FUNDS=yes   # only when ready to go live
```

### 4. Dry-Run (no funds at risk)
```bash
npm run cycle:dry
```

### 5. Run a Real Cycle
```bash
npm run run:cycle
```

### 6. Run the Dashboard
```bash
npm run dev --workspace=apps/web
# http://localhost:3000
```

---

## Live Links

| Resource | URL |
|---|---|
| Live Dashboard | https://keel-production-90fe.up.railway.app/ |
| GitHub | https://github.com/Shanks-btc/Keel |
| Agent Wallet (BSC) | https://bscscan.com/address/0x66af72374Eb358cf939bc1954b8F62EfcF08E10a |
| Registration Tx | https://bscscan.com/tx/0x006151e42ceb1b151ddcd7b172b9dd2087cbabbe7fbe3a58c63274c3fa6ac305 |
| First Qualifying Swap | https://bscscan.com/tx/0x99ef6856cd679a65a7d7877b97bd5a4f525b98b0b61a2589481f2a108e6d9854 |

---

## How Honesty Is Enforced, By Design

Keel's dashboard never shows a fake number. Every card has an explicit, honest empty state — `"Awaiting first live cycle"`, `"No live trades recorded yet"` — rather than a placeholder dressed up as real data. Source labeling is explicit throughout: `LIVE` (real wallet/snapshot data), `SIMULATION` (configured estimate, never shown as live), or an honest awaiting-data state. Wording is held to a strict standard: **"drawdown-resistant" and "disqualification-resistant," never "DQ-proof" or "guaranteed."**

This extends to the agent's own self-reporting: when a live execution attempt fails, the scheduler logs `BLOCKED` with the exact reason — it never fabricates a success.

---

## Project Structure

```
Keel/
  packages/
    agent/
      src/
        risk/
          engine.ts          ← deterministic 3-mode formula (protected, untouched)
          overlays.ts        ← drawdown + Hub enrichment overlays
        loop/
          cycle.ts           ← core decision cycle (protected, untouched)
          gate.ts            ← guardrail chain (protected, untouched)
          drawdown-gate.ts   ← asymmetric projected-drawdown gate
          scheduler.ts       ← daily qualification scheduler
        perception/
          cmc.ts             ← REST signals
          hub.ts             ← CMC Agent Hub (MCP) client
          signals.ts         ← Hub-primary / REST-fallback orchestrator
        execution/
          twak.ts            ← TWAK execution layer
          x402.ts            ← rationed x402 paid-call integration
        state/
          persistence.ts     ← state + day-ledger persistence
          audit.ts           ← append-only audit log
        runner.ts            ← single-cycle entrypoint
    shared/
      src/types.ts           ← shared type definitions
  apps/
    web/
      src/
        app/
          api/                ← agent-state, portfolio, cycle-preview, health
        components/           ← dashboard cards
  server.js                  ← Railway single-service entrypoint
```

---

## Team

Solo builder — full-stack and blockchain developer, four years of experience, focused on Web3/AI agent infrastructure. Built Keel end-to-end: risk engine, TWAK execution integration, CMC Agent Hub signals, autonomous scheduler, and the live dashboard.

| Channel | Handle |
|---|---|
| X | [@Shank_btc](https://x.com/Shank_btc) |
| GitHub | [Shanks-btc](https://github.com/Shanks-btc) |
| Email | pkelvin856@gmail.com |
