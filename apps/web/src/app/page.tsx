"use client";

import { useState, useEffect, useCallback } from "react";
import { mockAgentState } from "../lib/mock";
import type {
  AgentPersistentState,
  AuditEntry,
  RiskMode,
  SwapLogRow,
  Swap,
  PortfolioValue,
  Exposure,
  PortfolioSnapshot,
  PortfolioFreshness,
} from "@keel/shared";
import { AppShell } from "../components/AppShell";
import { TopTradingBar } from "../components/TopTradingBar";
import { TradingSummaryRow } from "../components/TradingSummaryRow";
import { PortfolioValueCard } from "../components/PortfolioValueCard";
import { PnLCard } from "../components/PnLCard";
import { ExposureCard } from "../components/ExposureCard";
import { LatestSwapCard } from "../components/LatestSwapCard";
import { DrawdownSummaryCard } from "../components/DrawdownSummaryCard";
import { PortfolioAllocationCard } from "../components/PortfolioAllocationCard";
import { SpotHoldingsTable } from "../components/SpotHoldingsTable";
import { MarketSignalsCard } from "../components/MarketSignalsCard";
import { RiskScoreBreakdownCard } from "../components/RiskScoreBreakdownCard";
import { DrawdownGuardrailChart } from "../components/DrawdownGuardrailChart";
import { LatestAutonomousSwapCard } from "../components/LatestAutonomousSwapCard";
import { ProofTrailCard } from "../components/ProofTrailCard";
import { X402ConfirmationCard } from "../components/X402ConfirmationCard";
import { SwapDecisionLogTable } from "../components/SwapDecisionLogTable";
import { SystemHealthCard } from "../components/SystemHealthCard";
import { AgentControls } from "../components/AgentControls";
import { AgentWalletProofCard } from "../components/AgentWalletProofCard";
import { SchedulerStatusCard } from "../components/SchedulerStatusCard";

interface AgentStateResponse {
  ok: boolean;
  state: AgentPersistentState | null;
  lastAuditEntry: AuditEntry | null;
  totalCycles: number;
  liveCycles: number;
  dryRunCycles: number;
  recentLiveAudit: AuditEntry[];
  balanceSummary: { totalUsd: number; volatileUsd: number; stableUsd: number; source: "env" } | null;
}

interface PortfolioApiResponse {
  ok: boolean;
  snapshot: PortfolioSnapshot | null;
  freshness: PortfolioFreshness;
  source: string;
}

const STABLES = new Set(["USDT", "USDC", "USD1", "FDUSD"]);

function auditToSwapRow(entry: AuditEntry, index: number): SwapLogRow {
  const proposal = entry.proposal;

  let action: "Buy" | "Sell" | "Hold" | "Rebalance";
  if (entry.action === "BLOCKED" || entry.action === "SKIPPED") {
    action = "Hold";
  } else if (entry.action === "KILL_SWITCH") {
    action = "Sell";
  } else if (entry.action === "FALLBACK_EXECUTED") {
    action = "Rebalance";
  } else if (proposal) {
    const fromStable = STABLES.has(proposal.fromAsset);
    const toStable   = STABLES.has(proposal.toAsset);
    action = fromStable && !toStable ? "Buy" : !fromStable && toStable ? "Sell" : "Rebalance";
  } else {
    action = "Hold";
  }

  return {
    id: `audit-${index}`,
    timestamp: entry.cycleId,
    mode: entry.mode as RiskMode,
    action,
    fromAsset: proposal?.fromAsset ?? "ETH",
    toAsset:   proposal?.toAsset   ?? "ETH",
    sizeIn:    proposal?.amountIn  ?? 0,
    valueUsd:  proposal?.estimatedValueUsd ?? 0,
    reason:    proposal?.reason ?? entry.blockedReason ?? "—",
    txHash:    entry.txHash ?? null,
    explorerUrl: entry.txHash ? `https://bscscan.com/tx/${entry.txHash}` : null,
  };
}

// Build a Swap from a live AuditEntry (for LatestSwapCard / LatestAutonomousSwapCard).
// Returns null when there is no txHash (BLOCKED/SKIPPED entries don't constitute a swap).
function auditToSwap(entry: AuditEntry): Swap | null {
  if (!entry.txHash || !entry.proposal) return null;
  const p = entry.proposal;
  return {
    id: entry.cycleId,
    timestamp: entry.cycleId,
    fromAsset: p.fromAsset,
    toAsset: p.toAsset,
    amountIn: p.amountIn,
    amountOut: 0,        // not recorded in audit log
    valueUsd: p.estimatedValueUsd,
    priceImpactPct: 0,   // not recorded in audit log
    slippagePct: 0,      // not recorded in audit log
    reason: p.reason,
    txHash: entry.txHash,
    explorerUrl: `https://bscscan.com/tx/${entry.txHash}`,
  };
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Simulation / live data notice banner
function SimBanner({ hasLiveAudit, portfolioSource }: {
  hasLiveAudit: boolean;
  portfolioSource: string | null;
}) {
  const liveItems: string[] = [];
  const simItems: string[] = [];

  if (hasLiveAudit) liveItems.push("swap / decision log (audit.jsonl)");
  else simItems.push("swap history (no live cycles yet)");

  if (portfolioSource === "twak") liveItems.push("portfolio balance (TWAK on-chain)");
  else if (portfolioSource === "snapshot") liveItems.push("portfolio balance (runner snapshot)");
  else if (portfolioSource === "env" || portfolioSource === "env-via-api") simItems.push("portfolio values (env vars)");
  else simItems.push("portfolio values and holdings");

  simItems.push("portfolio value chart (no historical data)");

  return (
    <div
      className="span-4"
      style={{
        fontSize: "11px",
        color: "var(--amber)",
        background: "var(--amber)08",
        border: "1px solid var(--amber)25",
        borderRadius: "6px",
        padding: "8px 14px",
        lineHeight: "1.5",
      }}
    >
      {simItems.length > 0 && (
        <span>
          <strong>SIMULATION</strong> — {simItems.join("; ")}.{" "}
        </span>
      )}
      {liveItems.length > 0 && (
        <span>
          <strong>LIVE</strong> — {liveItems.join("; ")}.{" "}
        </span>
      )}
      Real data always: <strong>Agent Wallet Proof</strong>, <strong>Scheduler Status</strong>,{" "}
      <strong>Risk-Gated Preview</strong> (when scheduler has run).
      Market signals use live CMC data when{" "}
      <code style={{ fontFamily: "monospace" }}>CMC_PRO_API_KEY</code> is set.
    </div>
  );
}

export default function DashboardPage() {
  const [paused, setPaused] = useState(false);
  const [agentData, setAgentData] = useState<AgentStateResponse | null>(null);
  const [portfolioData, setPortfolioData] = useState<PortfolioApiResponse | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const todayKey = getTodayKey();

  const fetchAll = useCallback(async () => {
    setLoadingState(true);
    try {
      const [stateRes, portfolioRes] = await Promise.all([
        fetch("/api/agent-state"),
        fetch("/api/portfolio"),
      ]);
      if (stateRes.ok) setAgentData((await stateRes.json()) as AgentStateResponse);
      if (portfolioRes.ok) setPortfolioData((await portfolioRes.json()) as PortfolioApiResponse);
    } catch {
      // API unavailable — keep previous data
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // ── Portfolio value: from /api/portfolio snapshot (never fake numbers) ──────
  const snapshot = portfolioData?.snapshot ?? null;
  const freshness = portfolioData?.freshness ?? "UNAVAILABLE";
  const portfolioSource = portfolioData?.source ?? null;
  const isSimulation = portfolioSource === "env";

  const portfolioValueData: PortfolioValue | null = snapshot
    ? {
        currentUsd: snapshot.portfolioUsd,
        change24hUsd: 0,  // not available from snapshot
        change24hPct: 0,  // not available from snapshot
        series: [],
      }
    : null;

  const exposureData: Exposure | null = snapshot
    ? {
        volatilePct: snapshot.allocation.volatilePct,
        stablePct: snapshot.allocation.stablePct,
        gasPct: snapshot.allocation.gasPct,
      }
    : null;

  // ── Latest swap: from audit.jsonl only — never from mockAgentState ─────────
  const latestSwapData: Swap | null = agentData?.lastAuditEntry
    ? auditToSwap(agentData.lastAuditEntry)
    : null;

  // ── Swap log: real audit entries only; empty array when no live cycles ──────
  const liveSwapLog: SwapLogRow[] = agentData
    ? agentData.recentLiveAudit.map(auditToSwapRow)
    : mockAgentState.swapLog;

  const hasLiveAudit  = (agentData?.liveCycles ?? 0) > 0;
  const riskOffActive = agentData?.state?.riskOffOverride?.active === true;

  // Base state — HWM overlaid with real value when available
  const state = {
    ...mockAgentState,
    status: paused ? ("Paused" as const) : ("Running" as const),
    drawdown: {
      ...mockAgentState.drawdown,
      highWaterMarkUsd:
        agentData?.state?.highWaterMarkUsd && agentData.state.highWaterMarkUsd > 0
          ? agentData.state.highWaterMarkUsd
          : snapshot?.hwm && snapshot.hwm > 0
          ? snapshot.hwm
          : mockAgentState.drawdown.highWaterMarkUsd,
      currentPct: snapshot?.currentDrawdownPct ?? mockAgentState.drawdown.currentPct,
    },
  };

  const lastQualifyingTxHash = agentData?.lastAuditEntry?.txHash ?? null;

  return (
    <AppShell>
      {/* 1 — Top trading bar */}
      <TopTradingBar
        status={state.status}
        mode={state.mode}
        walletAddress={state.walletAddress}
        lastUpdated={state.lastUpdated}
        paused={paused}
        onPause={() => setPaused(true)}
        onResume={() => setPaused(false)}
        onRefresh={() => void fetchAll()}
      />

      {/* 2 — Trading summary row */}
      <TradingSummaryRow state={state} />

      {/* 3 — Main trading grid */}
      <div className="dashboard-grid">
        {/* Simulation / live data notice */}
        <SimBanner hasLiveAudit={hasLiveAudit} portfolioSource={portfolioSource} />

        {/* Row A: Portfolio Value (2-wide), PnL, Exposure */}
        <div className="span-2">
          <PortfolioValueCard
            data={portfolioValueData}
            freshness={freshness}
            isSimulation={isSimulation}
          />
        </div>
        <PnLCard data={state.pnl} />
        <ExposureCard
          data={exposureData}
          freshness={freshness}
          isSimulation={isSimulation}
        />

        {/* Row B: Latest Swap (2-wide), Drawdown Summary, Market Signals */}
        <div className="span-2">
          <LatestSwapCard data={latestSwapData} />
        </div>
        <DrawdownSummaryCard data={state.drawdown} />
        <MarketSignalsCard data={state.marketSignals} />

        {/* Row C: Allocation donut, Spot Holdings (2-wide), Risk Score */}
        <PortfolioAllocationCard data={state.allocation} />
        <div className="span-2">
          <SpotHoldingsTable data={state.holdings} />
        </div>
        <RiskScoreBreakdownCard data={state.riskScore} />

        {/* Row D: Drawdown chart (2-wide), Latest Autonomous Swap (2-wide) */}
        <div className="span-2">
          <DrawdownGuardrailChart data={state.drawdown} />
        </div>
        <div className="span-2">
          <LatestAutonomousSwapCard data={latestSwapData} />
        </div>

        {/* Row E: Proof Trail (2-wide), x402 Confirmation, System Health */}
        <div className="span-2">
          <ProofTrailCard data={state.proofTrail} />
        </div>
        <X402ConfirmationCard data={state.x402} />
        <SystemHealthCard data={state.systemHealth} />

        {/* Row F: Agent Wallet Proof (2-wide) + Scheduler Status (2-wide) */}
        <div className="span-2">
          <AgentWalletProofCard lastQualifyingTxHash={lastQualifyingTxHash} />
        </div>
        <div className="span-2">
          <SchedulerStatusCard
            state={agentData?.state ?? null}
            todayKey={todayKey}
            isLoading={loadingState}
          />
        </div>
      </div>

      {/* 4 — Bottom: Swap / Decision Log + Risk-Gated Agent Controls */}
      <div className="dashboard-bottom">
        <SwapDecisionLogTable data={liveSwapLog} />
        <AgentControls
          status={state.status}
          riskOffActive={riskOffActive}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
          onRefresh={() => void fetchAll()}
        />
      </div>
    </AppShell>
  );
}
