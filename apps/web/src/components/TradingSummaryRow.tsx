import type { AgentState } from "@keel/shared";
import { fmtUsd, fmtPct, pctColor } from "../lib/format";

interface Props {
  state: AgentState;
}

interface SummaryItemProps {
  label: string;
  value: string;
  sub?: string;
  subColor?: string;
  mono?: boolean;
}

function SummaryItem({ label, value, sub, subColor, mono }: SummaryItemProps) {
  return (
    <div
      style={{
        backgroundColor: "var(--card)",
        border: "1px solid var(--border)",
        borderRadius: "6px",
        padding: "12px 16px",
        flex: 1,
        minWidth: 0,
      }}
    >
      <div
        style={{
          fontSize: "10px",
          fontWeight: 600,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-muted)",
          marginBottom: "6px",
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontSize: "20px",
          fontWeight: 700,
          color: "var(--text-primary)",
          fontFamily: mono ? "monospace" : undefined,
          fontVariantNumeric: mono ? "tabular-nums" : undefined,
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {value}
      </div>
      {sub && (
        <div
          style={{
            fontSize: "12px",
            color: subColor ?? "var(--text-muted)",
            marginTop: "2px",
            fontFamily: "monospace",
          }}
        >
          {sub}
        </div>
      )}
    </div>
  );
}

export function TradingSummaryRow({ state }: Props) {
  const { portfolioValue, pnl, exposure, latestSwap, drawdown } = state;

  return (
    <div
      style={{
        display: "flex",
        gap: "10px",
        padding: "16px 24px",
        overflowX: "auto",
      }}
    >
      <SummaryItem
        label="Portfolio Value"
        value={fmtUsd(portfolioValue.currentUsd)}
        sub={`${fmtPct(portfolioValue.change24hPct)} 24h`}
        subColor={pctColor(portfolioValue.change24hPct)}
        mono
      />
      <SummaryItem
        label="24h PnL"
        value={fmtUsd(pnl.totalUsd)}
        sub={`${fmtUsd(pnl.realizedUsd)} realized · ${fmtUsd(pnl.unrealizedUsd)} unrealized`}
        subColor={pctColor(pnl.totalUsd)}
        mono
      />
      <SummaryItem
        label="Volatile Exposure"
        value={`${exposure.volatilePct}%`}
        sub={`${exposure.stablePct}% stable · ${exposure.gasPct}% gas`}
        mono
      />
      <SummaryItem
        label="Latest Swap"
        value={`${latestSwap.fromAsset} → ${latestSwap.toAsset}`}
        sub={fmtUsd(latestSwap.valueUsd)}
        mono
      />
      <SummaryItem
        label="Current Drawdown"
        value={`${drawdown.currentPct.toFixed(1)}%`}
        sub={`Limit ${drawdown.limitPct}% · Kill-switch ${drawdown.killSwitchPct}%`}
        subColor={
          drawdown.currentPct < drawdown.killSwitchPct
            ? "var(--red)"
            : drawdown.currentPct < drawdown.limitPct
            ? "var(--amber)"
            : "var(--text-muted)"
        }
        mono
      />
    </div>
  );
}
