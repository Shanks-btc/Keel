// Server-side API route — runs the §0a risk formula and §4 drawdown-gate logic
// against a neutral mock snapshot (CMC API is not available in the web process).
// Inline formulas mirror packages/agent/src/risk/engine.ts and
// packages/agent/src/loop/drawdown-gate.ts exactly.
// priceIsSimulation: true is always returned — the client MUST display the
// "SIMULATION" label on these results.

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { AgentPersistentState, DrawdownGateResult, RiskMode } from "@keel/shared";

export const dynamic = "force-dynamic";

const DATA_DIR = process.env.KEEL_DATA_DIR ?? resolve(process.cwd(), "../../data");

function readState(): AgentPersistentState | null {
  try {
    return JSON.parse(readFileSync(join(DATA_DIR, "agent-state.json"), "utf8")) as AgentPersistentState;
  } catch {
    return null;
  }
}

// §0a risk formula (identical to risk/engine.ts computeRiskScore):
//   R = clamp01( min(1,|c1h|/3)*0.4 + min(1,|c24h|/10)*0.4 + max(0,(fg-60)/40)*0.2 )
function computeR(change1h: number, change24h: number, fearGreed: number): number {
  const c1  = Math.min(1, Math.abs(change1h)  /  3) * 0.4;
  const c24 = Math.min(1, Math.abs(change24h) / 10) * 0.4;
  const fg  = Math.max(0, (fearGreed - 60) / 40)   * 0.2;
  return Math.min(1, Math.max(0, c1 + c24 + fg));
}

// §0a mode mapping (identical to risk/engine.ts pickMode):
function pickMode(R: number): { mode: RiskMode; targetVolatilePct: number } {
  if (R < 0.33) return { mode: "Risk-on",  targetVolatilePct: 80 };
  if (R < 0.66) return { mode: "Neutral",  targetVolatilePct: 45 };
  return           { mode: "Risk-off", targetVolatilePct: 18 };
}

// §4 projected-drawdown gate (stable→volatile risk-increasing preview):
//   mirrors loop/drawdown-gate.ts checkProjectedDrawdown
function checkDrawdownGate(
  drawdownPct: number,
  currentVolatilePct: number,
  tradeValueUsd: number,
  portfolioValueUsd: number,
): DrawdownGateResult {
  const projVolatileUsd = (currentVolatilePct / 100) * portfolioValueUsd + tradeValueUsd;
  const projVolatilePct = portfolioValueUsd > 0
    ? (projVolatileUsd / portfolioValueUsd) * 100
    : 0;

  if (drawdownPct <= -14) {
    return {
      ok: false,
      guardName: "projected-drawdown",
      reason: `emergency mode (drawdown ${drawdownPct.toFixed(2)}% ≤ -14%): no new volatile exposure permitted`,
      projectedVolatilePct: projVolatilePct,
      isRiskReducing: false,
    };
  }
  if (drawdownPct <= -8 && projVolatilePct > 45) {
    return {
      ok: false,
      guardName: "projected-drawdown",
      reason: `projected volatile ${projVolatilePct.toFixed(1)}% > overlay cap 45% (drawdown ${drawdownPct.toFixed(2)}%)`,
      projectedVolatilePct: projVolatilePct,
      isRiskReducing: false,
    };
  }
  return {
    ok: true,
    guardName: "projected-drawdown",
    reason: `projected volatile ${projVolatilePct.toFixed(1)}% within safe bounds`,
    projectedVolatilePct: projVolatilePct,
    isRiskReducing: false,
  };
}

// Neutral mock snapshot — used only for the UI preview, never for real execution.
// All results produced from this are labelled priceIsSimulation: true.
const PREVIEW_SNAPSHOT = { change1h: 0.5, change24h: 2.0, fearGreed: 45, symbol: "ETH", price: 3_400 };

export async function GET() {
  const state = readState();

  const R = computeR(
    PREVIEW_SNAPSHOT.change1h,
    PREVIEW_SNAPSHOT.change24h,
    PREVIEW_SNAPSHOT.fearGreed,
  );
  const { mode, targetVolatilePct } = pickMode(R);

  // drawdownPct unknown without TWAK balance; assume 0 (at HWM) for the preview
  const hwmUsd = state?.highWaterMarkUsd ?? 0;
  const drawdownPct = 0;

  // §1 overlays: check emergency-mode / drawdown-overlay caps
  let adjustedTarget = targetVolatilePct;
  let emergencyMode = false;
  const overlaysApplied: string[] = [];
  if (drawdownPct <= -14) {
    adjustedTarget = Math.min(adjustedTarget, 18);
    emergencyMode = true;
    overlaysApplied.push("emergency-mode (cap 18%)");
  } else if (drawdownPct <= -8) {
    adjustedTarget = Math.min(adjustedTarget, 45);
    overlaysApplied.push("drawdown-overlay (cap 45%)");
  }

  // §4 drawdown gate: preview a typical risk-increasing trade (25% of a $10k portfolio)
  const portfolioPreview = 10_000;
  const tradePreview = portfolioPreview * 0.25;
  const volatilePreview = 45; // neutral assumption
  const drawdownGate = checkDrawdownGate(drawdownPct, volatilePreview, tradePreview, portfolioPreview);

  return NextResponse.json({
    ok: true,
    priceIsSimulation: true,
    snapshot: PREVIEW_SNAPSHOT,
    R: +R.toFixed(4),
    mode,
    targetVolatilePct,
    adjustedTarget,
    emergencyMode,
    overlaysApplied,
    drawdownPct,
    hwmUsd,
    drawdownGate,
    dayLedger: state?.dayLedger ?? {},
  });
}
