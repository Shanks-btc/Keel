// Keel shared types — spot-only, BSC, mock-data shapes for the dashboard.
// Forbidden: perps, futures, leverage, long, short, entry price, mark price,
// liquidation, order book. Every "position" is a spot holding.

export type AssetSymbol =
  | "ETH"
  | "CAKE"
  | "LINK"
  | "USDT"
  | "USDC"
  | "USD1"
  | "FDUSD"
  | "BNB";

export type AssetRole = "Volatile" | "Stable" | "Gas";

export type AgentStatus = "Running" | "Paused" | "Error";

export type RiskMode = "Risk-on" | "Neutral" | "Risk-off";

export type SwapAction = "Buy" | "Sell" | "Rebalance" | "Hold";

export type HealthStatus = "ok" | "warn" | "error";

// ── Portfolio value ─────────────────────────────────────────────────────────

export interface PortfolioValuePoint {
  timestamp: string; // ISO-8601
  valueUsd: number;
}

export interface PortfolioValue {
  currentUsd: number;
  change24hUsd: number;
  change24hPct: number;
  series: PortfolioValuePoint[]; // last 24 h at 5-min resolution
}

// ── PnL ─────────────────────────────────────────────────────────────────────

export interface PnL {
  realizedUsd: number;
  unrealizedUsd: number;
  totalUsd: number;
  change24hPct: number;
}

// ── Exposure ─────────────────────────────────────────────────────────────────

export interface Exposure {
  volatilePct: number; // e.g. 78
  stablePct: number;   // e.g. 20
  gasPct: number;      // e.g. 2  (BNB only)
}

// ── Spot holdings ────────────────────────────────────────────────────────────

export interface SpotHolding {
  asset: AssetSymbol;
  role: AssetRole;
  balance: number;
  valueUsd: number;
  allocationPct: number;
  change24hPct: number;
}

// ── Allocation (donut) ───────────────────────────────────────────────────────

export interface AllocationSlice {
  asset: AssetSymbol;
  role: AssetRole;
  pct: number;
  valueUsd: number;
  color: string;
}

// ── Market signals ───────────────────────────────────────────────────────────

export interface MarketSignals {
  fearGreed: number;         // 0-100
  fearGreedLabel: string;    // e.g. "Fear"
  change1hPct: number;       // basket-level % change
  change24hPct: number;
  trend: "Bullish" | "Bearish" | "Neutral";
  assetPrice: number;        // primary volatile asset (ETH) USD price
  assetSymbol: AssetSymbol;
}

// ── Risk score ────────────────────────────────────────────────────────────────

export interface RiskComponent {
  label: string;       // "1h Change" | "24h Change" | "Fear & Greed"
  value: number;       // raw input (%, %, 0-100)
  contribution: number; // 0-1, the weighted component
}

export interface RiskScore {
  R: number;                 // 0-1
  mode: RiskMode;
  targetVolatilePct: number; // 80 | 45 | 18
  components: [RiskComponent, RiskComponent, RiskComponent];
}

// ── Drawdown ──────────────────────────────────────────────────────────────────

export interface DrawdownPoint {
  timestamp: string;
  drawdownPct: number; // negative, e.g. -4.2
}

export interface DrawdownState {
  currentPct: number;      // e.g. -4.2
  limitPct: number;        // alert threshold, e.g. -12
  killSwitchPct: number;   // hard backstop, e.g. -18
  highWaterMarkUsd: number;
  series: DrawdownPoint[];
}

// ── Swap ──────────────────────────────────────────────────────────────────────

export interface Swap {
  id: string;
  timestamp: string;
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountIn: number;
  amountOut: number;
  valueUsd: number;
  priceImpactPct: number;
  slippagePct: number;
  reason: string;
  txHash: string;
  explorerUrl: string;
}

// ── Proof trail ──────────────────────────────────────────────────────────────

export type ProofEntryType =
  | "Decision"
  | "SwapExecution"
  | "x402Confirmation"
  | "AgentIdentity"
  | "Network";

export interface ProofEntry {
  id: string;
  type: ProofEntryType;
  label: string;
  timestamp: string;
  txHash?: string;
  explorerUrl?: string;
  verified: boolean;
  detail: string;
}

// ── x402 ──────────────────────────────────────────────────────────────────────

export interface X402Confirmation {
  totalConfirmed: number;
  lastConfirmedAt: string | null;
  lastAmountUsdc: number | null; // e.g. 0.01
  settlementChain: "Base" | "BSC";
}

// ── Swap / Decision log ───────────────────────────────────────────────────────

export interface SwapLogRow {
  id: string;
  timestamp: string;
  mode: RiskMode;
  action: SwapAction;
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  sizeIn: number;
  valueUsd: number;
  reason: string;
  txHash: string | null;
  explorerUrl: string | null;
}

// ── System health ─────────────────────────────────────────────────────────────

export interface HealthItem {
  label: string;
  status: HealthStatus;
  detail: string;
}

// ── Agent perception output (raw CMC snapshot) ───────────────────────────────
// Matches the verified CMC REST fields: data[symbol].quote.USD.*
// and data.value from v3/fear-and-greed/latest.

export interface MarketSnapshot {
  symbol: string;       // e.g. "ETH"
  price: number;        // USD price
  change1h: number;     // percent_change_1h
  change24h: number;    // percent_change_24h
  fearGreed: number;    // 0–100 from v3/fear-and-greed/latest
  fetchedAt: string;    // ISO-8601
}

// ── Policy config (all tunable thresholds from risk-policy.md) ───────────────

export interface PolicyConfig {
  // Risk engine weights (must sum to 1.0)
  change1hWeight: number;    // default 0.4
  change24hWeight: number;   // default 0.4
  fearGreedWeight: number;   // default 0.2

  // Risk engine scales
  change1hScale: number;     // default 3  — |c1h| / scale before weight
  change24hScale: number;    // default 10 — |c24h| / scale before weight
  fearGreedNeutral: number;  // default 60 — greed premium above this

  // Mode thresholds
  riskOnThreshold: number;   // default 0.33
  riskOffThreshold: number;  // default 0.66

  // Target volatile exposure per mode (spot holdings, not perps)
  riskOnTargetPct: number;   // default 80
  neutralTargetPct: number;  // default 45
  riskOffTargetPct: number;  // default 18  — NEVER 0

  // Guardrails
  perTradeCapFraction: number; // default 0.25 — max single swap as fraction of portfolio
  dailyLossCapPct: number;     // default 5    — % of portfolio, halts new risk
  maxSlippagePct: number;      // default 1.0  — rejects if TWAK priceImpact exceeds this
  drawdownAlertPct: number;    // default -12  — warn threshold (< 0)
  killSwitchPct: number;       // default -18  — hard backstop (< drawdownAlertPct)

  // Anti-churn
  rebalanceBandPct: number;    // default 5    — only rebalance if deviation > this
}

// ── Guardrail check result ────────────────────────────────────────────────────

export interface GuardrailResult {
  ok: boolean;
  guardName: string;
  reason: string;
}

// ── Kill-switch result (specialised guardrail) ────────────────────────────────

export interface KillSwitchResult {
  triggered: boolean;
  action: "hold" | "flatten-to-stables"; // never "drain-to-dust"
  drawdownPct: number;
  reason: string;
}

// ── Trade proposal (pre-execution decision, no funds) ────────────────────────

export interface TradeProposal {
  fromAsset: AssetSymbol;
  toAsset: AssetSymbol;
  amountIn: number;           // in fromAsset units
  estimatedValueUsd: number;
  reason: string;
  mode: RiskMode;
  R: number;
}

// ── TWAK quote output (confirmed fields from verify-in-docs.md §6) ───────────
// Returned by: twak swap <amt> <from> <to> --chain bsc --slippage <pct> --quote-only --json
// All fields may be string or number depending on CLI version.

export interface TwakQuote {
  input: string | number;
  output: string | number;
  minReceived: string | number;
  provider: string;
  priceImpact: string | number;
}

// ── Portfolio state (current holdings snapshot for the decision cycle) ────────

export interface PortfolioState {
  totalValueUsd: number;
  volatileValueUsd: number;
  stableValueUsd: number;
  highWaterMarkUsd: number;
  dailyLossUsd: number;
}

// ── Execution plan (pure: the command that WOULD run, never spawned here) ─────

export interface ExecutionPlan {
  command: string;
  args: string[];
  proposal: TradeProposal;
  quote: TwakQuote | null;
  dryRun: boolean;
}

// ── Execution result (returned by the gated live execute path) ────────────────
// ok:true  → swap was sent; txHash and explorerUrl are set.
// ok:false → runner threw or TWAK returned an error; error is set.

export interface ExecutionResult {
  ok: boolean;
  txHash?: string;          // BSC tx hash when the swap succeeded
  explorerUrl?: string;     // https://bscscan.com/tx/<txHash>
  error?: string;           // set when ok is false
}

// ── Cycle result (output of one full decision cycle) ─────────────────────────

export interface CycleResult {
  timestamp: string;
  snapshot: MarketSnapshot;
  riskScore: RiskScore;
  mode: RiskMode;
  proposal: TradeProposal | null;
  executionPlan: ExecutionPlan | null;
  wouldBeCommand: string | null;
  guardrailResults: GuardrailResult[];
  killSwitchResult: KillSwitchResult;
  reason: string;
}

// ── Agent state (top-level for the dashboard) ─────────────────────────────────

export interface AgentState {
  status: AgentStatus;
  mode: RiskMode;
  walletAddress: string;
  lastUpdated: string;
  portfolioValue: PortfolioValue;
  pnl: PnL;
  exposure: Exposure;
  latestSwap: Swap;
  drawdown: DrawdownState;
  holdings: SpotHolding[];
  allocation: AllocationSlice[];
  marketSignals: MarketSignals;
  riskScore: RiskScore;
  proofTrail: ProofEntry[];
  x402: X402Confirmation;
  swapLog: SwapLogRow[];
  systemHealth: HealthItem[];
}
