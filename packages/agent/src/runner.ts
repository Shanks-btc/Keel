// §6 — Single-cycle runner entrypoint.
//
// Runs ONE scheduler cycle and exits. The day ledger makes this idempotent:
// re-invoking on the same calendar day returns SKIPPED — no double-trade.
//
// Intended to be called by a Render Cron Job (or equivalent) on a regular
// cadence (e.g. hourly). The scheduler decides whether to trade or skip.
//
// Flags:
//   --dry-run             Full cycle (signals → engine → overlays → gates →
//                         planned action) but NO live TWAK execution. Day ledger
//                         is NOT updated. Audit entry IS written, tagged dryRun: true.
//
// Required env vars for live execution:
//   I_UNDERSTAND_REAL_FUNDS=yes   Hard gate — must be exact string "yes".
//   BNB_WALLET_PASSWORD           Keystore password. NEVER logged.
//   CMC_PRO_API_KEY               CoinMarketCap Pro API key.
//   PORTFOLIO_VALUE_USD           Total wallet value (USD). Required on first
//                                 run. Subsequent runs fall back to the persisted
//                                 high-water mark if this is not set.
//
// Optional env vars:
//   VOLATILE_VALUE_USD    Volatile asset total (ETH + CAKE + LINK), default 0.
//   STABLE_VALUE_USD      Stable total (USDT + USDC + USD1 + FDUSD). Defaults
//                         to totalValueUsd - volatileValueUsd; this is
//                         conservative (treats BNB gas as stable).
//   KEEL_DRY_RUN=1        Alternative to --dry-run flag (same effect).
//   KEEL_DATA_DIR         State/audit directory (default: ./data).
//   HUB_ENABLED=yes       Enable CMC Agent Hub MCP (non-critical path: failure
//                         falls back to REST — never blocks qualification).
//   X402_ENABLED=yes      Enable x402 paid-call layer (non-critical path:
//                         failure is logged and skipped — never blocks).

// Load .env from repo root before any process.env reads
import { config as loadDotEnv } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, resolve } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
loadDotEnv({ path: resolve(__dirname, "../../../.env") });

import type { ExecutionPlan, ExecutionResult } from "@keel/shared";
import { runScheduler } from "./loop/scheduler.js";
import { loadState, DEFAULT_DATA_DIR } from "./state/persistence.js";
import { execute } from "./execution/twak.js";

function parseNum(key: string, fallback: number): number {
  const raw = process.env[key];
  if (!raw) return fallback;
  const n = parseFloat(raw);
  return isNaN(n) ? fallback : n;
}

// Dry-run executor: calls execute(plan, "dry-run") which logs the would-be
// command with <keychain> placeholder, then returns a synthetic ok result.
// No spawn occurs; no funds move; no real txHash is produced.
function dryRunExecute(plan: ExecutionPlan): ExecutionResult {
  execute(plan, "dry-run");  // logs command to stdout; returns plan (ignored here)
  return { ok: true };       // no txHash — dry-run produces none
}

async function main(): Promise<void> {
  const isDryRun =
    process.argv.includes("--dry-run") ||
    process.env["KEEL_DRY_RUN"] === "1";

  const dataDir = process.env["KEEL_DATA_DIR"] ?? DEFAULT_DATA_DIR;

  // ── Determine portfolio values ──────────────────────────────────────────
  // Load persisted HWM to use as conservative fallback for drawdown computation
  // when PORTFOLIO_VALUE_USD is not set by the caller.
  const state = loadState(dataDir);
  const hwm = state.highWaterMarkUsd;

  const totalValueUsd    = parseNum("PORTFOLIO_VALUE_USD", hwm > 0 ? hwm : 0);
  const volatileValueUsd = parseNum("VOLATILE_VALUE_USD",  0);
  // Stable defaults to totalValueUsd − volatile; treats BNB as stable (conservative).
  const stableValueUsd   = parseNum(
    "STABLE_VALUE_USD",
    Math.max(0, totalValueUsd - volatileValueUsd),
  );

  // On first run with no prior state we cannot compute drawdown accurately.
  // Require the caller to supply PORTFOLIO_VALUE_USD.
  if (totalValueUsd === 0) {
    console.error(
      "[keel runner] PORTFOLIO_VALUE_USD is not set and no persisted HWM found.\n" +
      "              Set PORTFOLIO_VALUE_USD=<total wallet value in USD> and re-run.\n" +
      "              Example: PORTFOLIO_VALUE_USD=500 npm run run:cycle",
    );
    process.exit(1);
  }

  if (isDryRun) {
    console.log("[keel runner] DRY-RUN mode — no funds will move · day ledger not updated");
  }
  console.log(`[keel runner] cycle start · ${new Date().toISOString()}`);
  console.log(
    `[keel runner] portfolio  total=$${totalValueUsd.toFixed(2)} ` +
    `volatile=$${volatileValueUsd.toFixed(2)} ` +
    `stable=$${stableValueUsd.toFixed(2)}`,
  );
  console.log(`[keel runner] HWM=$${hwm.toFixed(2)} · data=${dataDir}`);

  // ── Run ONE scheduler cycle ─────────────────────────────────────────────
  // Live mode: deps minimal — scheduler defaults to real file I/O and
  //   execute(plan, "live") gated by I_UNDERSTAND_REAL_FUNDS=yes + BNB_WALLET_PASSWORD.
  // Dry-run mode: executeTrade is replaced with dryRunExecute; dryRun: true
  //   prevents day-ledger and state writes. Audit entry IS written (tagged dryRun: true).
  const result = await runScheduler({
    totalValueUsd,
    volatileValueUsd,
    stableValueUsd,
    deps: {
      stateDir: dataDir,
      ...(isDryRun
        ? { dryRun: true, executeTrade: dryRunExecute }
        : {}),
    },
  });

  // ── Log result (BNB_WALLET_PASSWORD never appears here) ─────────────────
  const modeTag = isDryRun ? "[dry-run] " : "";
  console.log(`[keel runner] ${modeTag}action=${result.action} · date=${result.date}`);
  if (result.txHash) {
    // BSC tx hash — never a Base/x402 hash
    console.log(`[keel runner] ${modeTag}tx=${result.txHash}`);
    console.log(`[keel runner] ${modeTag}bscscan=https://bscscan.com/tx/${result.txHash}`);
  }
  if (result.blockedReason) {
    console.log(`[keel runner] ${modeTag}blocked: ${result.blockedReason}`);
  }

  console.log(`[keel runner] ${modeTag}cycle complete`);
  process.exit(0);
}

main().catch((err: unknown) => {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(`[keel runner] fatal: ${msg}`);
  process.exit(1);
});
