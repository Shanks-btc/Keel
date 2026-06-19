// packages/agent public surface — perception + risk + guardrails + execution (dry-run) + loop.

export { fetchMarketSnapshot, CmcError } from "./perception/cmc.js";
export {
  isHubEnabled,
  checkHubConnectivity,
  fetchHubSnapshot,
  fetchHubEnrichment,
  HUB_MCP_URL,
} from "./perception/hub.js";
export type { HubToolRunner } from "./perception/hub.js";
export { fetchSignals } from "./perception/signals.js";
export type { RestFetcher } from "./perception/signals.js";
export { isX402Enabled, attemptX402, attemptX402FromEnv } from "./perception/x402.js";
export type { X402Runner, X402PaymentResult } from "./perception/x402.js";
export { computeRiskScore, pickMode, shouldRebalance } from "./risk/engine.js";
export {
  isEmergencyMode,
  applyDrawdownOverlay,
  applyMacroEventOverlay,
  applyTACautionOverlay,
  applyRegimeBiasOverlay,
  applyAllOverlays,
} from "./risk/overlays.js";
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
export { checkProjectedDrawdown } from "./loop/drawdown-gate.js";
export type { DrawdownGateInput } from "./loop/drawdown-gate.js";
export { runScheduler } from "./loop/scheduler.js";
export type { SchedulerInput, SchedulerResult, SchedulerDeps } from "./loop/scheduler.js";
export {
  getDayKey,
  loadState,
  saveState,
  updateHwm,
  recordDayAttempt,
  DEFAULT_DATA_DIR,
} from "./state/persistence.js";
export { appendAuditEntry, readAuditLog } from "./state/audit.js";
