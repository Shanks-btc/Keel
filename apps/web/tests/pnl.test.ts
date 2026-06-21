import { describe, it, expect } from "vitest";
import { setBaselineOnce, pickPnlLabel } from "../src/lib/pnl";

// ── setBaselineOnce ────────────────────────────────────────────────────────────

describe("setBaselineOnce", () => {
  it("creates baseline when none exists", () => {
    const result = setBaselineOnce(null, 1000, "2026-06-20T00:00:00.000Z");
    expect(result.firstSnapshotUsd).toBe(1000);
    expect(result.firstSnapshotAt).toBe("2026-06-20T00:00:00.000Z");
  });

  it("never overwrites an existing baseline", () => {
    const existing = { firstSnapshotUsd: 500, firstSnapshotAt: "2026-06-01T00:00:00.000Z" };
    const result = setBaselineOnce(existing, 9999, "2026-06-21T00:00:00.000Z");
    expect(result.firstSnapshotUsd).toBe(500);
    expect(result.firstSnapshotAt).toBe("2026-06-01T00:00:00.000Z");
  });

  it("second call with same args still returns original baseline", () => {
    const first  = setBaselineOnce(null, 800, "2026-06-10T12:00:00.000Z");
    const second = setBaselineOnce(first, 850, "2026-06-10T13:00:00.000Z");
    expect(second.firstSnapshotUsd).toBe(800);
    expect(second.firstSnapshotAt).toBe("2026-06-10T12:00:00.000Z");
  });
});

// ── pickPnlLabel ───────────────────────────────────────────────────────────────

describe("pickPnlLabel", () => {
  function addHours(base: string, hours: number): string {
    return new Date(new Date(base).getTime() + hours * 3_600_000).toISOString();
  }

  const BASE = "2026-06-20T00:00:00.000Z";

  it("returns '24h PnL' for exactly 24h apart", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 24))).toBe("24h PnL");
  });

  it("returns '24h PnL' for 22h apart (within ±2h window)", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 22))).toBe("24h PnL");
  });

  it("returns '24h PnL' for 25.9h apart (within ±2h window)", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 25.9))).toBe("24h PnL");
  });

  it("returns 'Change since first live snapshot' for 1h apart", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 1))).toBe("Change since first live snapshot");
  });

  it("returns 'Change since first live snapshot' for 21.9h apart (just outside window)", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 21.9))).toBe("Change since first live snapshot");
  });

  it("returns 'Change since first live snapshot' for 48h apart", () => {
    expect(pickPnlLabel(BASE, addHours(BASE, 48))).toBe("Change since first live snapshot");
  });

  it("returns 'Change since first live snapshot' when snapshots are same time", () => {
    expect(pickPnlLabel(BASE, BASE)).toBe("Change since first live snapshot");
  });
});
