import type { PnL } from "@keel/shared";
import { fmtUsd, fmtPct, pctColor } from "../lib/format";
import { Card, CardHeader } from "./ui/Card";

export function PnLCard({ data }: { data: PnL }) {
  return (
    <Card>
      <CardHeader title="24h PnL" />
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          fontFamily: "monospace",
          color: pctColor(data.totalUsd),
          marginBottom: "4px",
        }}
      >
        {fmtUsd(data.totalUsd)}
      </div>
      <div
        style={{
          fontSize: "13px",
          color: pctColor(data.change24hPct),
          fontFamily: "monospace",
          marginBottom: "16px",
        }}
      >
        {fmtPct(data.change24hPct)} 24h
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "12px",
          borderTop: "1px solid var(--border)",
          paddingTop: "12px",
        }}
      >
        {[
          { label: "Realized", value: data.realizedUsd },
          { label: "Unrealized", value: data.unrealizedUsd },
        ].map(({ label, value }) => (
          <div key={label}>
            <div
              style={{
                fontSize: "10px",
                color: "var(--text-muted)",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                marginBottom: "4px",
              }}
            >
              {label}
            </div>
            <div
              style={{
                fontSize: "15px",
                fontWeight: 600,
                fontFamily: "monospace",
                color: pctColor(value),
              }}
            >
              {fmtUsd(value)}
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}
