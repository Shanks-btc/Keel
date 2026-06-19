"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  Tooltip,
  XAxis,
} from "recharts";
import type { PortfolioValue } from "@keel/shared";
import { fmtUsd, fmtPct, fmtTime, pctColor } from "../lib/format";
import { Card, CardHeader } from "./ui/Card";

interface Props {
  data: PortfolioValue;
}

export function PortfolioValueCard({ data }: Props) {
  const positive = data.change24hPct >= 0;
  const lineColor = positive ? "var(--green)" : "var(--red)";

  return (
    <Card>
      <CardHeader title="Portfolio Value" />
      <div style={{ marginBottom: "4px" }}>
        <span
          style={{
            fontSize: "28px",
            fontWeight: 700,
            fontFamily: "monospace",
            fontVariantNumeric: "tabular-nums",
          }}
        >
          {fmtUsd(data.currentUsd)}
        </span>
      </div>
      <div
        style={{
          fontSize: "13px",
          color: pctColor(data.change24hPct),
          fontFamily: "monospace",
          marginBottom: "16px",
        }}
      >
        {fmtPct(data.change24hPct)} · {fmtUsd(data.change24hUsd)} today
      </div>
      <div style={{ height: "80px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data.series}
            margin={{ top: 2, right: 0, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="portfolioGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={lineColor} stopOpacity={0.25} />
                <stop offset="95%" stopColor={lineColor} stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis dataKey="timestamp" hide />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
              formatter={(v: number) => [fmtUsd(v), "Value"]}
              labelFormatter={(l: string) => fmtTime(l)}
            />
            <Area
              type="monotone"
              dataKey="valueUsd"
              stroke={lineColor}
              strokeWidth={1.5}
              fill="url(#portfolioGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
