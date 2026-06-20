// §3/§5 — Daily qualification scheduler status card.
// Shows today's attempt status from the persisted day ledger (real data when available).
// Uses §0a honesty wording throughout.

"use client";

import type { DayAttemptEntry, AgentPersistentState } from "@keel/shared";
import { Card, CardHeader } from "./ui/Card";
import { fmtUsd, fmtDateTime } from "../lib/format";

interface Props {
  state: Pick<AgentPersistentState, "highWaterMarkUsd" | "dayLedger" | "lastQualifyingTradeAt"> | null;
  todayKey: string;
  isLoading: boolean;
}

type DeadlineStatus = "QUALIFIED" | "DUE_SOON" | "OVERDUE" | "BLOCKED" | "UNKNOWN";

const DEADLINE_COLORS: Record<string, string> = {
  QUALIFIED: "var(--green)",
  DUE_SOON:  "var(--amber)",
  OVERDUE:   "var(--red)",
  BLOCKED:   "var(--red)",
};

function DeadlineBadge({
  status,
  nextDeadlineLabel,
}: {
  status: DeadlineStatus;
  nextDeadlineLabel: string | null;
}) {
  const color = DEADLINE_COLORS[status] ?? "var(--text-muted)";
  const label =
    status === "DUE_SOON" && nextDeadlineLabel
      ? `DUE_SOON — by ${nextDeadlineLabel}`
      : status;
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
      {label}
    </span>
  );
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

  // Compute rolling 24h deadline status — warning-only, no gate.
  const lastQualAt = state?.lastQualifyingTradeAt ?? null;
  let deadlineStatus: DeadlineStatus = "UNKNOWN";
  let nextDeadlineLabel: string | null = null;

  if (lastQualAt) {
    const lastMs     = new Date(lastQualAt).getTime();
    const deadlineMs = lastMs + 24 * 60 * 60 * 1000;
    const warnMs     = lastMs + 20 * 60 * 60 * 1000;
    const nowMs      = Date.now();
    nextDeadlineLabel = new Date(deadlineMs).toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });
    if      (nowMs >= deadlineMs) deadlineStatus = "OVERDUE";
    else if (nowMs >= warnMs)     deadlineStatus = "DUE_SOON";
    else                          deadlineStatus = "QUALIFIED";
  } else if (todayEntry?.status === "BLOCKED") {
    deadlineStatus = "BLOCKED";
  }

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

          {/* Rolling 24h safety check */}
          {deadlineStatus !== "UNKNOWN" && (
            <div style={{ marginBottom: "14px" }}>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>
                rolling 24-hour safety check
              </div>
              <DeadlineBadge status={deadlineStatus} nextDeadlineLabel={nextDeadlineLabel} />
            </div>
          )}

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
