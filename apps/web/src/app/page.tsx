"use client";

import { useState } from "react";
import { mockAgentState } from "../lib/mock";
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

export default function DashboardPage() {
  const [paused, setPaused] = useState(false);

  const state = {
    ...mockAgentState,
    status: paused ? ("Paused" as const) : ("Running" as const),
  };

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
        onRefresh={() => {}}
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
      </div>

      {/* 4 — Bottom: Swap / Decision Log + Agent Controls */}
      <div
        style={{
          padding: "0 24px 40px",
          display: "grid",
          gridTemplateColumns: "1fr 320px",
          gap: "12px",
        }}
      >
        <SwapDecisionLogTable data={state.swapLog} />
        <AgentControls
          status={state.status}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
          onRefresh={() => {}}
        />
      </div>
    </AppShell>
  );
}
