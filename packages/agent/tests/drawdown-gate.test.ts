import { describe, it, expect } from "vitest";
import {
  checkProjectedDrawdown,
  type DrawdownGateInput,
} from "../src/loop/drawdown-gate.js";
import { DEFAULT_POLICY } from "../src/config.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function gate(overrides: Partial<DrawdownGateInput>) {
  const base: DrawdownGateInput = {
    fromAsset: "USDT",
    toAsset: "ETH",
    tradeValueUsd: 100,
    portfolioValueUsd: 1000,
    currentVolatilePct: 20,
    currentDrawdownPct: 0,
    policy: DEFAULT_POLICY,
  };
  return checkProjectedDrawdown({ ...base, ...overrides });
}

// ── Risk-reducing trades always pass ─────────────────────────────────────────

describe("checkProjectedDrawdown — risk-reducing (volatile → stable)", () => {
  it("passes for ETH → USDT regardless of drawdown", () => {
    const result = gate({ fromAsset: "ETH", toAsset: "USDT", currentDrawdownPct: -20 });
    expect(result.ok).toBe(true);
    expect(result.isRiskReducing).toBe(true);
  });

  it("passes for CAKE → USDC regardless of drawdown", () => {
    const result = gate({ fromAsset: "CAKE", toAsset: "USDC", currentDrawdownPct: -20 });
    expect(result.ok).toBe(true);
    expect(result.isRiskReducing).toBe(true);
  });

  it("passes even in emergency mode — de-risking is always welcome", () => {
    const result = gate({
      fromAsset: "ETH",
      toAsset: "USDT",
      currentDrawdownPct: -16, // below emergencyModeThresholdPct (-14)
    });
    expect(result.ok).toBe(true);
  });

  it("does not include projectedVolatilePct in risk-reducing result", () => {
    const result = gate({ fromAsset: "ETH", toAsset: "USDT" });
    expect(result.projectedVolatilePct).toBeUndefined();
  });
});

// ── Stable-to-stable trades pass (neutral direction) ─────────────────────────

describe("checkProjectedDrawdown — stable-to-stable (neutral)", () => {
  it("passes for USDT → USDC", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "USDC", currentDrawdownPct: -15 });
    expect(result.ok).toBe(true);
    expect(result.isRiskReducing).toBe(false);
  });

  it("passes for FDUSD → USD1 even in emergency mode", () => {
    const result = gate({ fromAsset: "FDUSD", toAsset: "USD1", currentDrawdownPct: -16 });
    expect(result.ok).toBe(true);
  });
});

// ── Risk-increasing with healthy drawdown ─────────────────────────────────────

describe("checkProjectedDrawdown — risk-increasing (stable → volatile), healthy", () => {
  it("passes when drawdown is 0 (no overlay zone)", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "ETH", currentDrawdownPct: 0 });
    expect(result.ok).toBe(true);
  });

  it("passes when drawdown is just above the overlay start (-7%)", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "ETH", currentDrawdownPct: -7 });
    expect(result.ok).toBe(true);
  });

  it("includes projectedVolatilePct for risk-increasing trades", () => {
    // currentVolatilePct=20 on $1000 portfolio, buying $100 → proj = 30%
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 20,
      tradeValueUsd: 100,
      portfolioValueUsd: 1000,
      currentDrawdownPct: 0,
    });
    expect(result.projectedVolatilePct).toBeCloseTo(30);
    expect(result.ok).toBe(true);
  });
});

// ── Overlay zone: projected exposure vs cap ───────────────────────────────────

describe("checkProjectedDrawdown — drawdown overlay zone (-8% threshold)", () => {
  it("passes when projected exposure is below the cap (45%)", () => {
    // current 10% + $100 trade on $1000 → proj 20% < 45% cap
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 10,
      tradeValueUsd: 100,
      portfolioValueUsd: 1000,
      currentDrawdownPct: -10, // in overlay zone
    });
    expect(result.ok).toBe(true);
    expect(result.projectedVolatilePct).toBeCloseTo(20);
  });

  it("blocks when projected exposure exceeds the cap (45%)", () => {
    // current 30% + $250 on $900 portfolio → proj 57.8% > 45% cap
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 30,
      tradeValueUsd: 250,
      portfolioValueUsd: 900,
      currentDrawdownPct: -10,
    });
    expect(result.ok).toBe(false);
    expect(result.guardName).toBe("projected-drawdown");
    expect(result.projectedVolatilePct).toBeGreaterThan(45);
  });

  it("blocks exactly at the cap boundary (projected === cap + epsilon)", () => {
    // current 44% + $10 on $1000 → proj 45.0% — right at cap
    // need slightly over: current 44.1% + $10 → proj 45.1% > 45
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 44.1,
      tradeValueUsd: 10,
      portfolioValueUsd: 1000,
      currentDrawdownPct: -10,
    });
    expect(result.ok).toBe(false);
  });

  it("passes when outside the overlay zone even with large trade", () => {
    // drawdown = -5 (outside overlay zone start of -8)
    // projected would be 80% but the zone gate doesn't apply
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 20,
      tradeValueUsd: 600,
      portfolioValueUsd: 1000,
      currentDrawdownPct: -5, // above overlay start
    });
    expect(result.ok).toBe(true);
  });
});

// ── Emergency mode ────────────────────────────────────────────────────────────

describe("checkProjectedDrawdown — emergency mode (≤ -14%)", () => {
  it("blocks any risk-increasing trade at -14% (exact threshold)", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "ETH", currentDrawdownPct: -14 });
    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/emergency mode/i);
  });

  it("blocks at -15% (inside emergency zone)", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "ETH", currentDrawdownPct: -15 });
    expect(result.ok).toBe(false);
  });

  it("blocks at -17% (near kill-switch)", () => {
    const result = gate({ fromAsset: "USDT", toAsset: "ETH", currentDrawdownPct: -17 });
    expect(result.ok).toBe(false);
  });

  it("does NOT block at -13.9% (just above emergency threshold)", () => {
    // -13.9 > -14, so NOT in emergency mode; but is in overlay zone (-13.9 ≤ -8)
    // projected must be < 45% cap to pass
    const result = gate({
      fromAsset: "USDT",
      toAsset: "ETH",
      currentVolatilePct: 10,
      tradeValueUsd: 50,   // projected = 15% < 45% → pass
      portfolioValueUsd: 1000,
      currentDrawdownPct: -13.9,
    });
    expect(result.ok).toBe(true);
    expect(result.reason).not.toMatch(/emergency mode/i);
  });
});

// ── guardName invariant ───────────────────────────────────────────────────────

describe("checkProjectedDrawdown — guardName invariant", () => {
  it("always returns guardName = 'projected-drawdown'", () => {
    const cases = [
      gate({ fromAsset: "ETH", toAsset: "USDT" }),   // risk-reducing
      gate({ fromAsset: "USDT", toAsset: "ETH" }),   // risk-increasing
      gate({ fromAsset: "USDT", toAsset: "USDC" }),  // stable-to-stable
    ];
    for (const r of cases) {
      expect(r.guardName).toBe("projected-drawdown");
    }
  });
});
