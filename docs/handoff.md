# Keel — Handoff

For whoever (or whatever) picks up the build next. This is the practical state of
the repo: what exists, what works, the exact commands and values that are known
good, what to build next, and the rules that prevent regressions.

Read `docs/plan.md` and `docs/verify-in-docs.md` alongside this.

---

## 1. What Keel is (one paragraph)

Keel is a drawdown-aware **autonomous spot trading agent on BNB Chain**. It reads
CMC market signals, scores risk, and rotates a self-custody portfolio between
volatile tokens and stables across three modes (risk-on / neutral / risk-off),
executing spot swaps through TWAK with strict guardrails and a max-drawdown
kill-switch. **Spot only — no perps, leverage, long/short, or liquidation.**

---

## 2. Environment (confirmed)

- OS: Windows
- Node: `v24.14.0`
- Python: `3.14.5`
- Package manager: **npm workspaces** (do NOT switch to pnpm; `package-lock.json`
  and `node_modules` already exist). `pnpm-workspace.yaml` may exist but is not to
  be relied on.
- TWAK CLI is invoked as: `npx --yes --package @trustwallet/cli twak <args>`
  (the bare `twak` is not on PATH; the npx form is the known-good invocation).

---

## 3. Files already in the repo

- `keel.cjs` — **dry-run decision loop v0.2**. Plain Node, no deps. Reads CMC
  (price + 1h/24h + Fear & Greed), computes risk score `R`, selects a mode, and
  pulls a live TWAK swap quote. **No execution.** This runs and is the working
  brain prototype.
- `quote-test.cjs` — minimal TWAK BSC swap-quote probe.
- `verify.ts` — integration verifier (CMC, MCP, TWAK, BSC proof, x402, real swap
  checks). Note: parts of this were drafted before the final command forms were
  confirmed; treat as a scaffold and reconcile against `docs/verify-in-docs.md`.
- `verify.py` — `bnbagent` SDK check/register script (scaffold).
- `verify-output.txt` — treat as partial/garbled unless a clean re-run replaces
  it.
- `scripts/verify-integrations/` — exists but empty.
- `apps/web/` — the dashboard (**Phase 1 COMPLETE** 2026-06-16): Next.js 15 +
  TypeScript + Tailwind v4 + Recharts. All 18 components built with mock data.
  `next build` and `tsc --noEmit` both pass clean. Run `npm run dev` from
  `apps/web/` to open locally.
- `packages/shared/` — shared TypeScript types (`AgentState`, `MarketSnapshot`,
  `PolicyConfig`, `GuardrailResult`, `KillSwitchResult`, `TradeProposal`, and all
  dashboard sub-types). Used by both `apps/web` and `packages/agent`.
- `packages/agent/` — **Phase 4 COMPLETE** 2026-06-17. Gated live execution
  path written and stub-tested; zero funds moved.
  - `src/config.ts` — `DEFAULT_POLICY` with all tunable thresholds from
    `docs/risk-policy.md` (weights, mode thresholds, caps, kill-switch level).
  - `src/perception/cmc.ts` — `fetchMarketSnapshot()`: reads price, 1h, 24h,
    and Fear & Greed from the confirmed CMC endpoints; throws `CmcError` if key
    is missing or CMC returns an error.
  - `src/risk/engine.ts` — `computeRiskScore()`, `pickMode()`, `shouldRebalance()`:
    EXACT verified formula from `keel.cjs` / `docs/risk-policy.md`. Pure, no I/O.
  - `src/guardrails/allowlist.ts` — token allowlist check; rejects BNB, BTC, BTCB,
    and anything off-list.
  - `src/guardrails/caps.ts` — `checkPerTradeCap()`, `checkDailyLossCap()`.
  - `src/guardrails/slippage.ts` — `checkSlippage()` against TWAK quote fields.
    `TwakQuote` interface lives in `packages/shared`; slippage.ts imports it.
  - `src/guardrails/killSwitch.ts` — `checkKillSwitch()`, `computeDrawdown()`.
    Action is always `"flatten-to-stables"`, never `"drain-to-dust"`.
  - `src/execution/twak.ts` — Full execution surface (gated live + dry-run):
    - `parseTwakJson(raw)` — strips TWAK banner/preamble, returns `TwakQuote`.
    - `getQuote(params, runner?)` — READ-ONLY quote call (`--quote-only --json`).
      `runner` is injectable; tests use a stub with zero network calls. Default
      runner uses `execSync` (safe: quote-only, no funds).
    - `buildExecutePlan(params, quote, proposal)` — PURE function; builds the
      execute command args with `--password <keychain>` placeholder. No spawn.
    - `execute(plan, "dry-run")` — logs the would-be command (password shown as
      `<keychain>`); returns the plan unchanged. No spawn, no funds.
    - `execute(plan, "live", runner?)` — **GATED live path** (Phase 4):
      1. Checks `process.env.I_UNDERSTAND_REAL_FUNDS === "yes"` — throws a
         clear refusal if not set. This is the software backstop.
      2. Reads `process.env.BNB_WALLET_PASSWORD` — throws if not set.
      3. Writes an audit log line with `<redacted>` in place of the password.
      4. Replaces `<keychain>` with the real password ONLY in the spawned args
         (`realArgs`) — `realArgs` is never logged anywhere.
      5. Spawns via injectable `runner` (default: `execSync`); in tests, a stub
         runner is always injected so no real spawn ever occurs.
      6. Parses output (banner-tolerant), returns `ExecutionResult { ok,
         txHash?, explorerUrl?, error? }`.
      **Password redaction guarantee**: the real password NEVER appears in any
      log, audit line, error message, or returned object. The test suite asserts
      this explicitly.
  - `src/loop/gate.ts` — `evaluateTrade(input)` runs all 5 guardrails in order:
    kill-switch → allowlist → per-trade cap → daily-loss cap → slippage (skipped
    if no quote). Returns on first failure; result includes `firstFailure`.
  - `src/loop/cycle.ts` — `runCycle(input)` — ONE pure cycle; all I/O injected:
    check kill-switch (hard override) → compute risk → decide rebalance →
    clamp trade to per-trade cap → fetch quote (injected runner) → gate →
    `buildExecutePlan`. Primary spot pair: ETH/USDT. Returns `CycleResult`.
  - `tests/risk.test.ts` — 19 tests (all pass).
  - `tests/guardrails.test.ts` — 41 tests (all pass).
  - `tests/execution.test.ts` — 20 tests. Phase 3: `parseTwakJson`, `getQuote`,
    `buildExecutePlan`, dry-run. Phase 4: gate-off throws, gate-on + stub runner
    returns `ExecutionResult`, `<keychain>` replaced in spawn args, audit log
    never contains real password, runner error → `ok:false`, TWAK error JSON →
    `ok:false`.
  - `tests/loop.test.ts` — 14 tests. Covers within-band hold, risk-on buy,
    risk-off sell (target 18%, never 0%), kill-switch override, slippage block,
    never-dust invariant, off-list asset rejection, and gate direct tests.
  - **All 94 tests pass; `tsc --noEmit` is clean.**
- `docs/` — these seven documents.
- `.env.example` — all required env vars documented with descriptions.
- `proofs/integration-results.md` — the place to paste raw command outputs and tx
  hashes as live actions are run (does not exist yet; create when running live
  actions).

---

## 4. Known-good commands and values

### Agent wallet (self-custody, BSC)
```
0x66af72374Eb358cf939bc1954b8F62EfcF08E10a
```
Created 2026-06-15. Password in OS keychain; encrypted keystore in `~/.twak`.
**No seed/private key is exported by design.** Backup = the `~/.twak` directory +
the keychain password. Back this up before funding.

### CMC (perception)
- `GET https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH`
- `GET https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest`
- Header: `X-CMC_PRO_API_KEY`. Free Basic tier is sufficient.
- Node 18+ has global `fetch`; no HTTP library needed.

### TWAK (execution) — confirmed forms
- Quote: `twak swap <amt> <from> <to> --chain bsc --slippage <pct> --quote-only --json`
  → `{ input, output, minReceived, provider, priceImpact }`
- Execute (NOT yet run): same command with `--password <pw>` instead of
  `--quote-only`.
- Wallet address: `twak wallet address --chain bsc --json`
- Wallet status: `twak wallet status --json`
- Wallet balance: `twak wallet balance --chain bsc --json`
  (**returned a transient `NETWORK_ERROR` in testing — re-verify**)
- Chains: `twak chains --json` (BSC = `key: bsc`)
- On-chain registration: `twak compete register` / `twak compete status`
  (command surface confirmed available; registration not yet executed)
- x402: `twak x402 info` / `twak x402 quote <url>` (free) /
  `twak x402 request <url> --prefer-network base --max-payment 10000 --yes --json`
  (paid; not yet executed)
- Identity (TWAK-native, backup option): `twak erc8004 register` etc.

### BNB Agent SDK (identity)
- `pip install bnbagent` (installs `bnbagent 0.3.6`, confirmed on Python 3.14.5).
- Network check (confirmed):
  ```python
  from bnbagent import config
  n = config.resolve_network('bsc-mainnet')
  # registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 | gas-free: True
  ```
- `register_agent` (identity registration) — gas-free, **not yet run**.

---

## 5. Known quirks / gotchas

- `twak wallet create` prints a harmless libuv assertion on exit on Windows
  (`UV_HANDLE_CLOSING ... src\win\async.c`) **after** the work completes. Ignore
  it; it does not affect `price`/`swap`/`balance`.
- The CLI's `export VAR=...` hint is Linux syntax; on Windows PowerShell use
  `$env:VAR="..."`.
- PowerShell 5.1 does not support `&&`; run commands on separate lines.
- Create files in VS Code / Cursor, not via shell here-doc paste — earlier paste
  attempts corrupted files (hidden `.txt`, mangled content).
- When parsing TWAK output, tolerate a banner/preamble around the JSON (slice
  from first `{` to last `}`).

---

## 6. What to build next (ordered)

1. ~~**Finish `apps/web`** with mock data~~ — **DONE 2026-06-16**. All 18
   components built; `tsc --noEmit` and `next build` both pass clean.
2. ~~**Structure the agent core** (perception + risk + guardrails)~~ — **DONE
   2026-06-16**. `packages/agent` created; 60/60 unit tests pass; `tsc --noEmit`
   clean. No funds moved; no live execution built yet.
3. ~~**Build the execution wrapper** (`src/execution/twak.ts`) and **loop**
   (`src/loop/gate.ts`, `src/loop/cycle.ts`)~~ — **DONE 2026-06-16**. All
   dry-run; `execute("live")` threw unconditionally. 87/87 tests pass.
4. ~~**Gated live execution path**~~ — **DONE 2026-06-17**. `execute("live")`
   now reads `I_UNDERSTAND_REAL_FUNDS` and `BNB_WALLET_PASSWORD` from env,
   spawns via injectable runner, redacts password in all audit output, returns
   `ExecutionResult`. 94/94 tests pass; `tsc --noEmit` clean. Zero funds moved.
5. **Wire liveness + logging**: run `runCycle` on a timer (≥1 action/day),
   write decision + proof entries to `logs/`, connect `CycleResult` into the
   dashboard's `AgentState` shape.
6. **Fund the wallet** (small) — back up `~/.twak` + keychain password first.
   Then run the **first real swap** (manual steps below).
7. **Run the fund-gated verifications**: tiny real swap, real x402 paid call,
   on-chain registration; record raw output + tx hashes in
   `proofs/integration-results.md`.
8. **Register identity** via `bnbagent` (gas-free).
9. **Connect live state** into the dashboard, replacing mock data.

### Manual steps for the first real swap (do NOT run until funded)

These steps are for a human to run — not automated yet. Prerequisites: wallet
funded, `~/.twak` backed up, environment set in the shell.

```powershell
# 1. Set required env vars (PowerShell — do not commit these)
$env:CMC_API_KEY        = "<your CMC key>"
$env:BNB_WALLET_PASSWORD = "<keychain password>"
$env:I_UNDERSTAND_REAL_FUNDS = "yes"

# 2. Confirm the wallet has a BNB gas balance and a small USDT position
npx --yes --package @trustwallet/cli twak wallet balance --chain bsc --json

# 3. Get a live quote first (read-only, no funds):
#    5 USDT → ETH, 1% slippage tolerance
npx --yes --package @trustwallet/cli twak swap 5 USDT ETH --chain bsc --slippage 1 --quote-only --json

# 4. If the quote looks good (priceImpact ≤ 1%, provider returned):
#    Execute the real swap (self-custody signing by TWAK)
npx --yes --package @trustwallet/cli twak swap 5 USDT ETH --chain bsc --slippage 1 --password %BNB_WALLET_PASSWORD% --json

# 5. Record the tx hash from the output and verify on BSCScan:
#    https://bscscan.com/tx/<txHash>
#    Paste the raw output into proofs/integration-results.md.
```

**What the code does at this point**: calling `execute(plan, "live")` from
`packages/agent` will check the gate, read the password, build `realArgs`, and
spawn the command above. The `ExecutionResult` will contain `txHash` and
`explorerUrl` if the swap succeeds, or `ok:false` + `error` if TWAK returns an
error or the runner throws.

---

## 7. Hard rules (do not regress)

- TWAK is the only thing that executes. No other layer signs or sends.
- Zero custodial steps anywhere; keys stay sealed in `~/.twak`.
- All five guardrails are real (allowlist, per-trade cap, daily-loss cap,
  slippage, max-drawdown kill-switch).
- Never drain to dust; risk-off → stables, not zero.
- Spot-only vocabulary everywhere (see `docs/plan.md` §2).
- Trade/hold only allowlist assets (ETH, CAKE, LINK, USDT, USDC, USD1, FDUSD;
  BNB = gas only).
- `execute("live")` is gated by `I_UNDERSTAND_REAL_FUNDS=yes`; the gate must
  not be set in tests, CI, or automated runs unless a real swap is intended.
- `BNB_WALLET_PASSWORD` must never appear in any log, audit line, error
  message, returned object, or committed file. Audit output always shows
  `<redacted>`. The test suite asserts this invariant.
- Do not mark anything verified that was not actually run successfully.