"use client";

import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  ReferenceLine,
} from "recharts";
import type { DrawdownState } from "@keel/shared";
import { fmtTime } from "../lib/format";
import { Card, CardHeader } from "./ui/Card";

export function DrawdownGuardrailChart({ data }: { data: DrawdownState }) {
  const minY = Math.min(data.killSwitchPct - 2, ...data.series.map((d) => d.drawdownPct));

  return (
    <Card>
      <CardHeader
        title="Drawdown Guardrail"
        subtitle={`HWM-relative · Kill-switch ${data.killSwitchPct}%`}
      />
      <div style={{ height: "160px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart
            data={data.series}
            margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
          >
            <defs>
              <linearGradient id="ddGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--red)" stopOpacity={0.25} />
                <stop offset="95%" stopColor="var(--red)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <XAxis
              dataKey="timestamp"
              hide
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              domain={[minY, 2]}
              tickLine={false}
              axisLine={false}
              tick={{ fontSize: 10, fill: "var(--text-muted)" }}
              tickFormatter={(v: number) => `${v}%`}
              width={38}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
              formatter={(v: number) => [`${v.toFixed(2)}%`, "Drawdown"]}
              labelFormatter={(l: string) => fmtTime(l)}
            />
            <ReferenceLine
              y={data.limitPct}
              stroke="var(--amber)"
              strokeDasharray="4 3"
              label={{ value: "Limit", position: "right", fontSize: 10, fill: "var(--amber)" }}
            />
            <ReferenceLine
              y={data.killSwitchPct}
              stroke="var(--red)"
              strokeDasharray="4 3"
              label={{ value: "Kill-switch", position: "right", fontSize: 10, fill: "var(--red)" }}
            />
            <Area
              type="monotone"
              dataKey="drawdownPct"
              stroke="var(--red)"
              strokeWidth={1.5}
              fill="url(#ddGrad)"
              dot={false}
              isAnimationActive={false}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
