import { describe, it, expect } from "vitest";
import {
  isX402Enabled,
  attemptX402,
  attemptX402FromEnv,
  type X402Runner,
} from "../src/perception/x402.js";

// ── Helpers ───────────────────────────────────────────────────────────────────

function withEnv(vars: Record<string, string | undefined>, fn: () => void): void {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}

// Stub runner that returns a valid x402 JSON response with a Base tx hash
const stubSuccessRunner: X402Runner = () =>
  JSON.stringify({
    txHash: "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
    amount: 10_000,
  });

// Stub runner that returns JSON with no tx hash
const stubNoHashRunner: X402Runner = () =>
  JSON.stringify({ status: "ok" }); // no txHash field

// Stub runner that throws
const stubThrowRunner: X402Runner = () => {
  throw new Error("TWAK x402 network error");
};

// ── isX402Enabled ─────────────────────────────────────────────────────────────

describe("isX402Enabled", () => {
  it("returns false when X402_ENABLED is not set", () => {
    withEnv({ X402_ENABLED: undefined }, () => {
      expect(isX402Enabled()).toBe(false);
    });
  });

  it("returns true when X402_ENABLED=yes", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      expect(isX402Enabled()).toBe(true);
    });
  });

  it("returns false when X402_ENABLED=no", () => {
    withEnv({ X402_ENABLED: "no" }, () => {
      expect(isX402Enabled()).toBe(false);
    });
  });
});

// ── attemptX402 — disabled ────────────────────────────────────────────────────

describe("attemptX402 — disabled", () => {
  it("returns ok:false immediately when X402_ENABLED is not set", () => {
    withEnv({ X402_ENABLED: undefined }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.ok).toBe(false);
      expect(result.proof).toBeUndefined();
    });
  });

  it("does not call the runner when x402 is disabled", () => {
    let called = false;
    const trackingRunner: X402Runner = () => {
      called = true;
      return "{}";
    };
    withEnv({ X402_ENABLED: undefined }, () => {
      attemptX402("https://example.com/data", 10_000, trackingRunner);
    });
    expect(called).toBe(false);
  });
});

// ── attemptX402 — enabled, success ───────────────────────────────────────────

describe("attemptX402 — enabled, success", () => {
  it("returns ok:true with a proof when the runner returns a tx hash", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.ok).toBe(true);
      expect(result.proof).toBeDefined();
      expect(result.proof!.txHash).toBe(
        "0xabc123def456abc123def456abc123def456abc123def456abc123def456abc1",
      );
    });
  });

  it("proof.chain is always 'Base' (never BSC)", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.proof!.chain).toBe("Base");
    });
  });

  it("proof.chainId is 8453 (Base)", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.proof!.chainId).toBe(8453);
    });
  });

  it("proof.amountUsdc converts atomic units correctly (10000 → 0.01)", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.proof!.amountUsdc).toBeCloseTo(0.01);
    });
  });

  it("proof.explorerUrl points to basescan.org (not bscscan.com)", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubSuccessRunner);
      expect(result.proof!.explorerUrl).toContain("basescan.org");
      expect(result.proof!.explorerUrl).not.toContain("bscscan.com");
    });
  });

  it("proof.url records the paid endpoint URL", () => {
    const url = "https://mcp.coinmarketcap.com/paid-endpoint";
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402(url, 10_000, stubSuccessRunner);
      expect(result.proof!.url).toBe(url);
    });
  });

  it("passes correct args to the runner (url, network, max-payment, --yes, --json)", () => {
    let capturedArgs = "";
    const capturingRunner: X402Runner = (args) => {
      capturedArgs = args;
      return stubSuccessRunner(args);
    };
    withEnv({ X402_ENABLED: "yes" }, () => {
      attemptX402("https://cmc.example.com/pay", 10_000, capturingRunner);
    });
    expect(capturedArgs).toContain("x402");
    expect(capturedArgs).toContain("request");
    expect(capturedArgs).toContain("https://cmc.example.com/pay");
    expect(capturedArgs).toContain("--prefer-network");
    expect(capturedArgs).toContain("base");
    expect(capturedArgs).toContain("--max-payment");
    expect(capturedArgs).toContain("10000");
    expect(capturedArgs).toContain("--yes");
    expect(capturedArgs).toContain("--json");
  });
});

// ── attemptX402 — enabled, failure ───────────────────────────────────────────

describe("attemptX402 — enabled, failure", () => {
  it("returns ok:false when the runner throws — never propagates", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubThrowRunner);
      expect(result.ok).toBe(false);
      expect(result.error).toMatch(/network error/i);
    });
  });

  it("returns ok:false when the runner returns no tx hash in output", () => {
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, stubNoHashRunner);
      expect(result.ok).toBe(false);
      expect(result.proof).toBeUndefined();
    });
  });

  it("returns ok:false when runner returns non-JSON — never throws", () => {
    const junkRunner: X402Runner = () => "not json at all";
    withEnv({ X402_ENABLED: "yes" }, () => {
      const result = attemptX402("https://example.com/data", 10_000, junkRunner);
      expect(result.ok).toBe(false);
    });
  });
});

// ── attemptX402FromEnv ────────────────────────────────────────────────────────

describe("attemptX402FromEnv", () => {
  it("returns ok:false when X402_URL is not set", () => {
    withEnv({ X402_ENABLED: "yes", X402_URL: undefined }, () => {
      const result = attemptX402FromEnv(stubSuccessRunner);
      expect(result.ok).toBe(false);
    });
  });

  it("uses X402_URL when set and x402 is enabled", () => {
    let capturedArgs = "";
    const capturingRunner: X402Runner = (args) => {
      capturedArgs = args;
      return stubSuccessRunner(args);
    };
    withEnv({ X402_ENABLED: "yes", X402_URL: "https://cmc-hub.example.com/pay" }, () => {
      attemptX402FromEnv(capturingRunner);
    });
    expect(capturedArgs).toContain("https://cmc-hub.example.com/pay");
  });
});
