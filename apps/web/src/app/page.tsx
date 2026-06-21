"use client";

import { useState, useEffect, useCallback } from "react";
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
  SpotHolding,
  AllocationSlice,
  AssetSymbol,
  AssetRole,
  MarketSignals,
  RiskScore,
  DrawdownState,
  HealthItem,
  ProofEntry,
  X402Confirmation,
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

// ── Constants ─────────────────────────────────────────────────────────────────

const WALLET_ADDRESS = "0x66af72374Eb358cf939bc1954b8F62EfcF08E10a";
const DRAW_LIMIT_PCT  = -12;
const DRAW_KILL_PCT   = -18;

const STABLES = new Set(["USDT", "USDC", "USD1", "FDUSD"]);

const ASSET_ROLES: Record<string, AssetRole> = {
  ETH: "Volatile", CAKE: "Volatile", LINK: "Volatile",
  USDT: "Stable",  USDC: "Stable",  USD1: "Stable",  FDUSD: "Stable",
  BNB: "Gas",
};

const ASSET_COLORS: Record<string, string> = {
  ETH:   "#627EEA",
  CAKE:  "#D1884F",
  LINK:  "#2A5ADA",
  USDT:  "#26A17B",
  USDC:  "#2775CA",
  USD1:  "#1DA462",
  FDUSD: "#1A5F9E",
  BNB:   "#F0B90B",
};

// Fixed proof trail entries — always real, never fabricated.
const FIXED_PROOF_ENTRIES: ProofEntry[] = [
  {
    id: "pt-identity",
    type: "AgentIdentity",
    label: "Agent Identity — Registered",
    timestamp: "2026-06-01T12:00:00.000Z",
    txHash:
      "0x006151e42ceb1b151ddcd7b172b9dd2087cbabbe7fbe3a58c63274c3fa6ac305",
    explorerUrl:
      "https://bscscan.com/tx/0x006151e42ceb1b151ddcd7b172b9dd2087cbabbe7fbe3a58c63274c3fa6ac305",
    verified: true,
    detail: "0x66af72374Eb358cf939bc1954b8F62EfcF08E10a registered on BSC",
  },
  {
    id: "pt-first-swap",
    type: "SwapExecution",
    label: "First qualifying BSC swap",
    timestamp: "2026-06-19T08:00:00.000Z",
    txHash:
      "0x99ef6856cd679a65a7d7877b97bd5a4f525b98b0b61a2589481f2a108e6d9854",
    explorerUrl:
      "https://bscscan.com/tx/0x99ef6856cd679a65a7d7877b97bd5a4f525b98b0b61a2589481f2a108e6d9854",
    verified: true,
    detail: "minimum-risk qualifying attempt · BSC only · not Base/x402",
  },
];

// ── Helpers ───────────────────────────────────────────────────────────────────

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

function auditToSwap(entry: AuditEntry): Swap | null {
  if (!entry.txHash || !entry.proposal) return null;
  const p = entry.proposal;
  return {
    id: entry.cycleId,
    timestamp: entry.cycleId,
    fromAsset: p.fromAsset,
    toAsset: p.toAsset,
    amountIn: p.amountIn,
    amountOut: entry.amountOut ?? 0,
    valueUsd: p.estimatedValueUsd,
    priceImpactPct: entry.priceImpactPct ?? 0,
    slippagePct: entry.slippagePct ?? 0,
    reason: p.reason,
    txHash: entry.txHash,
    explorerUrl: `https://bscscan.com/tx/${entry.txHash}`,
  };
}

function getTodayKey(): string {
  return new Date().toISOString().slice(0, 10);
}

function fgLabel(fg: number): string {
  if (fg <= 25) return "Extreme Fear";
  if (fg <= 45) return "Fear";
  if (fg <= 55) return "Neutral";
  if (fg <= 75) return "Greed";
  return "Extreme Greed";
}

function buildHealthItems(
  agentData: AgentStateResponse | null,
  portfolioData: PortfolioApiResponse | null,
): HealthItem[] {
  const items: HealthItem[] = [];

  if (agentData?.lastAuditEntry) {
    const ageMins = Math.round(
      (Date.now() - new Date(agentData.lastAuditEntry.cycleId).getTime()) / 60_000,
    );
    items.push({ label: "Market Data (CMC)", status: "ok", detail: `Last cycle ${ageMins}m ago` });
  } else {
    items.push({ label: "Market Data (CMC)", status: "not_yet_verified", detail: "No live cycles yet" });
  }

  const liveCount = agentData?.liveCycles ?? 0;
  items.push({
    label: "Execution Engine (TWAK)",
    status: liveCount > 0 ? "ok" : "not_yet_verified",
    detail:
      liveCount > 0
        ? `${liveCount} live trade${liveCount === 1 ? "" : "s"}`
        : "No live trades yet",
  });

  const freshness = portfolioData?.freshness ?? "UNAVAILABLE";
  items.push({
    label: "Network (BSC)",
    status: freshness !== "UNAVAILABLE" ? "ok" : "not_yet_verified",
    detail:
      freshness !== "UNAVAILABLE"
        ? `chainId 56 · ${freshness}`
        : "chainId 56 · not yet verified",
  });

  const src = portfolioData?.source ?? null;
  items.push({
    label: "Wallet",
    status: src === "twak" || src === "twak-cache" || src === "snapshot" ? "ok" : "not_yet_verified",
    detail:
      src === "twak" || src === "twak-cache"
        ? "Balance confirmed on-chain"
        : src === "snapshot"
        ? "Runner snapshot available"
        : src === "env"
        ? "Env vars only"
        : "Balance not yet verified",
  });

  items.push({ label: "x402 Service", status: "not_yet_verified", detail: "Not yet exercised" });

  return items;
}

// ── LiveStateBanner ───────────────────────────────────────────────────────────

function LiveStateBanner({
  hasLiveAudit,
  portfolioSource,
}: {
  hasLiveAudit: boolean;
  portfolioSource: string | null;
}) {
  const hasRealPortfolio =
    portfolioSource === "twak" ||
    portfolioSource === "twak-cache" ||
    portfolioSource === "snapshot";

  if (hasRealPortfolio && hasLiveAudit) return null;

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
      <strong>LIVE STATE PENDING</strong> — No completed live runner cycle has persisted portfolio
      or trade data yet. Real portfolio, holdings, drawdown, and audit entries will appear after
      the first successful non-dry-run cycle.
    </div>
  );
}

// ── Page ──────────────────────────────────────────────────────────────────────

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

  // ── Portfolio snapshot ───────────────────────────────────────────────────────
  const snapshot = portfolioData?.snapshot ?? null;
  const freshness = portfolioData?.freshness ?? "UNAVAILABLE";
  const portfolioSource = portfolioData?.source ?? null;
  const isSimulation = portfolioSource === "env";

  // ── Portfolio value ──────────────────────────────────────────────────────────
  const portfolioValueData: PortfolioValue | null = snapshot
    ? {
        currentUsd: snapshot.portfolioUsd,
        change24hUsd: 0,
        change24hPct: 0,
        series: [],
      }
    : null;

  // ── Exposure ─────────────────────────────────────────────────────────────────
  const exposureData: Exposure | null = snapshot
    ? {
        volatilePct: snapshot.allocation.volatilePct,
        stablePct: snapshot.allocation.stablePct,
        gasPct: snapshot.allocation.gasPct,
      }
    : null;

  // ── Latest swap (from audit.jsonl only) ──────────────────────────────────────
  const latestSwapData: Swap | null = agentData?.lastAuditEntry
    ? auditToSwap(agentData.lastAuditEntry)
    : null;

  // ── Swap log (real audit entries only — empty when no live cycles) ────────────
  const liveSwapLog: SwapLogRow[] = agentData
    ? agentData.recentLiveAudit.map(auditToSwapRow)
    : [];

  // ── Spot holdings (from token balances — no 24h change available) ─────────────
  const holdingsData: SpotHolding[] = snapshot
    ? Object.entries(snapshot.tokenBalances)
        .filter((entry): entry is [string, { balance: number; valueUsd: number }] =>
          entry[1] !== undefined,
        )
        .map(([asset, d]) => ({
          asset: asset as AssetSymbol,
          role: (ASSET_ROLES[asset] ?? "Volatile") as AssetRole,
          balance: d.balance,
          valueUsd: d.valueUsd,
          allocationPct:
            snapshot.portfolioUsd > 0 ? (d.valueUsd / snapshot.portfolioUsd) * 100 : 0,
          change24hPct: null,
        }))
        .sort((a, b) => b.valueUsd - a.valueUsd)
    : [];

  // ── Allocation slices (from token balances) ───────────────────────────────────
  const allocationData: AllocationSlice[] | null =
    snapshot && snapshot.portfolioUsd > 0 && Object.keys(snapshot.tokenBalances).length > 0
      ? Object.entries(snapshot.tokenBalances)
          .filter(
            (entry): entry is [string, { balance: number; valueUsd: number }] =>
              entry[1] !== undefined && entry[1].valueUsd > 0,
          )
          .map(([asset, d]) => ({
            asset: asset as AssetSymbol,
            role: (ASSET_ROLES[asset] ?? "Volatile") as AssetRole,
            pct: (d.valueUsd / snapshot.portfolioUsd) * 100,
            valueUsd: d.valueUsd,
            color: ASSET_COLORS[asset] ?? "#888",
          }))
          .sort((a, b) => b.pct - a.pct)
      : null;

  // ── Market signals (derived from last audit cycle) ────────────────────────────
  const marketSignalsData: MarketSignals | null = agentData?.lastAuditEntry
    ? (() => {
        const entry = agentData.lastAuditEntry!;
        const c = entry.riskScore.components;
        const fg = c[2]?.value ?? 50;
        return {
          fearGreed: fg,
          fearGreedLabel: fgLabel(fg),
          change1hPct: c[0]?.value ?? 0,
          change24hPct: c[1]?.value ?? 0,
          trend:
            entry.mode === "Risk-on"
              ? ("Bullish" as const)
              : entry.mode === "Risk-off"
              ? ("Bearish" as const)
              : ("Neutral" as const),
          assetPrice: entry.assetPriceUsd ?? 0,
          assetSymbol: "ETH" as const,
        };
      })()
    : null;

  // ── Risk score ────────────────────────────────────────────────────────────────
  const riskScoreData: RiskScore | null =
    agentData?.lastAuditEntry?.riskScore ?? null;

  // ── Drawdown (HWM from persistent state > snapshot; series always empty) ───────
  const hwm =
    agentData?.state?.highWaterMarkUsd && agentData.state.highWaterMarkUsd > 0
      ? agentData.state.highWaterMarkUsd
      : snapshot?.hwm && snapshot.hwm > 0
      ? snapshot.hwm
      : 0;

  const drawdownData: DrawdownState | null =
    snapshot !== null || hwm > 0
      ? {
          currentPct: snapshot?.currentDrawdownPct ?? 0,
          limitPct: DRAW_LIMIT_PCT,
          killSwitchPct: DRAW_KILL_PCT,
          highWaterMarkUsd: hwm,
          series: [],
        }
      : null;

  // ── Proof trail (fixed real entries only) ─────────────────────────────────────
  const proofTrailData: ProofEntry[] = FIXED_PROOF_ENTRIES;

  // ── System health ─────────────────────────────────────────────────────────────
  const systemHealthData: HealthItem[] = buildHealthItems(agentData, portfolioData);

  // ── x402 ──────────────────────────────────────────────────────────────────────
  const x402Data: X402Confirmation = {
    totalConfirmed: 0,
    lastConfirmedAt: null,
    lastAmountUsdc: null,
    settlementChain: "Base",
  };

  // ── Agent status ──────────────────────────────────────────────────────────────
  const agentStatus = paused ? ("Paused" as const) : ("Running" as const);
  const agentMode: RiskMode = agentData?.lastAuditEntry?.mode ?? "Neutral";
  const lastUpdated = agentData?.state?.lastUpdated ?? "";
  const riskOffActive = agentData?.state?.riskOffOverride?.active === true;
  const hasLiveAudit = (agentData?.liveCycles ?? 0) > 0;
  const lastQualifyingTxHash = agentData?.lastAuditEntry?.txHash ?? null;

  return (
    <AppShell>
      {/* 1 — Top trading bar */}
      <TopTradingBar
        status={agentStatus}
        mode={agentMode}
        walletAddress={WALLET_ADDRESS}
        lastUpdated={lastUpdated}
        paused={paused}
        onPause={() => setPaused(true)}
        onResume={() => setPaused(false)}
        onRefresh={() => void fetchAll()}
      />

      {/* 2 — Trading summary row */}
      <TradingSummaryRow
        portfolioUsd={snapshot?.portfolioUsd ?? null}
        portfolioSource={portfolioSource}
        exposureData={exposureData}
        latestSwap={latestSwapData}
        drawdownPct={snapshot?.currentDrawdownPct ?? null}
        limitPct={DRAW_LIMIT_PCT}
        killSwitchPct={DRAW_KILL_PCT}
      />

      {/* 3 — Main trading grid */}
      <div className="dashboard-grid">
        {/* Live state pending notice */}
        <LiveStateBanner hasLiveAudit={hasLiveAudit} portfolioSource={portfolioSource} />

        {/* Row A: Portfolio Value (2-wide), PnL, Exposure */}
        <div className="span-2">
          <PortfolioValueCard
            data={portfolioValueData}
            freshness={freshness}
            isSimulation={isSimulation}
          />
        </div>
        <PnLCard data={null} />
        <ExposureCard
          data={exposureData}
          freshness={freshness}
          isSimulation={isSimulation}
        />

        {/* Row B: Latest Swap (2-wide), Drawdown Summary, Market Signals */}
        <div className="span-2">
          <LatestSwapCard data={latestSwapData} />
        </div>
        <DrawdownSummaryCard data={drawdownData} />
        <MarketSignalsCard data={marketSignalsData} />

        {/* Row C: Allocation donut, Spot Holdings (2-wide), Risk Score */}
        <PortfolioAllocationCard data={allocationData} />
        <div className="span-2">
          <SpotHoldingsTable data={holdingsData} />
        </div>
        <RiskScoreBreakdownCard data={riskScoreData} />

        {/* Row D: Drawdown chart (2-wide), Latest Autonomous Swap (2-wide) */}
        <div className="span-2">
          <DrawdownGuardrailChart data={drawdownData} />
        </div>
        <div className="span-2">
          <LatestAutonomousSwapCard data={latestSwapData} />
        </div>

        {/* Row E: Proof Trail (2-wide), x402 Confirmation, System Health */}
        <div className="span-2">
          <ProofTrailCard data={proofTrailData} />
        </div>
        <X402ConfirmationCard data={x402Data} />
        <SystemHealthCard data={systemHealthData} />

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
          status={agentStatus}
          riskOffActive={riskOffActive}
          onPause={() => setPaused(true)}
          onResume={() => setPaused(false)}
          onRefresh={() => void fetchAll()}
        />
      </div>
    </AppShell>
  );
}
