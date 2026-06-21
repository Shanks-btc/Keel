console.log("[keel diag] PORTFOLIO_VALUE_USD =", JSON.stringify(process.env.PORTFOLIO_VALUE_USD));
console.log("[keel diag] KEEL_DATA_DIR =", JSON.stringify(process.env.KEEL_DATA_DIR));
console.log("[keel diag] I_UNDERSTAND_REAL_FUNDS =", JSON.stringify(process.env.I_UNDERSTAND_REAL_FUNDS));
console.log("[keel diag] CMC_API_KEY set? =", process.env.CMC_API_KEY ? "yes, length " + process.env.CMC_API_KEY.length : "NOT SET");
console.log("[keel diag] Total env var count =", Object.keys(process.env).length);

// Railway single-service entrypoint.
// Starts the Next.js web dashboard and runs the scheduler cycle in-process
// so both share the same KEEL_DATA_DIR volume mount.
//
// Does NOT import any agent or web internals — only spawns existing CLI
// entrypoints as child processes.

"use strict";

const { spawn } = require("child_process");
const fs = require("fs");
const os = require("os");
const path = require("path");

// ── Config ────────────────────────────────────────────────────────────────────

const CYCLE_INTERVAL_MS = 60 * 60 * 1000; // 60 minutes
const isLive = process.env["I_UNDERSTAND_REAL_FUNDS"] === "yes";
const mode = isLive ? "LIVE" : "DRY-RUN/SAFE";
const dataDir = process.env["KEEL_DATA_DIR"] ?? path.resolve(__dirname, "data");
const runOnBoot = process.env["KEEL_RUN_ON_BOOT"] !== "false";

// ── Startup diagnostics (no secrets) ─────────────────────────────────────────

console.log(`[keel server] Starting in ${mode} mode`);
console.log(`[keel server] Resolved data directory: ${dataDir}`);

let writable = false;
try {
  const probe = path.join(dataDir, ".write-probe");
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(probe, "probe");
  fs.unlinkSync(probe);
  writable = true;
} catch {
  writable = false;
}
console.log(`[keel server] Data directory writable: ${writable}`);

// ── TWAK keystore reconstruction ─────────────────────────────────────────────
// Runs synchronously before any child process is spawned.
// Decodes wallet.json and credentials.json from base64 env vars and writes
// them to ~/.twak/ so the twak CLI can find them regardless of container user.
// NEVER logs decoded content or the base64 strings — only booleans.

(function reconstructKeystore() {
  const walletB64      = process.env["TWAK_WALLET_JSON_B64"];
  const credentialsB64 = process.env["TWAK_CREDENTIALS_JSON_B64"];

  if (!walletB64 || !credentialsB64) {
    console.log("[keel server] TWAK keystore env vars not set — skipping reconstruction");
    return;
  }

  const twakDir = path.join(os.homedir(), ".twak");
  let walletOk = false;
  let credentialsOk = false;

  try {
    fs.mkdirSync(twakDir, { recursive: true });

    fs.writeFileSync(
      path.join(twakDir, "wallet.json"),
      Buffer.from(walletB64, "base64"),
    );
    walletOk = true;

    fs.writeFileSync(
      path.join(twakDir, "credentials.json"),
      Buffer.from(credentialsB64, "base64"),
    );
    credentialsOk = true;
  } catch (err) {
    console.error(`[keel server] Keystore reconstruction error: ${err.message}`);
  }

  console.log(
    `[keel server] Keystore reconstructed: wallet.json=${walletOk} credentials.json=${credentialsOk}`,
  );
})();

// ── Cycle runner ──────────────────────────────────────────────────────────────

function runCycle() {
  console.log(`[keel server] Spawning scheduler cycle · ${new Date().toISOString()}`);
  const child = spawn("npm", ["run", "run:cycle"], {
    stdio: "inherit",
    shell: process.platform === "win32",
  });

  child.on("error", (err) => {
    console.error(`[keel server] Cycle spawn error: ${err.message}`);
  });

  child.on("close", (code) => {
    if (code !== 0) {
      console.error(`[keel server] Cycle exited with code ${code}`);
    } else {
      console.log(`[keel server] Cycle complete · ${new Date().toISOString()}`);
    }
    // Non-zero exit is intentionally non-fatal — web dashboard stays up.
  });
}

// ── Start Next.js ─────────────────────────────────────────────────────────────

const web = spawn("npm", ["run", "start", "--workspace=apps/web"], {
  stdio: "inherit",
  shell: process.platform === "win32",
});

web.on("error", (err) => {
  console.error(`[keel server] Next.js spawn error: ${err.message}`);
  process.exit(1);
});

web.on("close", (code) => {
  console.error(`[keel server] Next.js exited with code ${code} — shutting down`);
  process.exit(code ?? 1);
});

// ── Boot cycle + interval ─────────────────────────────────────────────────────

if (runOnBoot) {
  // Small delay so Next.js can begin starting before the first cycle log appears.
  setTimeout(runCycle, 2000);
} else {
  console.log("[keel server] KEEL_RUN_ON_BOOT=false — skipping boot cycle");
}

setInterval(runCycle, CYCLE_INTERVAL_MS);

// ── Graceful shutdown ─────────────────────────────────────────────────────────

function shutdown(signal) {
  console.log(`[keel server] Received ${signal} — forwarding to Next.js child`);
  if (web && !web.killed) {
    web.kill(signal);
  }
  // Exit after a short grace period in case web.close fires first.
  setTimeout(() => process.exit(0), 5000);
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT",  () => shutdown("SIGINT"));
