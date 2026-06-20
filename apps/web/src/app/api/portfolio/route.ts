// Server-side API route — portfolio balance with LIVE/STALE/UNAVAILABLE freshness.
// Priority order:
//   1. TWAK balance query (server-side, 5-min TTL cache) — real BSC on-chain data
//   2. data/portfolio-snapshot.json — written by the runner after every cycle
//   3. env vars PORTFOLIO_VALUE_USD / VOLATILE_VALUE_USD / STABLE_VALUE_USD (labeled SIMULATION)
//   4. null — "Awaiting first live portfolio snapshot" (NEVER fake numbers)
//
// Freshness rules (applied to snapshot.snapshotAt):
//   LIVE        snapshot < 2h old + successful fetch this request
//   STALE       snapshot 2-24h old, or TWAK failed but snapshot exists
//   UNAVAILABLE no snapshot and no env vars

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import { execSync } from "child_process";
import type { PortfolioSnapshot, PortfolioFreshness } from "@keel/shared";

export const dynamic = "force-dynamic";

const DATA_DIR = process.env.KEEL_DATA_DIR ?? resolve(process.cwd(), "../../data");

// 5-minute TTL cache for TWAK balance fetches (avoids hammering the CLI on every page load)
let twakCache: { snapshot: PortfolioSnapshot; cachedAt: number } | null = null;
const CACHE_TTL_MS = 5 * 60 * 1000;

function readSnapshotFile(): PortfolioSnapshot | null {
  try {
    return JSON.parse(
      readFileSync(join(DATA_DIR, "portfolio-snapshot.json"), "utf8"),
    ) as PortfolioSnapshot;
  } catch {
    return null;
  }
}

function parseEnvNum(key: string): number {
  const n = parseFloat(process.env[key] ?? "");
  return isNaN(n) ? 0 : n;
}

// Attempt a TWAK balance query. Returns null on any failure (non-fatal).
// BNB_WALLET_PASSWORD is never passed — balance reads are public BSC data.
function fetchTwakBalance(): PortfolioSnapshot | null {
  try {
    const raw = execSync(
      "npx --yes --package @trustwallet/cli twak wallet balance --chain bsc --json",
      { timeout: 15_000, encoding: "utf8" },
    );
    const parsed = JSON.parse(raw) as {
      balances?: Array<{ symbol?: string; balance?: string | number; valueUsd?: string | number }>;
      totalUsd?: string | number;
    };

    const totalUsd = typeof parsed.totalUsd === "string"
      ? parseFloat(parsed.totalUsd)
      : typeof parsed.totalUsd === "number"
      ? parsed.totalUsd
      : 0;

    if (!totalUsd || isNaN(totalUsd)) return null;

    const STABLES = new Set(["USDT", "USDC", "USD1", "FDUSD"]);
    const GAS = new Set(["BNB"]);
    let volatileUsd = 0;
    let stableUsd = 0;
    let gasUsd = 0;
    const tokenBalances: PortfolioSnapshot["tokenBalances"] = {};

    for (const b of parsed.balances ?? []) {
      if (!b.symbol) continue;
      const sym = b.symbol.toUpperCase() as keyof PortfolioSnapshot["tokenBalances"];
      const bal = parseFloat(String(b.balance ?? "0"));
      const val = parseFloat(String(b.valueUsd ?? "0"));
      if (!isNaN(bal) && !isNaN(val)) {
        tokenBalances[sym] = { balance: bal, valueUsd: val };
        if (STABLES.has(sym)) stableUsd += val;
        else if (GAS.has(sym)) gasUsd += val;
        else volatileUsd += val;
      }
    }

    return {
      snapshotAt: new Date().toISOString(),
      portfolioUsd: totalUsd,
      tokenBalances,
      allocation: {
        volatilePct: totalUsd > 0 ? (volatileUsd / totalUsd) * 100 : 0,
        stablePct: totalUsd > 0 ? (stableUsd / totalUsd) * 100 : 0,
        gasPct: totalUsd > 0 ? (gasUsd / totalUsd) * 100 : 0,
      },
      hwm: 0,  // not available from TWAK balance
      currentDrawdownPct: 0,
      lastBscTxHash: null,
      lastCycleResult: null,
      source: "twak",
    };
  } catch {
    return null;
  }
}

function computeFreshness(snapshotAt: string): PortfolioFreshness {
  const ageMs = Date.now() - new Date(snapshotAt).getTime();
  if (ageMs < 2 * 60 * 60 * 1000) return "LIVE";
  if (ageMs < 24 * 60 * 60 * 1000) return "STALE";
  return "UNAVAILABLE";
}

export async function GET() {
  // 1. Try TWAK balance (with 5-min cache)
  const now = Date.now();
  if (twakCache && now - twakCache.cachedAt < CACHE_TTL_MS) {
    const freshness = computeFreshness(twakCache.snapshot.snapshotAt);
    return NextResponse.json({ ok: true, snapshot: twakCache.snapshot, freshness, source: "twak-cache" });
  }

  const twakSnapshot = fetchTwakBalance();
  if (twakSnapshot) {
    twakCache = { snapshot: twakSnapshot, cachedAt: now };
    return NextResponse.json({ ok: true, snapshot: twakSnapshot, freshness: "LIVE" as PortfolioFreshness, source: "twak" });
  }

  // 2. Fall back to portfolio-snapshot.json (written by runner)
  const fileSnapshot = readSnapshotFile();
  if (fileSnapshot) {
    const freshness = computeFreshness(fileSnapshot.snapshotAt);
    if (freshness !== "UNAVAILABLE") {
      return NextResponse.json({ ok: true, snapshot: fileSnapshot, freshness, source: "snapshot" });
    }
  }

  // 3. Fall back to env vars (labeled SIMULATION — never show as real data)
  const envTotal    = parseEnvNum("PORTFOLIO_VALUE_USD");
  const envVolatile = parseEnvNum("VOLATILE_VALUE_USD");
  const envStable   = parseEnvNum("STABLE_VALUE_USD") || Math.max(0, envTotal - envVolatile);

  if (envTotal > 0) {
    const envSnapshot: PortfolioSnapshot = {
      snapshotAt: new Date().toISOString(),
      portfolioUsd: envTotal,
      tokenBalances: {},
      allocation: {
        volatilePct: envTotal > 0 ? (envVolatile / envTotal) * 100 : 0,
        stablePct:   envTotal > 0 ? (envStable   / envTotal) * 100 : 0,
        gasPct: 0,
      },
      hwm: 0,
      currentDrawdownPct: 0,
      lastBscTxHash: null,
      lastCycleResult: null,
      source: "env",
    };
    return NextResponse.json({ ok: true, snapshot: envSnapshot, freshness: "STALE" as PortfolioFreshness, source: "env" });
  }

  // 4. Nothing available
  return NextResponse.json({ ok: true, snapshot: null, freshness: "UNAVAILABLE" as PortfolioFreshness, source: "none" });
}
