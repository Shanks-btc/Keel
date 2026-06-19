// §3/§5 — Daily qualification scheduler status card.
// Shows today's attempt status from the persisted day ledger (real data when available).
// Uses §0a honesty wording throughout.

"use client";

import type { DayAttemptEntry, AgentPersistentState } from "@keel/shared";
import { Card, CardHeader } from "./ui/Card";
import { fmtUsd, fmtDateTime } from "../lib/format";

interface Props {
  state: Pick<AgentPersistentState, "highWaterMarkUsd" | "dayLedger"> | null;
  todayKey: string;
  isLoading: boolean;
}

function StatusBadge({ status }: { status: DayAttemptEntry["status"] | null }) {
  const colorMap: Record<string, string> = {
    EXECUTED: "var(--green)",
    BLOCKED:  "var(--red)",
    SKIPPED:  "var(--amber)",
  };
  const color = status ? (colorMap[status] ?? "var(--text-muted)") : "var(--text-muted)";
  return (
    <span
      style={{
        fontSize: "10px",
        fontWeight: 700,
        color,
        background: `${color}18`,
        border: `1px solid ${color}40`,
        borderRadius: "3px",
        padding: "2px 6px",
        letterSpacing: "0.06em",
      }}
    >
      {status ?? "NOT RUN"}
    </span>
  );
}

export function SchedulerStatusCard({ state, todayKey, isLoading }: Props) {
  const todayEntry = state?.dayLedger[todayKey] ?? null;
  const hwm = state?.highWaterMarkUsd ?? 0;

  return (
    <Card>
      <CardHeader
        title="Daily Qualification Scheduler"
        subtitle="minimum-risk qualifying attempt · once per calendar day"
      />

      {isLoading ? (
        <div style={{ fontSize: "12px", color: "var(--text-muted)", padding: "8px 0" }}>
          Loading…
        </div>
      ) : (
        <>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: "12px",
              marginBottom: "14px",
            }}
          >
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Today ({todayKey})
              </div>
              <StatusBadge status={todayEntry?.status ?? null} />
            </div>
            <div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                High-water mark
              </div>
              <span
                style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}
              >
                {hwm > 0 ? fmtUsd(hwm) : "—"}
              </span>
            </div>
          </div>

          {todayEntry ? (
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-secondary)",
                lineHeight: "1.6",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              {todayEntry.action && (
                <div>
                  Action:{" "}
                  <strong style={{ color: "var(--text-primary)" }}>{todayEntry.action}</strong>
                </div>
              )}
              {todayEntry.txHash && (
                <div>
                  Tx:{" "}
                  <a
                    href={`https://bscscan.com/tx/${todayEntry.txHash}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      color: "var(--blue)",
                      fontFamily: "monospace",
                      textDecoration: "none",
                    }}
                  >
                    {todayEntry.txHash.slice(0, 12)}… ↗
                  </a>
                </div>
              )}
              {todayEntry.blockedReason && (
                <div style={{ color: "var(--red)" }}>
                  Blocked: {todayEntry.blockedReason}
                </div>
              )}
              <div style={{ color: "var(--text-muted)", marginTop: "2px" }}>
                {fmtDateTime(todayEntry.timestamp)}
              </div>
            </div>
          ) : (
            <div
              style={{
                fontSize: "11px",
                color: "var(--text-muted)",
                paddingBottom: "10px",
                borderBottom: "1px solid var(--border)",
              }}
            >
              No qualifying attempt recorded today. The scheduler runs once per calendar day.
            </div>
          )}

          <div
            style={{
              marginTop: "10px",
              fontSize: "10px",
              color: "var(--text-muted)",
              lineHeight: "1.4",
            }}
          >
            Fallback: drawdown-neutral stable-to-stable swap if the primary rotation
            is unavailable. Not guaranteed unless organizers confirm stable-to-stable counts.
            drawdown-resistant design — kill-switch and all safety gates remain active.
          </div>
        </>
      )}
    </Card>
  );
}
