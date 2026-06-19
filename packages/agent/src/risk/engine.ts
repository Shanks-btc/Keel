// Risk engine — pure, deterministic, no side-effects.
// Formula is the EXACT verified formula from docs/risk-policy.md §2
// and keel.cjs score(). Do not change weights/scales without updating
// docs/risk-policy.md and docs/plan.md.

import type { MarketSnapshot, RiskScore, RiskMode, PolicyConfig } from "@keel/shared";
import { DEFAULT_POLICY } from "../config.js";

// ── Internal helpers ─────────────────────────────────────────────────────────

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

// ── Risk score computation ────────────────────────────────────────────────────
// R ∈ [0, 1]. Higher R = more defensive.
//
// R = clamp01(
//       min(1, |change1h|  / scale1h ) * w1h   // short-term volatility
//     + min(1, |change24h| / scale24h) * w24h   // daily volatility
//     + max(0, (fearGreed - neutral) / 40) * wfg // greed premium (fear adds nothing)
// )
//
// Plain fear does NOT raise R. This is intentional (see risk-policy.md §2).

export function computeRiskScore(
  snapshot: MarketSnapshot,
  policy: PolicyConfig = DEFAULT_POLICY,
): RiskScore {
  const { change1h, change24h, fearGreed } = snapshot;
  const {
    change1hWeight: w1h,
    change24hWeight: w24h,
    fearGreedWeight: wfg,
    change1hScale: s1h,
    change24hScale: s24h,
    fearGreedNeutral: neutral,
  } = policy;

  const c1hContrib = Math.min(1, Math.abs(change1h) / s1h) * w1h;
  const c24hContrib = Math.min(1, Math.abs(change24h) / s24h) * w24h;
  const fgContrib = Math.max(0, (fearGreed - neutral) / 40) * wfg;

  const R = clamp01(c1hContrib + c24hContrib + fgContrib);
  const { mode, targetVolatilePct } = pickMode(R, policy);

  return {
    R,
    mode,
    targetVolatilePct,
    components: [
      { label: "1h Change", value: change1h, contribution: c1hContrib },
      { label: "24h Change", value: change24h, contribution: c24hContrib },
      { label: "Fear & Greed", value: fearGreed, contribution: fgContrib },
    ],
  };
}

// ── Mode mapping ──────────────────────────────────────────────────────────────
// Matches keel.cjs pickMode() and docs/risk-policy.md §3.

export function pickMode(
  R: number,
  policy: PolicyConfig = DEFAULT_POLICY,
): { mode: RiskMode; targetVolatilePct: number } {
  if (R < policy.riskOnThreshold) {
    return { mode: "Risk-on", targetVolatilePct: policy.riskOnTargetPct };
  }
  if (R < policy.riskOffThreshold) {
    return { mode: "Neutral", targetVolatilePct: policy.neutralTargetPct };
  }
  return { mode: "Risk-off", targetVolatilePct: policy.riskOffTargetPct };
}

// ── Rebalance decision ────────────────────────────────────────────────────────
// Returns true when the current volatile exposure deviates from target by more
// than the anti-churn rebalance band. Pure logic — no side effects.

export function shouldRebalance(
  currentVolatilePct: number,
  targetVolatilePct: number,
  policy: PolicyConfig = DEFAULT_POLICY,
): boolean {
  return (
    Math.abs(currentVolatilePct - targetVolatilePct) > policy.rebalanceBandPct
  );
}
