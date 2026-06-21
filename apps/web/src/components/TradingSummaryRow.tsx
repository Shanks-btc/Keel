import type { Exposure, Swap } from "@keel/shared";
import { fmtUsd } from "../lib/format";

interface Props {
  portfolioUsd: number | null;
  exposureData: Exposure | null;
  latestSwap: Swap | null;
  drawdownPct: number | null;
  limitPct: number;
  killSwitchPct: number;
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

export function TradingSummaryRow({
  portfolioUsd,
  exposureData,
  latestSwap,
  drawdownPct,
  limitPct,
  killSwitchPct,
}: Props) {
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
        value={portfolioUsd !== null ? fmtUsd(portfolioUsd) : "—"}
        sub={portfolioUsd !== null ? "live snapshot" : "awaiting snapshot"}
        mono
      />
      <SummaryItem
        label="24h PnL"
        value="—"
        sub="not available"
        mono
      />
      <SummaryItem
        label="Volatile Exposure"
        value={exposureData ? `${exposureData.volatilePct.toFixed(1)}%` : "—"}
        sub={
          exposureData
            ? `${exposureData.stablePct.toFixed(1)}% stable · ${exposureData.gasPct.toFixed(1)}% gas`
            : "awaiting snapshot"
        }
        mono
      />
      <SummaryItem
        label="Latest Swap"
        value={latestSwap ? `${latestSwap.fromAsset} → ${latestSwap.toAsset}` : "—"}
        sub={latestSwap ? fmtUsd(latestSwap.valueUsd) : "no live trades yet"}
        mono
      />
      <SummaryItem
        label="Current Drawdown"
        value={drawdownPct !== null ? `${drawdownPct.toFixed(1)}%` : "—"}
        sub={`Limit ${limitPct}% · Kill-switch ${killSwitchPct}%`}
        subColor={
          drawdownPct !== null && drawdownPct < killSwitchPct
            ? "var(--red)"
            : drawdownPct !== null && drawdownPct < limitPct
            ? "var(--amber)"
            : "var(--text-muted)"
        }
        mono
      />
    </div>
  );
}
