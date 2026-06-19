// Proves TWAK can quote a real BSC swap. No funds, no wallet. Run: node quote-test.cjs
const { execSync } = require("node:child_process");

const TWAK = "npx --yes --package @trustwallet/cli twak";
const cmd = `${TWAK} swap 5 USDT ETH --chain bsc --slippage 1 --quote-only --json`;

console.log("Running:", cmd, "\n");
try {
  const out = execSync(cmd, { stdio: "pipe" }).toString();
  console.log("----- raw output -----");
  console.log(out);
  console.log("\nPASS: TWAK returned a BSC swap quote. Execution layer is viable.");
} catch (e) {
  console.error("FAIL:", e.message);
  if (e.stdout) console.error("stdout:", e.stdout.toString());
  if (e.stderr) console.error("stderr:", e.stderr.toString());
  console.error("\nIf this mentions credentials/auth, run:  npx --yes --package @trustwallet/cli twak setup");
}