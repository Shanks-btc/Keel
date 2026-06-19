// packages/agent public surface — perception + risk + guardrails + execution (dry-run) + loop.

export { fetchMarketSnapshot, CmcError } from "./perception/cmc.js";
export { computeRiskScore, pickMode, shouldRebalance } from "./risk/engine.js";
export {
  checkAllowlist,
  checkPerTradeCap,
  checkDailyLossCap,
  checkSlippage,
  checkKillSwitch,
  computeDrawdown,
  isTradeable,
  isVolatile,
  isStable,
  VOLATILE_ASSETS,
  STABLE_ASSETS,
  TRADEABLE_ASSETS,
  GAS_ASSET,
} from "./guardrails/index.js";
export type { TwakQuote } from "./guardrails/index.js";
export { DEFAULT_POLICY } from "./config.js";
export {
  parseTwakJson,
  getQuote,
  buildExecutePlan,
  execute,
} from "./execution/twak.js";
export type { QuoteRunner, QuoteParams, ExecuteMode, LiveRunner } from "./execution/twak.js";
export { evaluateTrade } from "./loop/gate.js";
export type { GateInput, GateResult } from "./loop/gate.js";
export { runCycle } from "./loop/cycle.js";
export type { CycleInput } from "./loop/cycle.js";
