// One pure decision cycle — all I/O is injected; no real network calls here.
//
// Flow: check kill-switch (overrides if triggered) → compute risk score →
//       decide rotation (shouldRebalance) → clamp trade to per-trade cap →
//       fetch quote (injected runner) → gate → buildExecutePlan → return.
//
// Primary spot pair: ETH / USDT (same as keel.cjs).

import type {
  MarketSnapshot,
  PortfolioState,
  CycleResult,
  TradeProposal,
  TwakQuote,
  PolicyConfig,
} from "@keel/shared";
import { computeRiskScore, shouldRebalance } from "../risk/engine.js";
import { checkKillSwitch, computeDrawdown } from "../guardrails/killSwitch.js";
import { evaluateTrade } from "./gate.js";
import {
  buildExecutePlan,
  getQuote,
  type QuoteRunner,
} from "../execution/twak.js";
import { DEFAULT_POLICY } from "../config.js";

const PRIMARY_VOLATILE = "ETH" as const;
const PRIMARY_STABLE = "USDT" as const;

export interface CycleInput {
  snapshot: MarketSnapshot;
  portfolio: PortfolioState;
  policy?: PolicyConfig;
  runner?: QuoteRunner; // inject a stub in tests; omit to skip quote fetch
}

export function runCycle(input: CycleInput): CycleResult {
  const { snapshot, portfolio, policy = DEFAULT_POLICY, runner } = input;
  const timestamp = new Date().toISOString();

  // 1. Kill-switch — hard backstop, evaluated before any rotation logic
  const drawdownPct = computeDrawdown(
    portfolio.totalValueUsd,
    portfolio.highWaterMarkUsd,
  );
  const killSwitchResult = checkKillSwitch(drawdownPct, policy);

  // 2. Risk score (needed for mode + targetVolatilePct even on kill-switch path)
  const riskScore = computeRiskScore(snapshot, policy);
  const { mode, targetVolatilePct } = riskScore;

  if (killSwitchResult.triggered) {
    // Flatten all volatile holdings to stables; bypass normal rotation
    const amountIn =
      snapshot.price > 0
        ? portfolio.volatileValueUsd / snapshot.price
        : 0;

    const proposal: TradeProposal = {
      fromAsset: PRIMARY_VOLATILE,
      toAsset: PRIMARY_STABLE,
      amountIn,
      estimatedValueUsd: portfolio.volatileValueUsd,
      reason: killSwitchResult.reason,
      mode,
      R: riskScore.R,
    };

    const executionPlan = buildExecutePlan(
      { amountIn, fromAsset: PRIMARY_VOLATILE, toAsset: PRIMARY_STABLE },
      null,
      proposal,
    );
    const wouldBeCommand = [executionPlan.command, ...executionPlan.args].join(" ");

    return {
      timestamp,
      snapshot,
      riskScore,
      mode,
      proposal,
      executionPlan,
      wouldBeCommand,
      guardrailResults: [],
      killSwitchResult,
      reason: `Kill-switch triggered at ${drawdownPct.toFixed(2)}% drawdown — flattening to stables`,
    };
  }

  // 3. Rebalance decision
  const currentVolatilePct =
    portfolio.totalValueUsd > 0
      ? (portfolio.volatileValueUsd / portfolio.totalValueUsd) * 100
      : 0;

  if (!shouldRebalance(currentVolatilePct, targetVolatilePct, policy)) {
    return {
      timestamp,
      snapshot,
      riskScore,
      mode,
      proposal: null,
      executionPlan: null,
      wouldBeCommand: null,
      guardrailResults: [],
      killSwitchResult,
      reason: `Within band: current ${currentVolatilePct.toFixed(1)}% volatile vs target ${targetVolatilePct}% (band ±${policy.rebalanceBandPct}%)`,
    };
  }

  // 4. Build trade proposal (clamped at per-trade cap to stay within guardrail)
  const buyingVolatile = currentVolatilePct < targetVolatilePct;
  const fromAsset = buyingVolatile ? PRIMARY_STABLE : PRIMARY_VOLATILE;
  const toAsset = buyingVolatile ? PRIMARY_VOLATILE : PRIMARY_STABLE;

  const deltaUsd = Math.abs(
    ((targetVolatilePct - currentVolatilePct) / 100) * portfolio.totalValueUsd,
  );
  const perTradeCapUsd = portfolio.totalValueUsd * policy.perTradeCapFraction;
  const tradeUsd = Math.min(deltaUsd, perTradeCapUsd);

  const amountIn = buyingVolatile
    ? tradeUsd                          // stables in: amount in stable units (≈USD)
    : tradeUsd / snapshot.price;        // volatile in: convert USD → ETH units

  const proposal: TradeProposal = {
    fromAsset,
    toAsset,
    amountIn,
    estimatedValueUsd: tradeUsd,
    reason: `Rebalance from ${currentVolatilePct.toFixed(1)}% to ${targetVolatilePct}% volatile (mode: ${mode}, R=${riskScore.R.toFixed(3)})`,
    mode,
    R: riskScore.R,
  };

  // 5. Optional quote fetch (only when runner is provided)
  let quote: TwakQuote | null = null;
  if (runner !== undefined) {
    try {
      quote = getQuote(
        { amountIn: proposal.amountIn, fromAsset: proposal.fromAsset, toAsset: proposal.toAsset },
        runner,
      );
    } catch {
      // Quote unavailable — gate will proceed without slippage check
    }
  }

  // 6. Gate
  const gateResult = evaluateTrade({ proposal, portfolio, quote, policy });

  if (!gateResult.approved) {
    return {
      timestamp,
      snapshot,
      riskScore,
      mode,
      proposal,
      executionPlan: null,
      wouldBeCommand: null,
      guardrailResults: gateResult.guardrailResults,
      killSwitchResult,
      reason: `Guardrail blocked: ${gateResult.firstFailure?.reason ?? "unknown"}`,
    };
  }

  // 7. Build execution plan (pure — no spawn)
  const executionPlan = buildExecutePlan(
    { amountIn: proposal.amountIn, fromAsset: proposal.fromAsset, toAsset: proposal.toAsset },
    quote,
    proposal,
  );
  const wouldBeCommand = [executionPlan.command, ...executionPlan.args].join(" ");

  return {
    timestamp,
    snapshot,
    riskScore,
    mode,
    proposal,
    executionPlan,
    wouldBeCommand,
    guardrailResults: gateResult.guardrailResults,
    killSwitchResult,
    reason: proposal.reason,
  };
}
