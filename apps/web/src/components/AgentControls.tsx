// §7b — Risk-Gated Agent Controls.
// Every preview routes through the §0a risk engine formula + §4 drawdown-gate logic
// (computed server-side via /api/cycle-preview).
// No control here bypasses TWAK, drawdown checks, or eligible-token checks.
// No fake tx hashes. Cannot disable the engine. No "buy any token". No allowlist override.

"use client";

import { useState } from "react";
import type { AgentStatus, DrawdownGateResult, RiskMode } from "@keel/shared";
import { Card, CardHeader } from "./ui/Card";
import { modeColor } from "../lib/format";

interface Props {
  status: AgentStatus;
  onPause: () => void;
  onResume: () => void;
  onRefresh: () => void;
}

interface CyclePreview {
  ok: boolean;
  priceIsSimulation?: boolean;
  R?: number;
  mode?: RiskMode;
  targetVolatilePct?: number;
  adjustedTarget?: number;
  emergencyMode?: boolean;
  overlaysApplied?: string[];
  drawdownPct?: number;
  drawdownGate?: DrawdownGateResult;
  error?: string;
}

function Btn({
  onClick,
  color,
  disabled,
  children,
}: {
  onClick: () => void;
  color: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        padding: "8px 16px",
        borderRadius: "6px",
        border: `1px solid ${color}50`,
        backgroundColor: disabled ? "var(--surface)" : `${color}12`,
        color: disabled ? "var(--text-muted)" : color,
        fontSize: "12px",
        fontWeight: 600,
        cursor: disabled ? "not-allowed" : "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${color}22`;
      }}
      onMouseLeave={(e) => {
        if (!disabled)
          (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${color}12`;
      }}
    >
      {children}
    </button>
  );
}

export function AgentControls({ status, onPause, onResume, onRefresh }: Props) {
  const isPaused = status === "Paused";
  const [preview, setPreview] = useState<CyclePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  async function runPreview() {
    setPreviewLoading(true);
    setPreview(null);
    try {
      const res = await fetch("/api/cycle-preview");
      const data = (await res.json()) as CyclePreview;
      setPreview(data);
    } catch (err) {
      setPreview({ ok: false, error: String(err) });
    } finally {
      setPreviewLoading(false);
    }
  }

  const gateOk = preview?.drawdownGate?.ok;
  const gateColor =
    gateOk === true
      ? "var(--green)"
      : gateOk === false
      ? "var(--red)"
      : "var(--border)";

  return (
    <Card>
      <CardHeader
        title="Risk-Gated Agent Controls"
        subtitle="Daily qualification scheduler"
      />

      {/* Action buttons */}
      <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", marginBottom: "10px" }}>
        {isPaused ? (
          <Btn onClick={onResume} color="var(--green)">
            ▶ Resume scheduler
          </Btn>
        ) : (
          <Btn onClick={onPause} color="var(--amber)">
            ⏸ Pause scheduler
          </Btn>
        )}
        <Btn onClick={runPreview} color="var(--blue)" disabled={previewLoading}>
          {previewLoading ? "Computing…" : "Preview next cycle"}
        </Btn>
        <Btn onClick={onRefresh} color="var(--text-secondary)">
          ↺ Refresh
        </Btn>
      </div>

      {/* Safety notice */}
      <div
        style={{
          fontSize: "10px",
          color: "var(--text-muted)",
          lineHeight: "1.5",
          marginBottom: preview ? "10px" : "0",
        }}
      >
        Pause halts the daily qualification scheduler. The risk engine continues to compute.
        All safety gates remain active (kill-switch → allowlist → per-trade cap → daily-loss
        cap → slippage → projected-drawdown). Holdings are NOT flattened on pause.
        <br />
        Execution requires the scheduler running server-side with{" "}
        <code style={{ fontFamily: "monospace", color: "var(--text-secondary)" }}>
          I_UNDERSTAND_REAL_FUNDS=yes
        </code>
        . Preview only — no trade is submitted here.
      </div>

      {/* Preview result */}
      {preview && (
        <div style={{ borderTop: "1px solid var(--border)", paddingTop: "10px" }}>
          {preview.priceIsSimulation && (
            <div
              style={{
                fontSize: "10px",
                fontWeight: 700,
                color: "var(--amber)",
                letterSpacing: "0.06em",
                marginBottom: "8px",
              }}
            >
              SIMULATION — market snapshot is not live CMC data
            </div>
          )}

          {preview.ok !== false ? (
            <>
              {/* Engine output */}
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr",
                  gap: "6px",
                  fontSize: "12px",
                  marginBottom: "8px",
                }}
              >
                <div>
                  <span style={{ color: "var(--text-muted)" }}>R score: </span>
                  <strong style={{ color: "var(--text-primary)" }}>
                    {preview.R?.toFixed(3)}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Mode: </span>
                  <strong style={{ color: modeColor(preview.mode ?? "Neutral") }}>
                    {preview.mode}
                  </strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Base target: </span>
                  <strong>{preview.targetVolatilePct}% volatile</strong>
                </div>
                <div>
                  <span style={{ color: "var(--text-muted)" }}>Adjusted: </span>
                  <strong>{preview.adjustedTarget}%</strong>
                </div>
              </div>

              {(preview.overlaysApplied?.length ?? 0) > 0 && (
                <div
                  style={{ fontSize: "11px", color: "var(--amber)", marginBottom: "6px" }}
                >
                  Overlays: {preview.overlaysApplied?.join(", ")}
                </div>
              )}

              {preview.emergencyMode && (
                <div
                  style={{
                    fontSize: "11px",
                    color: "var(--red)",
                    fontWeight: 600,
                    marginBottom: "6px",
                  }}
                >
                  Emergency mode active — no new volatile exposure permitted
                </div>
              )}

              {/* §4 drawdown gate result */}
              {preview.drawdownGate && (
                <div
                  style={{
                    fontSize: "11px",
                    padding: "6px 8px",
                    borderRadius: "4px",
                    background: `${gateColor}10`,
                    border: `1px solid ${gateColor}35`,
                  }}
                >
                  <strong style={{ color: gateColor }}>
                    Drawdown gate (§4): {preview.drawdownGate.ok ? "PASS" : "BLOCK"}
                  </strong>
                  <div
                    style={{
                      color: "var(--text-secondary)",
                      marginTop: "2px",
                      lineHeight: "1.4",
                    }}
                  >
                    {preview.drawdownGate.reason}
                  </div>
                  {preview.drawdownGate.projectedVolatilePct !== undefined && (
                    <div style={{ color: "var(--text-muted)", marginTop: "2px" }}>
                      Projected volatile: {preview.drawdownGate.projectedVolatilePct.toFixed(1)}%
                    </div>
                  )}
                </div>
              )}
            </>
          ) : (
            <div style={{ fontSize: "11px", color: "var(--red)" }}>
              Preview error: {preview.error}
            </div>
          )}

          <div
            style={{
              fontSize: "10px",
              color: "var(--text-muted)",
              marginTop: "8px",
              lineHeight: "1.4",
            }}
          >
            Preview runs: risk engine → drawdown-gate (§4). Real execution also adds:
            kill-switch → allowlist → per-trade cap → daily-loss cap → slippage.
            Only TWAK submits trades. Eligible tokens: ETH, CAKE, LINK, USDT, USDC, USD1,
            FDUSD. BNB is gas-only.
          </div>
        </div>
      )}
    </Card>
  );
}
