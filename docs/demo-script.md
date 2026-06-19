# Keel — Demo Script

A clear, end-to-end walkthrough of Keel as a product. The goal: in the first ten
seconds a viewer understands what Keel is, that it is actively trading, and that
every action is real and provable. Product language only.

---

## 0. One-line framing

> "Keel is an autonomous spot trading agent that rotates a self-custody wallet
> between volatile tokens and stables to survive drawdowns while still capturing
> upside — and every move is provable on-chain."

---

## 1. The ten-second read (open on the dashboard)

Point to the summary row and let it speak:

- **Portfolio Value** — the wallet's total USD value, with 24h change.
- **24h PnL** — realized + unrealized.
- **Current Exposure** — how much is in volatile vs stable right now.
- **Latest Swap** — the most recent autonomous action (e.g. `USDT → ETH`).
- **Current Drawdown** — and that it is within the limit.

Top bar shows: **status Running**, **current mode** (e.g. Risk-on), the
**wallet** short address, and a **live** last-updated time.

---

## 2. "It's actively trading" (allocation + holdings)

- **Portfolio Allocation** donut — the live split across ETH, CAKE, LINK and the
  stables, plus a small BNB gas slice.
- **Spot Holdings** table — each asset, its role (Volatile / Stable / Gas),
  balance, USD value, allocation %, and 24h change.

Message: this is a real spot portfolio the agent is managing, not a static demo.

---

## 3. "Here's why it acted" (signals + risk)

- **Market Signals** — Fear & Greed, 1h and 24h basket change, trend.
- **Risk Score Breakdown** — the **three** real components (1h change, 24h
  change, Fear & Greed) and the resulting score with its risk label.

Message: the mode is a transparent function of live signals, not a black box.

---

## 4. "Risk is always protected" (the edge)

- **Drawdown Guardrail** chart — current drawdown against the max-drawdown limit
  and the kill-switch threshold, over time.

Message: Keel's differentiator is not a flashy return — it's that it is built not
to blow up. Show how the kill-switch sits below the limit.

---

## 5. "Every action is real" (the proof)

- **Latest Autonomous Swap** — the route (`USDT → ETH`), amount in/out, USD
  value, the reason, the time, and the **tx hash**.
- **Proof Trail** — decision log, swap execution, x402 confirmation, agent
  identity (verified), network (BNB Chain Mainnet) — each linking to on-chain
  proof.
- **x402 Confirmation** — the count of confirmed paid calls.

Message: this is the part that matters — the on-chain piece is **real, not
cosmetic**. Click a tx hash and show it resolve on a BSC explorer.

---

## 6. "It's self-custody and autonomous"

- Emphasize: the agent signs its own swaps locally; **keys never leave the
  machine**; there is no custodial step.
- Show **Agent Controls** (Pause / Resume / Refresh) and **System Health**
  (market data, execution engine, TWAK service, x402 service, network, wallet).

Message: a self-custody holder could leave this running unattended.

---

## 7. Bottom — the running record

- **Swap / Decision Log** — Time, Mode, Action (Buy / Sell / Rebalance / Hold),
  Route, Size, Value, Reason, Tx Hash. Scroll it to show a history of autonomous,
  reasoned, provable actions.

---

## 8. Close

> "Keel trades from a self-custody wallet while keeping exposure, slippage, and
> drawdown inside strict limits — autonomous, transparent, and provable."

---

## Demo do / don't

- **Do** show a real tx hash resolving on-chain.
- **Do** keep the language spot-only (swap / buy / sell / rebalance).
- **Don't** say perps, leverage, long, short, liquidation, or order book.
- **Don't** show any asset outside the allowlist.
- **Don't** present mock numbers as live without saying so during development.