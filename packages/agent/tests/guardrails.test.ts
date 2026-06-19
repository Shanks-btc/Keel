import { describe, it, expect } from "vitest";
import {
  checkAllowlist,
  isTradeable,
  isVolatile,
  isStable,
  VOLATILE_ASSETS,
  STABLE_ASSETS,
  GAS_ASSET,
} from "../src/guardrails/allowlist.js";
import { checkPerTradeCap, checkDailyLossCap } from "../src/guardrails/caps.js";
import { checkSlippage } from "../src/guardrails/slippage.js";
import { checkKillSwitch, computeDrawdown } from "../src/guardrails/killSwitch.js";
import { DEFAULT_POLICY } from "../src/config.js";

// ── Allowlist ─────────────────────────────────────────────────────────────────

describe("allowlist — tradeable set", () => {
  it("accepts all volatile assets", () => {
    for (const a of VOLATILE_ASSETS) {
      expect(isTradeable(a)).toBe(true);
    }
  });

  it("accepts all stable assets", () => {
    for (const a of STABLE_ASSETS) {
      expect(isTradeable(a)).toBe(true);
    }
  });

  it("rejects BNB (gas-only, not tradeable)", () => {
    expect(isTradeable(GAS_ASSET)).toBe(false);
    expect(isTradeable("BNB")).toBe(false);
  });

  it("rejects BTC (not in allowlist)", () => {
    expect(isTradeable("BTC")).toBe(false);
  });

  it("rejects BTCB (explicitly excluded, verify-in-docs.md §16)", () => {
    expect(isTradeable("BTCB")).toBe(false);
  });

  it("rejects arbitrary strings", () => {
    expect(isTradeable("PERP")).toBe(false);
    expect(isTradeable("ETH-PERP")).toBe(false); // spot-only; no perps
    expect(isTradeable("")).toBe(false);
  });

  it("isVolatile is true only for ETH, CAKE, LINK", () => {
    expect(isVolatile("ETH")).toBe(true);
    expect(isVolatile("CAKE")).toBe(true);
    expect(isVolatile("LINK")).toBe(true);
    expect(isVolatile("USDT")).toBe(false);
    expect(isVolatile("BNB")).toBe(false);
  });

  it("isStable is true only for USDT, USDC, USD1, FDUSD", () => {
    expect(isStable("USDT")).toBe(true);
    expect(isStable("USDC")).toBe(true);
    expect(isStable("USD1")).toBe(true);
    expect(isStable("FDUSD")).toBe(true);
    expect(isStable("ETH")).toBe(false);
    expect(isStable("BNB")).toBe(false);
  });
});

describe("checkAllowlist — full guard", () => {
  it("passes for ETH → USDT", () => {
    const r = checkAllowlist("ETH", "USDT");
    expect(r.ok).toBe(true);
  });

  it("passes for USDC → CAKE", () => {
    expect(checkAllowlist("USDC", "CAKE").ok).toBe(true);
  });

  it("fails when fromAsset is BNB", () => {
    const r = checkAllowlist("BNB", "USDT");
    expect(r.ok).toBe(false);
    expect(r.guardName).toBe("allowlist");
    expect(r.reason).toMatch(/fromAsset/);
  });

  it("fails when toAsset is BTC", () => {
    const r = checkAllowlist("ETH", "BTC");
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/toAsset/);
  });
});

// ── Per-trade cap ─────────────────────────────────────────────────────────────

describe("checkPerTradeCap", () => {
  it("passes when trade is exactly at the 25% cap", () => {
    // 250 / 1000 = 25% — NOT exceeding (strict greater-than)
    expect(checkPerTradeCap(250, 1000).ok).toBe(true);
  });

  it("fails when trade exceeds 25%", () => {
    const r = checkPerTradeCap(251, 1000);
    expect(r.ok).toBe(false);
    expect(r.guardName).toBe("perTradeCap");
    expect(r.reason).toMatch(/exceeds cap/);
  });

  it("passes small trades comfortably within cap", () => {
    expect(checkPerTradeCap(10, 1000).ok).toBe(true); // 1%
  });

  it("fails on zero portfolio (edge case)", () => {
    expect(checkPerTradeCap(100, 0).ok).toBe(false);
  });

  it("respects a custom cap", () => {
    const strictPolicy = { ...DEFAULT_POLICY, perTradeCapFraction: 0.1 };
    expect(checkPerTradeCap(100, 1000, strictPolicy).ok).toBe(true);  // 10% = at cap, not exceeding
    expect(checkPerTradeCap(101, 1000, strictPolicy).ok).toBe(false); // 10.1% > cap
    expect(checkPerTradeCap(99, 1000, strictPolicy).ok).toBe(true);
  });
});

// ── Daily-loss cap ────────────────────────────────────────────────────────────

describe("checkDailyLossCap", () => {
  it("passes when daily loss is below 5%", () => {
    expect(checkDailyLossCap(40, 1000).ok).toBe(true); // 4%
  });

  it("fails when daily loss reaches 5%", () => {
    // 50 / 1000 = 5% — at cap, new risk halted
    const r = checkDailyLossCap(50, 1000);
    expect(r.ok).toBe(false);
    expect(r.guardName).toBe("dailyLossCap");
    expect(r.reason).toMatch(/de-risk only/);
  });

  it("fails when daily loss exceeds 5%", () => {
    expect(checkDailyLossCap(60, 1000).ok).toBe(false); // 6%
  });

  it("fails on zero portfolio", () => {
    expect(checkDailyLossCap(10, 0).ok).toBe(false);
  });
});

// ── Slippage ──────────────────────────────────────────────────────────────────

describe("checkSlippage", () => {
  const baseQuote = {
    input: "5",
    output: "0.002886",
    minReceived: "0.002857",
    provider: "LiquidMesh",
  };

  it("passes when priceImpact is 0 (confirmed in verify-in-docs.md §6)", () => {
    expect(checkSlippage({ ...baseQuote, priceImpact: 0 }).ok).toBe(true);
  });

  it("passes when priceImpact is below 1%", () => {
    expect(checkSlippage({ ...baseQuote, priceImpact: 0.99 }).ok).toBe(true);
  });

  it("passes when priceImpact exactly equals 1% (not exceeding the limit)", () => {
    // At exactly the limit, the quote is accepted (exceeds means strictly greater)
    expect(checkSlippage({ ...baseQuote, priceImpact: 1.0 }).ok).toBe(true);
  });

  it("fails when priceImpact is just above 1%", () => {
    expect(checkSlippage({ ...baseQuote, priceImpact: 1.01 }).ok).toBe(false);
  });

  it("fails when priceImpact exceeds 1%", () => {
    const r = checkSlippage({ ...baseQuote, priceImpact: 1.5 });
    expect(r.ok).toBe(false);
    expect(r.guardName).toBe("slippage");
    expect(r.reason).toMatch(/exceeds limit/);
  });

  it("handles string priceImpact from TWAK (TWAK may return strings)", () => {
    expect(checkSlippage({ ...baseQuote, priceImpact: "0" }).ok).toBe(true);
    expect(checkSlippage({ ...baseQuote, priceImpact: "0.5" }).ok).toBe(true);
    expect(checkSlippage({ ...baseQuote, priceImpact: "1.1" }).ok).toBe(false);
  });

  it("fails on unparseable priceImpact", () => {
    expect(checkSlippage({ ...baseQuote, priceImpact: "n/a" }).ok).toBe(false);
  });
});

// ── Kill-switch ───────────────────────────────────────────────────────────────

describe("checkKillSwitch", () => {
  it("does NOT trigger at -17% (above kill-switch threshold of -18%)", () => {
    const r = checkKillSwitch(-17);
    expect(r.triggered).toBe(false);
    expect(r.action).toBe("hold");
  });

  it("triggers at exactly -18% (the kill-switch threshold)", () => {
    const r = checkKillSwitch(-18);
    expect(r.triggered).toBe(true);
    expect(r.action).toBe("flatten-to-stables"); // NEVER "drain-to-dust"
    expect(r.reason).toMatch(/flatten/i);
  });

  it("triggers at -25% (well beyond threshold)", () => {
    const r = checkKillSwitch(-25);
    expect(r.triggered).toBe(true);
    expect(r.action).toBe("flatten-to-stables");
  });

  it("action is always flatten-to-stables, never drain-to-dust", () => {
    // never-dust invariant: the kill-switch rotates to stables, not to zero
    const r = checkKillSwitch(-100);
    expect(r.action).toBe("flatten-to-stables");
    expect(r.action).not.toBe("drain-to-dust");
  });

  it("does NOT trigger at 0 (no drawdown)", () => {
    expect(checkKillSwitch(0).triggered).toBe(false);
  });

  it("respects a custom policy threshold", () => {
    const tighter = { ...DEFAULT_POLICY, killSwitchPct: -10 };
    expect(checkKillSwitch(-9, tighter).triggered).toBe(false);
    expect(checkKillSwitch(-10, tighter).triggered).toBe(true);
  });
});

// ── computeDrawdown ───────────────────────────────────────────────────────────

describe("computeDrawdown", () => {
  it("returns 0 when at high-water mark", () => {
    expect(computeDrawdown(1000, 1000)).toBe(0);
  });

  it("returns 0 when above high-water mark (new ATH)", () => {
    expect(computeDrawdown(1100, 1000)).toBe(0);
  });

  it("returns -10 for a 10% drawdown", () => {
    expect(computeDrawdown(900, 1000)).toBeCloseTo(-10, 5);
  });

  it("returns -18 for an 18% drawdown (kill-switch territory)", () => {
    expect(computeDrawdown(820, 1000)).toBeCloseTo(-18, 5);
  });

  it("returns 0 when HWM is zero (edge case, no crash)", () => {
    expect(computeDrawdown(0, 0)).toBe(0);
  });
});

// ── End-to-end: kill-switch triggered by computeDrawdown ─────────────────────

describe("drawdown + kill-switch integration", () => {
  it("triggers kill-switch when drawdown reaches threshold from HWM calc", () => {
    const hwm = 5000;
    const current = 5000 * (1 - 0.18); // exactly 18% below HWM
    const dd = computeDrawdown(current, hwm);
    expect(dd).toBeCloseTo(-18, 2);
    const ks = checkKillSwitch(dd);
    expect(ks.triggered).toBe(true);
    expect(ks.action).toBe("flatten-to-stables");
  });

  it("does NOT trigger kill-switch at 17% drawdown", () => {
    const hwm = 5000;
    const current = 5000 * (1 - 0.17);
    const dd = computeDrawdown(current, hwm);
    expect(checkKillSwitch(dd).triggered).toBe(false);
  });
});
