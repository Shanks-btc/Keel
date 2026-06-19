# Keel — Render Deployment Guide

> **Honesty notice:** The daily qualification scheduler attempts one
> minimum-risk qualifying trade per calendar day. It is **not guaranteed** to
> execute unless the portfolio, gates, and network are all healthy. The
> stable-to-stable fallback swap is **not guaranteed to count** unless
> competition organizers confirm that stable-to-stable swaps satisfy the
> qualification criteria. Never describe this system as "DQ-proof" or
> "daily trade guaranteed."

---

## 1. Architecture overview

| Service | Kind | Notes |
|---|---|---|
| **Agent runner** | Render Cron Job | Runs `npm run run:cycle` on a schedule |
| **Dashboard** | Render Web Service (paid) | `npm run build` + `npm start` from `apps/web` |

Do **not** use a **Render Free Web Service** for the agent runner — free services
sleep after 15 minutes of inactivity and cannot be used as cron targets.
The runner exits after one cycle; a **Cron Job** is the correct primitive.

---

## 2. Runner service — Render Cron Job

### Build command
```
npm install
```

### Start command (the cron payload)
```
npm run run:cycle
```

This invokes `packages/agent/src/runner.ts` via `tsx`. The runner:

1. Loads persisted state (`data/agent-state.json`)
2. Fetches market signals from CMC (Hub MCP if `HUB_ENABLED=yes`)
3. Runs the risk engine + overlay pipeline
4. Attempts the daily qualifying trade via the full gate chain
5. Persists the result to `data/agent-state.json` + `data/audit.jsonl`
6. Exits with code 0 (success) or 1 (fatal error)

### Recommended cron cadence

**Run hourly** (e.g. `0 * * * *`). The day ledger enforces daily
idempotency — re-invocations on the same calendar day return `SKIPPED`
after the first `EXECUTED` or `BLOCKED` outcome. The only exception is
the kill-switch path, which can re-run on the same day to flatten holdings
if the portfolio falls past −18 % from HWM.

Hourly cadence means the agent catches market-open windows, CMC data
freshness cycles, and kill-switch conditions promptly without ever
double-trading.

---

## 3. Environment variables

Set these as **encrypted secrets** in the Render dashboard (Environment →
Secret Files or Environment Variables with the lock icon).

### Required for live execution

| Variable | Example | Notes |
|---|---|---|
| `I_UNDERSTAND_REAL_FUNDS` | `yes` | Hard gate. Must be exact string `yes`. |
| `BNB_WALLET_PASSWORD` | `••••••` | Wallet keystore password. **Never logged.** Audit output always shows `<redacted>`. |
| `CMC_PRO_API_KEY` | `abc123…` | CoinMarketCap Pro API key for market signals. |
| `PORTFOLIO_VALUE_USD` | `500` | Current total wallet value in USD. Required on first run; subsequent runs fall back to the persisted HWM. |

### Recommended

| Variable | Example | Notes |
|---|---|---|
| `VOLATILE_VALUE_USD` | `280` | Current ETH + CAKE + LINK total in USD. Used for drawdown gate. |
| `STABLE_VALUE_USD` | `215` | Current USDT + USDC + USD1 + FDUSD total in USD. Used for fallback-swap eligibility. If omitted, defaults to `PORTFOLIO_VALUE_USD − VOLATILE_VALUE_USD` (treats BNB as stable — conservative). |
| `KEEL_DATA_DIR` | `/data` | Override state/audit directory. Defaults to `./data`. Set this to the Render Disk mount path (see §4). |

### Beta integrations (non-critical path)

| Variable | Value | Notes |
|---|---|---|
| `HUB_ENABLED` | `yes` | Enable CMC Agent Hub MCP. If the Hub is unavailable, the runner **falls back to the REST CMC endpoint automatically** — the qualifying trade is never blocked by Hub failure. |
| `X402_ENABLED` | `yes` | Enable x402 paid-call integration (USDC on Base). If x402 fails, it is logged and skipped — the qualifying trade proceeds normally. |

**§6 rule:** Hub and x402 are beta integrations. Neither sits on the
critical path of the daily qualifying trade. A Hub outage or x402 failure
**must never prevent** an otherwise valid qualifying trade from executing.

---

## 4. Keystore (wallet) setup

TWAK (Trust Wallet CLI) reads the BNB wallet from a keystore file whose
location is determined by Trust Wallet's default paths. On Render, the
container filesystem is ephemeral unless you use a **Render Disk**.

### Recommended approach: Render Disk

1. Create a **Render Disk** (e.g. 1 GB, mounted at `/data`).
2. Set `KEEL_DATA_DIR=/data` so state and audit files persist across restarts.
3. On first deploy, copy the Trust Wallet keystore into the disk:
   ```
   # One-time SSH or shell command in the Render console
   mkdir -p /data/keystore
   cp ~/.trustwallet/keystore/UTC--… /data/keystore/
   ```
4. Configure TWAK to read the keystore from `/data/keystore/` by setting the
   relevant TWAK env var (see Trust Wallet CLI docs for `--keystore-dir`).

### Alternative: keystore as env var

Encode the keystore JSON as base64 and store it in `WALLET_KEYSTORE_B64`.
Add a pre-start script that decodes it to a temp file:
```bash
#!/bin/sh
echo "$WALLET_KEYSTORE_B64" | base64 -d > /tmp/wallet-keystore.json
TWAK_KEYSTORE=/tmp/wallet-keystore.json npm run run:cycle
```

`BNB_WALLET_PASSWORD` (the decryption password for the keystore) is a
separate env var and is **never written to disk or logs**.

---

## 5. Dashboard deployment (apps/web)

Deploy the Next.js dashboard as a **separate Render Web Service** (paid
tier recommended for consistent uptime).

| Setting | Value |
|---|---|
| Build command | `npm install && npm run build` |
| Start command | `npm start --workspace=apps/web` |
| Root directory | `.` (repo root) |
| `KEEL_DATA_DIR` | Same path as the agent's Render Disk mount (shared storage) |

The dashboard reads `data/agent-state.json` and `data/audit.jsonl` via the
`/api/agent-state` route. Both the runner and the dashboard must point to
the same `KEEL_DATA_DIR` so the dashboard shows live state.

The dashboard also exposes `/api/cycle-preview` which computes a risk-engine
preview using a mock market snapshot (not live CMC). All preview results are
labelled **SIMULATION** in the UI.

---

## 6. First-run checklist

- [ ] Wallet funded with ETH (for gas) and at least one eligible asset
      (ETH, CAKE, LINK, USDT, USDC, USD1, or FDUSD)
- [ ] `I_UNDERSTAND_REAL_FUNDS=yes` set as an encrypted secret
- [ ] `BNB_WALLET_PASSWORD` set as an encrypted secret (lock icon in Render)
- [ ] `CMC_PRO_API_KEY` set
- [ ] `PORTFOLIO_VALUE_USD` set to the current wallet total in USD
- [ ] Keystore file accessible to TWAK at the configured path
- [ ] `KEEL_DATA_DIR` set (if using Render Disk)
- [ ] Cron schedule set (recommended: `0 * * * *` — hourly)
- [ ] Run once manually (Render → Manual Deploy) and check logs for
      `action=EXECUTED` or `action=FALLBACK_EXECUTED`

---

## 7. What the runner does NOT guarantee

- **Not guaranteed to trade every day.** The scheduler executes only if all
  gates pass (kill-switch, allowlist, per-trade cap, daily-loss cap,
  slippage, projected-drawdown).
- **Not guaranteed to count as a qualifying trade.** The stable-to-stable
  fallback (USDT → USDC) is used when a risk-on rotation is unavailable.
  Whether stable-to-stable swaps satisfy competition criteria depends on
  the organizers confirming this.
- **Not DQ-proof.** Emergency mode (drawdown ≤ −14 %) blocks new volatile
  exposure. Kill-switch (drawdown ≤ −18 %) flattens to stables. Either
  condition may prevent a conventional qualifying trade.
- **x402 and Hub are non-critical.** Their failure has no effect on the
  daily qualifying attempt.

---

## 8. Eligible tokens

SPOT only. Forbidden: perps, futures, leverage, margin, order book.

| Asset | Role | Notes |
|---|---|---|
| ETH | Volatile | |
| CAKE | Volatile | |
| LINK | Volatile | |
| USDT | Stable | Fallback swap source |
| USDC | Stable | Fallback swap target |
| USD1 | Stable | |
| FDUSD | Stable | |
| BNB | Gas only | Never traded; not counted in volatile/stable totals |

Registered agent wallet: `0x66af72374Eb358cf939bc1954b8F62EfcF08E10a` (BSC)
