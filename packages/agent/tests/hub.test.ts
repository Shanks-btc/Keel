import { describe, it, expect } from "vitest";
import {
  isHubEnabled,
  checkHubConnectivity,
  fetchHubSnapshot,
  fetchHubEnrichment,
  type HubToolRunner,
} from "../src/perception/hub.js";

// ── Test helpers ──────────────────────────────────────────────────────────────

async function withEnv(
  vars: Record<string, string | undefined>,
  fn: () => void | Promise<void>,
): Promise<void> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Stub response for get_crypto_quotes_latest with ETH data
const stubQuoteResult = {
  data: {
    ETH: {
      quote: {
        USD: {
          price: 3_500,
          percent_change_1h: 0.5,
          percent_change_24h: 2.1,
        },
      },
    },
  },
};

// Stub response for get_crypto_technical_analysis
const stubTaResult = {
  data: {
    rsi: 68.4,
  },
};

// Stub macro-event list with one high-impact event ~12 hours from now
function stubMacroEventsResult(hoursFromNow: number) {
  const date = new Date(Date.now() + hoursFromNow * 3_600_000).toISOString();
  return { data: [{ date, impact: "High", title: "US CPI" }] };
}

// Stub global metrics response
const stubGlobalResult = {
  data: {
    btc_dominance: 57.3,
  },
};

// Build a stub runner that handles all three enrichment tools
function buildStubRunner(overrides: Partial<Record<string, unknown>> = {}): HubToolRunner {
  return async (toolName: string) => {
    const data: Record<string, unknown> = {
      get_crypto_quotes_latest: stubQuoteResult,
      get_crypto_technical_analysis: stubTaResult,
      get_upcoming_macro_events: stubMacroEventsResult(12),
      get_global_metrics_latest: stubGlobalResult,
    };
    if (toolName in overrides) return overrides[toolName];
    if (toolName in data) return data[toolName];
    throw new Error(`Unexpected tool: ${toolName}`);
  };
}

// ── isHubEnabled ──────────────────────────────────────────────────────────────

describe("isHubEnabled", () => {
  it("returns false when HUB_ENABLED is not set", async () => {
    await withEnv({ HUB_ENABLED: undefined }, () => {
      expect(isHubEnabled()).toBe(false);
    });
  });

  it("returns true when HUB_ENABLED=yes", async () => {
    await withEnv({ HUB_ENABLED: "yes" }, () => {
      expect(isHubEnabled()).toBe(true);
    });
  });

  it("returns false when HUB_ENABLED=no", async () => {
    await withEnv({ HUB_ENABLED: "no" }, () => {
      expect(isHubEnabled()).toBe(false);
    });
  });
});

// ── checkHubConnectivity ──────────────────────────────────────────────────────

describe("checkHubConnectivity", () => {
  it("returns false immediately when HUB_ENABLED is not set", async () => {
    await withEnv({ HUB_ENABLED: undefined }, async () => {
      const ok = await checkHubConnectivity();
      expect(ok).toBe(false);
    });
  });

  it("returns true when HUB_ENABLED=yes and an injected runner is provided", async () => {
    await withEnv({ HUB_ENABLED: "yes" }, async () => {
      const ok = await checkHubConnectivity(buildStubRunner());
      expect(ok).toBe(true);
    });
  });

  it("returns false when HUB_ENABLED=no even with an injected runner", async () => {
    await withEnv({ HUB_ENABLED: "no" }, async () => {
      const ok = await checkHubConnectivity(buildStubRunner());
      expect(ok).toBe(false);
    });
  });
});

// ── fetchHubSnapshot ──────────────────────────────────────────────────────────

describe("fetchHubSnapshot", () => {
  it("returns a MarketSnapshot with price/1h/24h from the stub runner", async () => {
    const snapshot = await fetchHubSnapshot("ETH", buildStubRunner());
    expect(snapshot).not.toBeNull();
    expect(snapshot!.symbol).toBe("ETH");
    expect(snapshot!.price).toBe(3_500);
    expect(snapshot!.change1h).toBe(0.5);
    expect(snapshot!.change24h).toBe(2.1);
    expect(snapshot!.fetchedAt).toBeTruthy();
  });

  it("sets fearGreed to 0 (Hub does not provide it; caller merges REST value)", async () => {
    const snapshot = await fetchHubSnapshot("ETH", buildStubRunner());
    expect(snapshot!.fearGreed).toBe(0);
  });

  it("returns null when the runner returns data with no price field", async () => {
    const runner: HubToolRunner = async () => ({ data: {} });
    const snapshot = await fetchHubSnapshot("ETH", runner);
    expect(snapshot).toBeNull();
  });

  it("returns null when the runner throws — never propagates the error", async () => {
    const runner: HubToolRunner = async () => { throw new Error("network failure"); };
    const snapshot = await fetchHubSnapshot("ETH", runner);
    expect(snapshot).toBeNull();
  });

  it("returns null when runner returns data for a different symbol", async () => {
    const runner: HubToolRunner = async () => ({
      data: { BTC: { quote: { USD: { price: 70_000 } } } },
    });
    const snapshot = await fetchHubSnapshot("ETH", runner);
    expect(snapshot).toBeNull();
  });

  it("returns null when runner returns null", async () => {
    const runner: HubToolRunner = async () => null;
    const snapshot = await fetchHubSnapshot("ETH", runner);
    expect(snapshot).toBeNull();
  });
});

// ── fetchHubEnrichment ────────────────────────────────────────────────────────

describe("fetchHubEnrichment", () => {
  it("returns all three signals when all tools succeed", async () => {
    const signals = await fetchHubEnrichment("ETH", buildStubRunner());
    expect(typeof signals.rsi).toBe("number");
    expect(typeof signals.hoursToNextMacroEvent).toBe("number");
    expect(typeof signals.btcDominancePct).toBe("number");
  });

  it("extracts RSI from data.rsi field", async () => {
    const signals = await fetchHubEnrichment("ETH", buildStubRunner());
    expect(signals.rsi).toBe(68.4);
  });

  it("extracts BTC dominance from data.btc_dominance field", async () => {
    const signals = await fetchHubEnrichment("ETH", buildStubRunner());
    expect(signals.btcDominancePct).toBe(57.3);
  });

  it("extracts hours-to-next-event correctly for a 12h event", async () => {
    const signals = await fetchHubEnrichment("ETH", buildStubRunner());
    // Should be close to 12h (within ±1h tolerance for test timing)
    expect(signals.hoursToNextMacroEvent).toBeGreaterThan(11);
    expect(signals.hoursToNextMacroEvent).toBeLessThan(13);
  });

  it("skips TA signal silently when TA tool throws", async () => {
    const runner = buildStubRunner({
      get_crypto_technical_analysis: undefined, // will throw in runner
    });
    const throwingRunner: HubToolRunner = async (toolName, args) => {
      if (toolName === "get_crypto_technical_analysis") throw new Error("TA unavailable");
      return runner(toolName, args);
    };
    const signals = await fetchHubEnrichment("ETH", throwingRunner);
    expect(signals.rsi).toBeUndefined();
    expect(typeof signals.btcDominancePct).toBe("number"); // others still work
  });

  it("skips macro-event signal silently when that tool throws", async () => {
    const throwingRunner: HubToolRunner = async (toolName, args) => {
      if (toolName === "get_upcoming_macro_events") throw new Error("events unavailable");
      return buildStubRunner()(toolName, args);
    };
    const signals = await fetchHubEnrichment("ETH", throwingRunner);
    expect(signals.hoursToNextMacroEvent).toBeUndefined();
    expect(typeof signals.rsi).toBe("number"); // others still work
  });

  it("returns an empty HubSignals when all tools throw", async () => {
    const runner: HubToolRunner = async () => { throw new Error("Hub down"); };
    const signals = await fetchHubEnrichment("ETH", runner);
    expect(signals).toEqual({});
  });

  it("returns undefined RSI when tool returns data without RSI field", async () => {
    const runner = buildStubRunner({
      get_crypto_technical_analysis: { data: { macd: 0.5 } }, // no rsi
    });
    const signals = await fetchHubEnrichment("ETH", runner);
    expect(signals.rsi).toBeUndefined();
  });

  it("ignores past macro events (hoursToNextMacroEvent would be negative)", async () => {
    const pastDate = new Date(Date.now() - 3_600_000).toISOString(); // 1h in the past
    const runner = buildStubRunner({
      get_upcoming_macro_events: {
        data: [{ date: pastDate, impact: "High", title: "Past event" }],
      },
    });
    const signals = await fetchHubEnrichment("ETH", runner);
    expect(signals.hoursToNextMacroEvent).toBeUndefined();
  });

  it("ignores low-impact macro events", async () => {
    const futureDate = new Date(Date.now() + 3_600_000).toISOString(); // 1h ahead
    const runner = buildStubRunner({
      get_upcoming_macro_events: {
        data: [{ date: futureDate, impact: "Low", title: "Low impact event" }],
      },
    });
    const signals = await fetchHubEnrichment("ETH", runner);
    expect(signals.hoursToNextMacroEvent).toBeUndefined();
  });
});
