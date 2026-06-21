// Pure PnL baseline and label logic — no file I/O, fully testable.

export interface PnlBaseline {
  firstSnapshotUsd: number;
  firstSnapshotAt: string;
}

/**
 * Write-once baseline: returns `existing` unchanged if already set.
 * Only call this with real (non-env) snapshot data.
 */
export function setBaselineOnce(
  existing: PnlBaseline | null,
  newUsd: number,
  newAt: string,
): PnlBaseline {
  if (existing !== null) return existing;
  return { firstSnapshotUsd: newUsd, firstSnapshotAt: newAt };
}

/**
 * Returns "24h PnL" only when the two snapshots are within ±2h of 24h apart.
 * Otherwise returns "Change since first live snapshot" to be honest about the window.
 */
export function pickPnlLabel(firstAt: string, currentAt: string): string {
  const diffMs    = new Date(currentAt).getTime() - new Date(firstAt).getTime();
  const diffHours = diffMs / (1000 * 60 * 60);
  if (Math.abs(diffHours - 24) <= 2) return "24h PnL";
  return "Change since first live snapshot";
}
