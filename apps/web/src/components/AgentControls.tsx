"use client";

import type { AgentStatus } from "@keel/shared";
import { Card, CardHeader } from "./ui/Card";

interface Props {
  status: AgentStatus;
  onPause: () => void;
  onResume: () => void;
  onRefresh: () => void;
}

function Btn({
  onClick,
  color,
  children,
}: {
  onClick: () => void;
  color: string;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: "10px 20px",
        borderRadius: "6px",
        border: `1px solid ${color}50`,
        backgroundColor: `${color}12`,
        color,
        fontSize: "13px",
        fontWeight: 600,
        cursor: "pointer",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${color}22`;
      }}
      onMouseLeave={(e) => {
        (e.currentTarget as HTMLButtonElement).style.backgroundColor = `${color}12`;
      }}
    >
      {children}
    </button>
  );
}

export function AgentControls({ status, onPause, onResume, onRefresh }: Props) {
  const isPaused = status === "Paused";

  return (
    <Card>
      <CardHeader
        title="Agent Controls"
        subtitle="Affects the autonomous loop"
      />
      <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
        {isPaused ? (
          <Btn onClick={onResume} color="var(--green)">
            ▶ Resume
          </Btn>
        ) : (
          <Btn onClick={onPause} color="var(--amber)">
            ⏸ Pause
          </Btn>
        )}
        <Btn onClick={onRefresh} color="var(--text-secondary)">
          ↺ Refresh
        </Btn>
      </div>
      <div
        style={{
          marginTop: "12px",
          fontSize: "11px",
          color: "var(--text-muted)",
        }}
      >
        Pause halts new rotations but does not flatten holdings. Resume
        restarts the decision loop.
      </div>
    </Card>
  );
}
