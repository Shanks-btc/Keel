# Keel — Plan (Source of Truth)

This document is the canonical reference for what Keel is, how it behaves, and
what has actually been built and verified so far. Read this before writing or
changing any code. If something here conflicts with code, this document and the
verification record in `docs/verify-in-docs.md` win — unless a newer successful
test says otherwise.

Core rule for this repo: **do not guess, do not hallucinate, do not mark
something verified unless it was actually tested successfully in practice.**
Anything not yet exercised end-to-end is labelled honestly (`partial`, `risky`,
`not tested`, or `[VERIFY IN DOCS]`).

---

## 1. Product definition

Keel is a **drawdown-aware autonomous spot trading agent on BNB Chain (BSC)**.

Most trading agents optimize entry signals — when to buy. Keel optimizes for
**staying alive while still capturing upside**. It takes real exposure but
refuses reckless drawdowns. It is the kind of agent a self-custody holder would
actually let run unattended, because it is built not to blow up.

### What Keel does, each cycle

1. Watches the market by reading CMC signals:
   - price
   - 1h price change
   - 24h price change
   - Fear & Greed
2. Computes **one** risk score from those signals.
3. Picks one of three modes:
   - **Risk-on** — mostly in a volatile token (e.g. ETH).
   - **Neutral** — balanced volatile/stable allocation.
   - **Risk-off** — mostly stables, but **never fully parked**.
4. Executes the rotation itself through self-custody execution.
5. Logs *why* it acted (the decision and its reason).
6. Exposes an on-chain **tx hash** as proof of each action.
7. Enforces a hard **max-drawdown kill-switch** as the backstop. Only the
   kill-switch fully flattens exposure.

---

## 2. Trading model — SPOT ONLY (hard constraint)

Keel is a **spot-rotation** agent. This is a permanent product constraint and a
common source of mistakes, so it is stated explicitly.

**Allowed concepts:** spot swap, buy, sell, rebalance, hold, spot holdings,
portfolio allocation, exposure, volatile allocation, stable allocation, latest
swap, swap route, tx hash, proof trail, drawdown guardrail.

**Forbidden — never appear in code, data, or UI:**
- PERP / perpetuals / futures
- leverage / margin
- long / short
- entry price / mark price
- liquidation
- order book
- any manual-exchange / leveraged-trading language

Keel rotates between volatile tokens and stables. It swaps; it does not take
leveraged positions. A "position" in Keel is simply a **spot holding** (a token
balance), and "side" is the **mode**, not long/short.

---

## 3. Assets (allowlist)

Keel trades only from a fixed allowlist of supported BEP-20 tokens. The active
set:

- **Volatile (risk-on targets):** ETH, CAKE, LINK
- **Stables (risk-off targets):** USDT, USDC, USD1, FDUSD
- **BNB:** held only as a **tiny gas reserve**, never a main trading position
  unless later verified and explicitly added.

Confirmed against the supported on-chain asset universe in this chat: ETH, CAKE,
LINK, USDT, USDC, USD1, FDUSD are all supported. **BNB, BTC, and BTCB are NOT in
the tradeable set** — BNB is gas only; BTC/BTCB must not appear as holdings.

Any asset shown in the UI or held by the agent must come from this allowlist.

---

## 4. Architecture (summary)

Full detail in `docs/architecture.md`. Roles, kept strictly separate:

- **TWAK (Trust Wallet Agent Kit)** — the **sole execution layer**. Self-custody
  local signing; keys never leave the machine. Swaps, balances, on-chain
  registration, native x402, native ERC-8004.
- **CMC (CoinMarketCap)** — the **market perception layer**. Price, 1h/24h
  change, Fear & Greed feed the risk score.
- **x402** — **one rationed paid confirmation call** inside the loop, used only
  where pay-per-call genuinely helps. Native through TWAK. Real, not decoration.
- **BNB Agent SDK (`bnbagent`)** — **on-chain identity, metadata, and an
  optional risk-score service only**. It is **not** the execution layer.
- **BSC** — the venue. Cheap gas and fast blocks make frequent rebalancing
  economically viable. All proof links resolve on BSC.

### Guardrails (all five are real, not cosmetic)

- token allowlist
- per-trade cap
- daily-loss cap
- slippage limit
- max-drawdown kill-switch

Keel **never drains to dust**. Risk-off means *mostly stables*, not zero
exposure; the kill-switch rotates to stables (in-scope, full value), never to an
empty/dust wallet.

---

## 5. Risk engine (current, as implemented in the dry-run prototype)

Implemented and run successfully in `keel.cjs` v0.2. Full policy in
`docs/risk-policy.md`.

Risk score `R` from three live components (the only three currently computed):

```
R = clamp01(
      min(1, |change_1h|  / 3 ) * 0.4   // short-term volatility
    + min(1, |change_24h| / 10) * 0.4   // daily volatility
    + max(0, (fearGreed - 60) / 40) * 0.2  // greed premium (fear adds nothing)
)
```

Mode from `R`:

| R range        | Mode      | Target volatile exposure |
|----------------|-----------|--------------------------|
| `R < 0.33`     | Risk-on   | ~80%                     |
| `0.33–0.66`    | Neutral   | ~45%                     |
| `R ≥ 0.66`     | Risk-off  | ~18% (never 0)           |

Design note: plain fear does not add risk (only large moves and greed do),
because a calm-but-fearful tape is often an entry, while violent moves and
euphoria are what threaten drawdown. This is intentional and tunable.

**The UI must display only these three risk components** (1h change, 24h change,
Fear & Greed). Do not show Volatility/Liquidity/Derivatives/Correlation unless
the engine actually computes them.

---

## 6. UI direction

Full spec in `docs/architecture.md` (UI section). Summary:

**Professional Autonomous Trading Terminal.** Trading-native first, risk always
visible, proof one click away. It must feel human-designed, professional, clean,
serious, proof-driven, self-custody, risk-controlled. It must **not** feel
AI-generated, cyberpunk, neon, glassmorphic, fake-futuristic, generic SaaS, or
like a generic AI-agent dashboard.

Reference feel: TradingView clarity, Binance/OKX portfolio seriousness,
Hyperliquid/dYdX trading-native structure, Stripe financial typography,
Linear/Vercel spacing and polish, Datadog-style log/proof reliability.

Stack: **Next.js + TypeScript + Tailwind + Recharts**, in `apps/web`, **mock
data first**. No landing page first. No complex settings yet.

Language rules for the UI match Section 2 exactly: spot-only vocabulary, never
perps/leverage/long/short.

---

## 7. Build status

- **Decision brain (dry-run):** DONE. `keel.cjs` v0.2 runs end to end on real
  data: reads CMC price + 1h/24h + Fear & Greed, computes R, selects a mode, and
  pulls a live TWAK swap quote. No execution. Verified working on the dev
  machine.
- **Integration verification:** DONE for everything that does not move funds.
  See `docs/verify-in-docs.md` for the per-integration honest status.
- **Self-custody wallet:** CREATED. Sealed keystore, password in OS keychain, no
  key exported by design. BSC address recorded in `docs/handoff.md`.
- **UI (`apps/web`):** IN PROGRESS. Scaffold + design-token layer started
  (Next.js + TS + Tailwind + Recharts). Components per the spec, mock data first.
- **Live execution / paid x402 / on-chain registration / identity
  registration:** NOT YET DONE — these are the fund-gated final gate.

---

## 8. Next steps (in order)

1. Finish the `apps/web` dashboard with mock data (spot model, honest 3-component
   risk score). Run build/typecheck, fix errors. Do not touch agent execution
   code during this step.
2. Turn the `keel.cjs` prototype into the structured agent: risk engine,
   guardrails + kill-switch (pure logic, no funds), execution wrapper using the
   verified TWAK commands, the continuous loop, and decision/proof logging.
3. Fund the agent wallet with a small amount; back up the `~/.twak` directory +
   keychain password first.
4. Verify the three fund-gated actions: a tiny real swap, a real x402 paid call,
   and on-chain agent registration. Record outputs into
   `proofs/integration-results.md`.
5. Register the agent identity via the BNB Agent SDK (gas-free).
6. Wire the live agent state into the dashboard, replacing mock data.

---

## 9. Repo / tooling decisions

- **npm workspaces**, not pnpm. The repo already has `package-lock.json` and
  `node_modules`; do not switch package managers. A `pnpm-workspace.yaml` may
  exist but must not be relied on.
- Dev environment confirmed in this chat: Windows, Node `v24.14.0`,
  Python `3.14.5`.
- Create/edit files in a real editor (VS Code / Cursor), not via shell here-doc
  paste, to avoid encoding/extension corruption seen earlier.