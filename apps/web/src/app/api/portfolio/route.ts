// Server-side API route — portfolio balance with LIVE/STALE/UNAVAILABLE freshness.
// Priority order:
//   1. TWAK balance query (server-side, 5-min TTL cache) — real BSC on-chain data
//      + CMC price fetch for volatile tokens (concurrent, gracefully degraded)
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

// Asset classification sets (module-level — shared across functions)
const STABLES = new Set(["USDT", "USDC", "USD1", "FDUSD"]);
const GAS     = new Set(["BNB"]);
// Volatile allowlist assets that need CMC prices (BNB handled by TWAK's own totalUsd)
const VOLATILE_SYMS = ["ETH", "CAKE", "LINK"] as const;

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

// Fetch USD prices for volatile allowlist tokens from CMC REST API.
// Returns an empty Map on any failure — caller treats missing entries as $0.
// Tries CMC_PRO_API_KEY first (web convention), then CMC_API_KEY (agent convention).
async function fetchVolatilePrices(): Promise<Map<string, number>> {
  const key = process.env.CMC_PRO_API_KEY ?? process.env.CMC_API_KEY;
  if (!key) return new Map();

  try {
    const syms = VOLATILE_SYMS.join(",");
    const res = await fetch(
      `https://pro-api.coinmarketcap.com/v2/cryptocurrency/quotes/latest?symbol=${syms}`,
      {
        headers: { "X-CMC_PRO_API_KEY": key, Accept: "application/json" },
        signal: AbortSignal.timeout(8_000),
      },
    );
    const data = await res.json() as {
      data?: Record<string, Array<{ quote?: { USD?: { price?: number } } }>>;
    };

    const out = new Map<string, number>();
    for (const sym of VOLATILE_SYMS) {
      const arr = data?.data?.[sym];
      if (!Array.isArray(arr) || arr.length === 0) continue;
      const price = arr[0]?.quote?.USD?.price;
      if (typeof price === "number" && price > 0) out.set(sym, price);
    }
    return out;
  } catch {
    return new Map();
  }
}

// Real TWAK balance JSON shape (confirmed from live --json output):
//   { chain, address, symbol: "BNB", available, total, totalUsd, tokens: [{symbol, contract, balance}] }
// Notes:
//   - totalUsd is the NATIVE BNB value only, NOT the full portfolio.
//   - tokens[] has NO per-token USD values — TWAK does not return them.
//   - Stablecoins (USDT/USDC/USD1/FDUSD) are approximated 1:1 USD.
//   - Volatile tokens (ETH, CAKE, LINK) start at valueUsd=0; enriched by applyVolatilePrices().
//   - portfolioUsd before enrichment = BNB USD + stable USD only.
//
// BNB_WALLET_PASSWORD is never passed — balance reads are public BSC data.
// On Windows, the CLI exits with code 9 (UV_HANDLE_CLOSING assertion) after writing valid JSON.
// We handle this by extracting stdout from the thrown error object.
function fetchTwakBalance(): PortfolioSnapshot | null {
  try {
    let raw = "";
    try {
      raw = execSync(
        "npx --yes --package @trustwallet/cli twak wallet balance --chain bsc --json",
        { timeout: 15_000, encoding: "utf8" },
      );
    } catch (e) {
      // Windows: process exits with code 9 after JSON is written — stdout still has the data.
      const err = e as { stdout?: string | Buffer };
      raw = typeof err.stdout === "string"
        ? err.stdout
        : Buffer.isBuffer(err.stdout)
        ? err.stdout.toString("utf8")
        : "";
    }

    // Banner-tolerant JSON extraction (CLI may print a preamble before the JSON object)
    const jsonStart = raw.indexOf("{");
    const jsonEnd   = raw.lastIndexOf("}");
    if (jsonStart === -1 || jsonEnd === -1) return null;

    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd + 1)) as {
      symbol?:   string;           // native token: "BNB"
      total?:    string;           // native balance
      totalUsd?: number;           // native token USD ONLY
      tokens?:   Array<{
        symbol?:   string;
        contract?: string;
        balance?:  string;         // ERC-20 balance — no USD value returned by TWAK
      }>;
    };

    // Native BNB: use totalUsd as returned by TWAK
    const nativeSym = (parsed.symbol ?? "BNB").toUpperCase();
    const nativeBal = parseFloat(parsed.total ?? "0");
    const nativeUsd = typeof parsed.totalUsd === "number" ? parsed.totalUsd : 0;
    if (isNaN(nativeBal) || nativeUsd <= 0) return null;

    const tokenBalances: PortfolioSnapshot["tokenBalances"] = {};
    let stableUsd = 0;

    tokenBalances[nativeSym as keyof PortfolioSnapshot["tokenBalances"]] =
      { balance: nativeBal, valueUsd: nativeUsd };

    // ERC-20 tokens: stables ≈ 1:1 USD; volatile tokens stored with valueUsd=0 until enriched
    for (const t of parsed.tokens ?? []) {
      if (!t.symbol || !t.balance) continue;
      const sym = t.symbol.toUpperCase();
      const bal = parseFloat(t.balance);
      if (isNaN(bal)) continue;
      const usdValue = STABLES.has(sym) ? bal : 0;
      tokenBalances[sym as keyof PortfolioSnapshot["tokenBalances"]] =
        { balance: bal, valueUsd: usdValue };
      if (STABLES.has(sym)) stableUsd += usdValue;
    }

    // Pre-enrichment totals (volatile USD = 0 until applyVolatilePrices() is called)
    const portfolioUsd = nativeUsd + stableUsd;

    return {
      snapshotAt: new Date().toISOString(),
      portfolioUsd,
      tokenBalances,
      allocation: {
        volatilePct: 0,
        stablePct:   portfolioUsd > 0 ? (stableUsd  / portfolioUsd) * 100 : 0,
        gasPct:      portfolioUsd > 0 ? (nativeUsd  / portfolioUsd) * 100 : 0,
      },
      hwm: 0,
      currentDrawdownPct: 0,
      lastBscTxHash: null,
      lastCycleResult: null,
      source: "twak",
    };
  } catch {
    return null;
  }
}

// Apply CMC prices to volatile token holdings and recalculate portfolioUsd + allocation.
// Returns a new snapshot object — does not mutate the input.
function applyVolatilePrices(
  snap: PortfolioSnapshot,
  prices: Map<string, number>,
): PortfolioSnapshot {
  if (prices.size === 0) return snap;

  let volatileUsd = 0;
  let stableUsd   = 0;
  let gasUsd      = 0;

  const enrichedBalances = { ...snap.tokenBalances };

  for (const sym of Object.keys(enrichedBalances)) {
    const entry = enrichedBalances[sym as keyof PortfolioSnapshot["tokenBalances"]];
    if (!entry) continue;

    if (GAS.has(sym)) {
      gasUsd += entry.valueUsd;
    } else if (STABLES.has(sym)) {
      stableUsd += entry.valueUsd;
    } else {
      const price = prices.get(sym);
      const usdValue = price !== undefined ? entry.balance * price : entry.valueUsd;
      enrichedBalances[sym as keyof PortfolioSnapshot["tokenBalances"]] =
        { ...entry, valueUsd: usdValue };
      volatileUsd += usdValue;
    }
  }

  const portfolioUsd = gasUsd + stableUsd + volatileUsd;
  return {
    ...snap,
    portfolioUsd,
    tokenBalances: enrichedBalances,
    allocation: {
      volatilePct: portfolioUsd > 0 ? (volatileUsd / portfolioUsd) * 100 : 0,
      stablePct:   portfolioUsd > 0 ? (stableUsd   / portfolioUsd) * 100 : 0,
      gasPct:      portfolioUsd > 0 ? (gasUsd       / portfolioUsd) * 100 : 0,
    },
  };
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

  // Start CMC price fetch BEFORE the blocking execSync in fetchTwakBalance().
  // The HTTP request goes in-flight at the OS level even while execSync holds the JS thread,
  // so by the time execSync returns the CMC response is likely already received.
  const pricePromise = fetchVolatilePrices();
  const twakSnapshot = fetchTwakBalance();
  const volatilePrices = await pricePromise;

  if (twakSnapshot) {
    const enriched = applyVolatilePrices(twakSnapshot, volatilePrices);
    twakCache = { snapshot: enriched, cachedAt: now };
    return NextResponse.json({ ok: true, snapshot: enriched, freshness: "LIVE" as PortfolioFreshness, source: "twak" });
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
