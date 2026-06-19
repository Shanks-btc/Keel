"use client";

import { useState, useEffect, useCallback } from "react";
import { mockAgentState } from "../lib/mock";
import type { AgentPersistentState, AuditEntry } from "@keel/shared";
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
}

// Today's ISO date key (client timezone)
function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

// Simulation notice banner — shown on cards whose data is not yet live
function SimBanner() {
  return (
    <div
      style={{
        gridColumn: "span 4",
        fontSize: "11px",
        color: "var(--amber)",
        background: "var(--amber)08",
        border: "1px solid var(--amber)25",
        borderRadius: "6px",
        padding: "8px 14px",
        lineHeight: "1.5",
      }}
    >
      <strong>SIMULATION</strong> — portfolio values, holdings balances, swap history, and
      market signals in this dashboard use simulated data (real portfolio query requires TWAK;
      real prices require CMC API on the server). Real data:{" "}
      <strong>Agent Wallet Proof</strong>, <strong>Scheduler Status</strong>, and{" "}
      <strong>Risk-Gated Preview</strong> (when the scheduler has run).
    </div>
  );
}

export default function DashboardPage() {
  const [paused, setPaused] = useState(false);
  const [agentData, setAgentData] = useState<AgentStateResponse | null>(null);
  const [loadingState, setLoadingState] = useState(true);
  const todayKey = getTodayKey();

  const fetchAgentState = useCallback(async () => {
    setLoadingState(true);
    try {
      const res = await fetch("/api/agent-state");
      if (res.ok) {
        setAgentData((await res.json()) as AgentStateResponse);
      }
    } catch {
      // API unavailable — keep mock data
    } finally {
      setLoadingState(false);
    }
  }, []);

  useEffect(() => {
    void fetchAgentState();
  }, [fetchAgentState]);

  // Base state from mock; real status overlaid
  const state = {
    ...mockAgentState,
    status: paused ? ("Paused" as const) : ("Running" as const),
    // Override HWM from real persistence when available
    drawdown: {
      ...mockAgentState.drawdown,
      highWaterMarkUsd:
        agentData?.state?.highWaterMarkUsd && agentData.state.highWaterMarkUsd > 0
          ? agentData.state.highWaterMarkUsd
          : mockAgentState.drawdown.highWaterMarkUsd,
    },
  };

  // Last qualifying tx from audit log
  const lastQualifyingTxHash =
    agentData?.lastAuditEntry?.txHash ?? null;

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
        onRefresh={() => void fetchAgentState()}
      />

      {/* 2 — Trading summary row */}
      <TradingSummaryRow state={state} />

      {/* 3 — Main trading grid */}
      <div
        style={{
          padding: "0 24px 24px",
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gap: "12px",
        }}
      >
        {/* Simulation notice */}
        <SimBanner />

        {/* Row A: Portfolio Value (2-wide), PnL, Exposure */}
        <div style={{ gridColumn: "span 2" }}>
          <PortfolioValueCard data={state.portfolioValue} />
        </div>
        <PnLCard data={state.pnl} />
        <ExposureCard data={state.exposure} />

        {/* Row B: Latest Swap (2-wide), Drawdown Summary, Market Signals */}
        <div style={{ gridColumn: "span 2" }}>
          <LatestSwapCard data={state.latestSwap} />
        </div>
        <DrawdownSummaryCard data={state.drawdown} />
        <MarketSignalsCard data={state.marketSignals} />

        {/* Row C: Allocation donut, Spot Holdings (2-wide), Risk Score */}
        <PortfolioAllocationCard data={state.allocation} />
        <div style={{ gridColumn: "span 2" }}>
          <SpotHoldingsTable data={state.holdings} />
        </div>
        <RiskScoreBreakdownCard data={state.riskScore} />

        {/* Row D: Drawdown chart (2-wide), Latest Autonomous Swap (2-wide) */}
        <div style={{ gridColumn: "span 2" }}>
          <DrawdownGuardrailChart data={state.drawdown} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <LatestAutonomousSwapCard data={state.latestSwap} />
        </div>

        {/* Row E: Proof Trail (2-wide), x402 Confirmation, System Health */}
        <div style={{ gridColumn: "span 2" }}>
          <ProofTrailCard data={state.proofTrail} />
        </div>
        <X402ConfirmationCard data={state.x402} />
        <SystemHealthCard data={state.systemHealth} />

        {/* Row F (§7): Agent Wallet Proof (2-wide) + Scheduler Status (2-wide) */}
        <div style={{ gridColumn: "span 2" }}>
          <AgentWalletProofCard lastQualifyingTxHash={lastQualifyingTxHash} />
        </div>
        <div style={{ gridColumn: "span 2" }}>
          <SchedulerStatusCard
            state={agentData?.state ?? null}
            todayKey={todayKey}
            isLoading={loadingState}
          />
        </div>
      </div>

      {/* 4 — Bottom: Swap / Decision Log + Risk-Gated Agent Controls (§7b) */}
      <div
        style={{
          padding: "0 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 360px",
          gap: "12px",
        }}
      >
        <SwapDecisionLogTable data={state.swapLog} />
        <AgentControls
          status={state.status}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
          onRefresh={() => void fetchAgentState()}
        />
      </div>
    </AppShell>
  );
}
