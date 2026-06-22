import type { ReactNode } from "react";

interface CardProps {
  children: ReactNode;
  className?: string;
  elevated?: boolean;
}

export function Card({ children, className = "", elevated = false }: CardProps) {
  const bg = elevated ? "var(--card-elevated)" : "var(--card)";
  return (
    <div
      style={{
        backgroundColor: bg,
        border: "1px solid var(--border)",
        borderRadius: "8px",
        padding: "var(--card-padding, 16px)",
      }}
      className={className}
    >
      {children}
    </div>
  );
}

export function CardHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle?: string;
  action?: ReactNode;
}) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "flex-start",
        marginBottom: "12px",
      }}
    >
      <div>
        <div
          style={{
            fontSize: "11px",
            fontWeight: 600,
            letterSpacing: "0.08em",
            textTransform: "uppercase",
            color: "var(--text-muted)",
            marginBottom: subtitle ? "2px" : 0,
          }}
        >
          {title}
        </div>
        {subtitle && (
          <div style={{ fontSize: "12px", color: "var(--text-secondary)" }}>
            {subtitle}
          </div>
        )}
      </div>
      {action && <div>{action}</div>}
    </div>
  );
}