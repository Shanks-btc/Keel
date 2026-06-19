import { describe, it, expect } from "vitest";
import { DEFAULT_POLICY } from "../src/config.js";
import {
  isEmergencyMode,
  applyDrawdownOverlay,
  applyMacroEventOverlay,
  applyTACautionOverlay,
  applyRegimeBiasOverlay,
  applyAllOverlays,
} from "../src/risk/overlays.js";

// ── isEmergencyMode ───────────────────────────────────────────────────────────

describe("isEmergencyMode", () => {
  it("returns true exactly at the emergency threshold (-14)", () => {
    expect(isEmergencyMode(-14, DEFAULT_POLICY)).toBe(true);
  });

  it("returns true well inside the emergency zone", () => {
    expect(isEmergencyMode(-17, DEFAULT_POLICY)).toBe(true);
  });

  it("returns false just above the emergency threshold (-13.99)", () => {
    expect(isEmergencyMode(-13.99, DEFAULT_POLICY)).toBe(false);
  });

  it("returns false when there is no drawdown", () => {
    expect(isEmergencyMode(0, DEFAULT_POLICY)).toBe(false);
  });

  it("respects a custom emergencyModeThresholdPct", () => {
    const custom = { ...DEFAULT_POLICY, emergencyModeThresholdPct: -10 };
    expect(isEmergencyMode(-10.1, custom)).toBe(true);
    expect(isEmergencyMode(-9.9, custom)).toBe(false);
  });
});

// ── applyDrawdownOverlay ──────────────────────────────────────────────────────

describe("applyDrawdownOverlay", () => {
  it("does not apply when drawdown is above the overlay start threshold (-7.99)", () => {
    expect(applyDrawdownOverlay(80, -7.99, DEFAULT_POLICY)).toBe(80);
  });

  it("applies at exactly the overlay start threshold (-8)", () => {
    expect(applyDrawdownOverlay(80, -8, DEFAULT_POLICY)).toBe(45);
  });

  it("applies when drawdown is below the threshold (-10)", () => {
    expect(applyDrawdownOverlay(80, -10, DEFAULT_POLICY)).toBe(45);
  });

  it("does not raise the target — risk-off (18) stays at 18 inside the overlay zone", () => {
    expect(applyDrawdownOverlay(18, -10, DEFAULT_POLICY)).toBe(18);
  });

  it("does not change the target when it is already at the cap (45)", () => {
    expect(applyDrawdownOverlay(45, -10, DEFAULT_POLICY)).toBe(45);
  });

  it("no drawdown (0%) → target unchanged", () => {
    expect(applyDrawdownOverlay(80, 0, DEFAULT_POLICY)).toBe(80);
  });
});

// ── applyMacroEventOverlay ────────────────────────────────────────────────────

describe("applyMacroEventOverlay", () => {
  it("applies when event is well within the window (12h < 24h)", () => {
    expect(applyMacroEventOverlay(80, 12, DEFAULT_POLICY)).toBe(30);
  });

  it("applies when event is imminent (1h)", () => {
    expect(applyMacroEventOverlay(80, 1, DEFAULT_POLICY)).toBe(30);
  });

  it("does not apply when event is exactly at the window boundary (24h ≥ window)", () => {
    expect(applyMacroEventOverlay(80, 24, DEFAULT_POLICY)).toBe(80);
  });

  it("does not apply when event is beyond the window (48h)", () => {
    expect(applyMacroEventOverlay(80, 48, DEFAULT_POLICY)).toBe(80);
  });

  it("skips silently when hoursToNextMacroEvent is undefined (Hub unavailable)", () => {
    expect(applyMacroEventOverlay(80, undefined, DEFAULT_POLICY)).toBe(80);
  });

  it("does not raise the target — risk-off (18) stays at 18 inside the window", () => {
    expect(applyMacroEventOverlay(18, 6, DEFAULT_POLICY)).toBe(18);
  });
});

// ── applyTACautionOverlay ─────────────────────────────────────────────────────

describe("applyTACautionOverlay", () => {
  it("applies when RSI is above the caution threshold (80 > 75)", () => {
    expect(applyTACautionOverlay(80, 80, DEFAULT_POLICY)).toBe(45);
  });

  it("does not apply when RSI equals the threshold exactly (75 = 75, not strictly greater)", () => {
    expect(applyTACautionOverlay(80, 75, DEFAULT_POLICY)).toBe(80);
  });

  it("does not apply when RSI is well below the threshold (50)", () => {
    expect(applyTACautionOverlay(80, 50, DEFAULT_POLICY)).toBe(80);
  });

  it("skips silently when rsi is undefined (Hub unavailable)", () => {
    expect(applyTACautionOverlay(80, undefined, DEFAULT_POLICY)).toBe(80);
  });

  it("does not raise the target — risk-off (18) stays at 18 with high RSI", () => {
    expect(applyTACautionOverlay(18, 90, DEFAULT_POLICY)).toBe(18);
  });
});

// ── applyRegimeBiasOverlay ────────────────────────────────────────────────────

describe("applyRegimeBiasOverlay", () => {
  it("applies when BTC dominance exceeds the threshold (60% > 55%)", () => {
    expect(applyRegimeBiasOverlay(80, 60, DEFAULT_POLICY)).toBe(45);
  });

  it("does not apply at exactly the threshold (55% = 55%, not strictly greater)", () => {
    expect(applyRegimeBiasOverlay(80, 55, DEFAULT_POLICY)).toBe(80);
  });

  it("does not apply when BTC dominance is below the threshold (40%)", () => {
    expect(applyRegimeBiasOverlay(80, 40, DEFAULT_POLICY)).toBe(80);
  });

  it("skips silently when btcDominancePct is undefined (Hub unavailable)", () => {
    expect(applyRegimeBiasOverlay(80, undefined, DEFAULT_POLICY)).toBe(80);
  });

  it("does not raise the target — risk-off (18) stays at 18 in risk-off regime", () => {
    expect(applyRegimeBiasOverlay(18, 70, DEFAULT_POLICY)).toBe(18);
  });
});

// ── applyAllOverlays ──────────────────────────────────────────────────────────

describe("applyAllOverlays — clean state (no overlays triggered)", () => {
  it("returns input target unchanged when drawdown is mild and Hub is absent", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: 0 });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
    expect(result.emergencyMode).toBe(false);
  });

  it("returns input target unchanged when drawdown is just above the overlay start", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -7.99 });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
    expect(result.emergencyMode).toBe(false);
  });
});

describe("applyAllOverlays — drawdown overlay", () => {
  it("caps a risk-on target (80) at drawdownOverlayCap (45) when drawdown triggers overlay", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -10 });
    expect(result.finalTarget).toBe(45);
    expect(result.overlaysApplied).toHaveLength(1);
    expect(result.overlaysApplied[0]!.name).toBe("drawdown");
    expect(result.overlaysApplied[0]!.originalTarget).toBe(80);
    expect(result.overlaysApplied[0]!.adjustedTarget).toBe(45);
    expect(result.emergencyMode).toBe(false);
  });

  it("records no overlay entry when the target is already at or below the cap", () => {
    const result = applyAllOverlays({ modeTarget: 45, drawdownPct: -10 });
    expect(result.finalTarget).toBe(45);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("risk-off target (18) is never raised into the overlay zone — stays at 18", () => {
    const result = applyAllOverlays({ modeTarget: 18, drawdownPct: -10 });
    expect(result.finalTarget).toBe(18);
    expect(result.overlaysApplied).toHaveLength(0);
  });
});

describe("applyAllOverlays — emergency mode", () => {
  it("caps target at riskOffTargetPct and sets emergencyMode=true", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -15 });
    expect(result.finalTarget).toBe(DEFAULT_POLICY.riskOffTargetPct);
    expect(result.emergencyMode).toBe(true);
    expect(result.overlaysApplied[0]!.name).toBe("emergency");
  });

  it("sets emergencyMode=true even when the target is already at riskOffTargetPct", () => {
    const result = applyAllOverlays({
      modeTarget: DEFAULT_POLICY.riskOffTargetPct,
      drawdownPct: -15,
    });
    expect(result.emergencyMode).toBe(true);
    expect(result.finalTarget).toBe(DEFAULT_POLICY.riskOffTargetPct);
    expect(result.overlaysApplied).toHaveLength(0); // no cap needed, but flag is set
  });

  it("records 'emergency' overlay entry, not 'drawdown', when in emergency zone", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -15 });
    const names = result.overlaysApplied.map(o => o.name);
    expect(names).toContain("emergency");
    expect(names).not.toContain("drawdown");
  });

  it("emergencyMode=false when drawdown is in drawdown-overlay zone but not emergency zone", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -10 });
    expect(result.emergencyMode).toBe(false);
  });
});

describe("applyAllOverlays — Hub enrichment overlays", () => {
  it("macro-event overlay caps target when event is within the window", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { hoursToNextMacroEvent: 12 },
    });
    expect(result.finalTarget).toBe(DEFAULT_POLICY.macroEventTargetCap);
    expect(result.overlaysApplied[0]!.name).toBe("macro-event");
  });

  it("macro-event overlay not applied when event is outside the window", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { hoursToNextMacroEvent: 48 },
    });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("TA-caution overlay applies when RSI exceeds the threshold", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { rsi: 82 },
    });
    expect(result.finalTarget).toBe(DEFAULT_POLICY.rsiCautionTargetCap);
    expect(result.overlaysApplied[0]!.name).toBe("ta-caution");
  });

  it("TA-caution overlay not applied when RSI is below the threshold", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { rsi: 60 },
    });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("regime-bias overlay applies when BTC dominance exceeds the threshold", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { btcDominancePct: 62 },
    });
    expect(result.finalTarget).toBe(DEFAULT_POLICY.btcDominanceTargetCap);
    expect(result.overlaysApplied[0]!.name).toBe("regime-bias");
  });

  it("regime-bias overlay not applied when BTC dominance is below the threshold", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: { btcDominancePct: 48 },
    });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("empty hub object → no Hub overlays applied", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: 0, hub: {} });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("absent hub → no Hub overlays applied", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: 0 });
    expect(result.finalTarget).toBe(80);
    expect(result.overlaysApplied).toHaveLength(0);
  });
});

describe("applyAllOverlays — overlay invariants", () => {
  it("overlays NEVER raise the target — risk-off (18) unchanged with all Hub signals present", () => {
    const result = applyAllOverlays({
      modeTarget: 18,
      drawdownPct: 0,
      hub: {
        rsi: 90,
        hoursToNextMacroEvent: 6,
        btcDominancePct: 65,
      },
    });
    expect(result.finalTarget).toBe(18);
    expect(result.overlaysApplied).toHaveLength(0);
  });

  it("multiple Hub overlays compound — lowest applicable cap wins", () => {
    // macroEventTargetCap=30 is lower than rsiCautionTargetCap=45 and btcDominanceTargetCap=45
    // So macro-event overlay brings target from 80 → 30; TA (min(30,45)=30) and regime (min(30,45)=30) add no change.
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: 0,
      hub: {
        hoursToNextMacroEvent: 6,  // triggers macro-event: cap at 30
        rsi: 80,                    // triggers TA: cap at 45 — no further change (30 < 45)
        btcDominancePct: 60,        // triggers regime: cap at 45 — no further change (30 < 45)
      },
    });
    expect(result.finalTarget).toBe(30);
    expect(result.overlaysApplied).toHaveLength(1);
    expect(result.overlaysApplied[0]!.name).toBe("macro-event");
  });

  it("drawdown overlay + TA-caution overlay compound when TA cap is lower", () => {
    // Draw overlay: 80 → 45 (drawdownOverlayCap). TA (rsi=82): min(45, 45) = 45 — no further change.
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: -10,
      hub: { rsi: 82 },
    });
    expect(result.finalTarget).toBe(45);
    expect(result.overlaysApplied.some(o => o.name === "drawdown")).toBe(true);
  });

  it("overlay entries record the correct pre/post-overlay target values", () => {
    const result = applyAllOverlays({ modeTarget: 80, drawdownPct: -10 });
    const entry = result.overlaysApplied[0]!;
    expect(entry.originalTarget).toBe(80);
    expect(entry.adjustedTarget).toBe(45);
    expect(entry.adjustedTarget).toBeLessThanOrEqual(entry.originalTarget);
  });

  it("reason string is populated for every applied overlay", () => {
    const result = applyAllOverlays({
      modeTarget: 80,
      drawdownPct: -10,
      hub: { hoursToNextMacroEvent: 8 },
    });
    for (const overlay of result.overlaysApplied) {
      expect(overlay.reason.length).toBeGreaterThan(0);
    }
  });
});
