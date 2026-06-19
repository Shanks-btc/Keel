"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { AllocationSlice } from "@keel/shared";
import { fmtUsd } from "../lib/format";
import { Card, CardHeader } from "./ui/Card";

export function PortfolioAllocationCard({ data }: { data: AllocationSlice[] }) {
  return (
    <Card>
      <CardHeader title="Portfolio Allocation" />
      <div style={{ height: "240px" }}>
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              cx="45%"
              cy="50%"
              innerRadius={60}
              outerRadius={90}
              paddingAngle={2}
              dataKey="pct"
              nameKey="asset"
              isAnimationActive={false}
            >
              {data.map((slice) => (
                <Cell key={slice.asset} fill={slice.color} stroke="var(--card)" strokeWidth={2} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                backgroundColor: "var(--card-elevated)",
                border: "1px solid var(--border)",
                borderRadius: "6px",
                fontSize: "12px",
                color: "var(--text-primary)",
              }}
              formatter={(value: number, name: string) => {
                const slice = data.find((s) => s.asset === name);
                return [`${value.toFixed(1)}% · ${fmtUsd(slice?.valueUsd ?? 0)}`, name];
              }}
            />
            <Legend
              iconType="circle"
              iconSize={8}
              formatter={(value) => (
                <span style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
                  {value}
                </span>
              )}
            />
          </PieChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}
