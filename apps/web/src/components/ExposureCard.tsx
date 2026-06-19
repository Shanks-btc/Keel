import type { Exposure } from "@keel/shared";
import { Card, CardHeader } from "./ui/Card";

export function ExposureCard({ data }: { data: Exposure }) {
  const bars = [
    { label: "Volatile", pct: data.volatilePct, color: "var(--green)" },
    { label: "Stable", pct: data.stablePct, color: "var(--blue)" },
    { label: "Gas (BNB)", pct: data.gasPct, color: "#F0B90B" },
  ];

  return (
    <Card>
      <CardHeader title="Volatile Exposure" />
      <div
        style={{
          fontSize: "28px",
          fontWeight: 700,
          fontFamily: "monospace",
          marginBottom: "16px",
        }}
      >
        {data.volatilePct}%
      </div>

      {/* Stacked bar */}
      <div
        style={{
          height: "8px",
          borderRadius: "4px",
          overflow: "hidden",
          display: "flex",
          marginBottom: "12px",
        }}
      >
        {bars.map(({ label, pct, color }) => (
          <div
            key={label}
            style={{ width: `${pct}%`, backgroundColor: color }}
            title={`${label}: ${pct}%`}
          />
        ))}
      </div>

      {/* Legend */}
      <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
        {bars.map(({ label, pct, color }) => (
          <div
            key={label}
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <span
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "2px",
                  backgroundColor: color,
                  display: "inline-block",
                }}
              />
              <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                {label}
              </span>
            </div>
            <span
              style={{
                fontSize: "13px",
                fontWeight: 600,
                fontFamily: "monospace",
                color: "var(--text-primary)",
              }}
            >
              {pct}%
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
