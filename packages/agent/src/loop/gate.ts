// Trade gate — runs all five guardrails in their required order.
// Order: kill-switch (hard backstop) → allowlist → per-trade cap →
//        daily-loss cap → slippage (skipped when no quote available).
// Returns on first failure so the reason is unambiguous.

import type {
  GuardrailResult,
  KillSwitchResult,
  TradeProposal,
  TwakQuote,
  PortfolioState,
  PolicyConfig,
} from "@keel/shared";
import { checkAllowlist } from "../guardrails/allowlist.js";
import { checkPerTradeCap, checkDailyLossCap } from "../guardrails/caps.js";
import { checkSlippage } from "../guardrails/slippage.js";
import { checkKillSwitch, computeDrawdown } from "../guardrails/killSwitch.js";
import { DEFAULT_POLICY } from "../config.js";

export interface GateInput {
  proposal: TradeProposal;
  portfolio: PortfolioState;
  quote: TwakQuote | null;
  policy?: PolicyConfig;
}

export interface GateResult {
  approved: boolean;
  killSwitchResult: KillSwitchResult;
  guardrailResults: GuardrailResult[];
  firstFailure: GuardrailResult | null;
}

export function evaluateTrade(input: GateInput): GateResult {
  const { proposal, portfolio, quote, policy = DEFAULT_POLICY } = input;
  const results: GuardrailResult[] = [];

  // 1. Kill-switch — checked first; hard backstop overrides everything
  const drawdown = computeDrawdown(
    portfolio.totalValueUsd,
    portfolio.highWaterMarkUsd,
  );
  const ksResult = checkKillSwitch(drawdown, policy);
  if (ksResult.triggered) {
    const ksGuard: GuardrailResult = {
      ok: false,
      guardName: "killSwitch",
      reason: ksResult.reason,
    };
    results.push(ksGuard);
    return {
      approved: false,
      killSwitchResult: ksResult,
      guardrailResults: results,
      firstFailure: ksGuard,
    };
  }

  // 2. Allowlist
  const allowResult = checkAllowlist(proposal.fromAsset, proposal.toAsset);
  results.push(allowResult);
  if (!allowResult.ok) {
    return {
      approved: false,
      killSwitchResult: ksResult,
      guardrailResults: results,
      firstFailure: allowResult,
    };
  }

  // 3. Per-trade cap
  const tradeCapResult = checkPerTradeCap(
    proposal.estimatedValueUsd,
    portfolio.totalValueUsd,
    policy,
  );
  results.push(tradeCapResult);
  if (!tradeCapResult.ok) {
    return {
      approved: false,
      killSwitchResult: ksResult,
      guardrailResults: results,
      firstFailure: tradeCapResult,
    };
  }

  // 4. Daily-loss cap
  const dailyLossResult = checkDailyLossCap(
    portfolio.dailyLossUsd,
    portfolio.totalValueUsd,
    policy,
  );
  results.push(dailyLossResult);
  if (!dailyLossResult.ok) {
    return {
      approved: false,
      killSwitchResult: ksResult,
      guardrailResults: results,
      firstFailure: dailyLossResult,
    };
  }

  // 5. Slippage — only when a quote is available
  if (quote !== null) {
    const slippageResult = checkSlippage(quote, policy);
    results.push(slippageResult);
    if (!slippageResult.ok) {
      return {
        approved: false,
        killSwitchResult: ksResult,
        guardrailResults: results,
        firstFailure: slippageResult,
      };
    }
  }

  return {
    approved: true,
    killSwitchResult: ksResult,
    guardrailResults: results,
    firstFailure: null,
  };
}
