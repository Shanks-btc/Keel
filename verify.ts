// Keel integration verification (consolidated). Run: npx tsx verify.ts
// Real-fund checks are OFF by default. Add --x402 and/or --swap to enable them.
import "dotenv/config";
import axios from "axios";
import { ethers } from "ethers";
import { execSync } from "node:child_process";

const args = process.argv.slice(2);
const want = (f: string) => args.includes(f);
const L = (s: string) => console.log(s);
const OK = (s: string) => console.log("  PASS " + s);
const NO = (s: string) => console.log("  FAIL " + s);
const st = (e: any) => (e?.response?.status ? `HTTP ${e.response.status}` : (e?.message ?? e));
const sh = (c: string) => execSync(c, { stdio: "pipe" }).toString();

async function cmcRest() {
  L("\n[1] CMC REST  (Fear&Greed + quotes)  [needs CMC_API_KEY]");
  const KEY = process.env.CMC_API_KEY;
  if (!KEY) return NO("CMC_API_KEY missing in .env");
  const h = { headers: { "X-CMC_PRO_API_KEY": KEY } };
  const BASE = "https://pro-api.coinmarketcap.com";
  try { const fg = await axios.get(`${BASE}/v3/fear-and-greed/latest`, h); OK(("Fear&Greed " + JSON.stringify(fg.data?.data)).slice(0, 180)); }
  catch (e: any) { NO("Fear&Greed: " + st(e)); }
  try { const q = await axios.get(`${BASE}/v1/cryptocurrency/quotes/latest?symbol=ETH,LINK,USDT`, h);
    for (const s of ["ETH", "LINK", "USDT"]) OK(`${s} = $${q.data?.data?.[s]?.quote?.USD?.price}`); }
  catch (e: any) { NO("quotes: " + st(e)); }
}

async function cmcMcp() {
  L("\n[2] CMC MCP  tools/list discovery  [needs CMC_API_KEY]");
  const KEY = process.env.CMC_API_KEY;
  if (!KEY) return NO("CMC_API_KEY missing");
  try {
    const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
    const { StreamableHTTPClientTransport } = await import("@modelcontextprotocol/sdk/client/streamableHttp.js");
    const t = new StreamableHTTPClientTransport(new URL("https://mcp.coinmarketcap.com/mcp"),
      { requestInit: { headers: { "X-CMC-MCP-API-KEY": KEY } } } as any);
    const c = new Client({ name: "keel-verify", version: "0.0.1" });
    await c.connect(t);
    const { tools } = await c.listTools();
    OK(`${tools.length} tools discovered:`);
    for (const x of tools) L("       - " + x.name);
    await c.close();
  } catch (e: any) { NO("MCP: " + (e?.message ?? e) + "  (fallback: REST in [1])"); }
}

function twakAuth() {
  L("\n[3] TWAK auth + REAL command discovery  [needs `twak init` done]");
  try { OK("twak version " + sh("twak --version").trim()); }
  catch { return NO("twak not found -> npm i -g @trustwallet/cli ; twak init"); }
  try { L("  ----- twak --help (use these exact command names below) -----"); L(sh("twak --help")); }
  catch (e: any) { NO("help: " + st(e)); }
}

function twakPortfolio() {
  L("\n[4] TWAK portfolio (read-only)");
  for (const c of ["twak wallet portfolio --json", "twak portfolio --json", "twak wallet balance --json"]) {
    try { const o = sh(c); OK("via " + c); L(o.slice(0, 800)); return; } catch {}
  }
  NO("no candidate portfolio command worked — use the real one from [3]");
}

function twakQuote() {
  L("\n[5] TWAK quote-only (no funds moved)");
  const c = process.env.TWAK_QUOTE_CMD || "twak swap --from USDT --to ETH --amount 5 --quote-only --json";
  try { const o = sh(c); OK("via " + c); L(o.slice(0, 800)); }
  catch (e: any) { NO("quote: " + st(e) + "  (set $env:TWAK_QUOTE_CMD to the real cmd from [3])"); }
}

async function bscProof() {
  L("\n[6] BSC proof via public RPC (read-only)");
  const RPC = process.env.BSC_RPC || "https://bsc-dataseed.binance.org";
  try {
    const p = new ethers.JsonRpcProvider(RPC);
    const net = await p.getNetwork(); OK(`RPC chainId=${net.chainId} (expect 56)`);
    const token = process.env.PROOF_TOKEN_ADDRESS || "0x55d398326f99059fF775485246999027B3197955";
    const code = await p.getCode(token); (code && code !== "0x") ? OK(`token ${token} valid`) : NO(`token ${token} no code`);
    const tx = process.env.PROOF_TX_HASH;
    if (tx) { const r = await p.getTransactionReceipt(tx); L(r ? `  PASS receipt status=${r.status} block=${r.blockNumber}` : "  note: tx not found"); }
  } catch (e: any) { NO("RPC: " + (e?.message ?? e)); }
}

async function x402() {
  L("\n[7] x402 paid call  (REAL FUNDS ~$0.01 USDC on Base)");
  if (!want("--x402")) return L("  skipped — add --x402 and set X402_WALLET_PRIVATE_KEY (throwaway wallet) to run");
  const PK = process.env.X402_WALLET_PRIVATE_KEY as `0x${string}` | undefined;
  if (!PK || PK === "0x") return NO("X402_WALLET_PRIVATE_KEY missing");
  try {
    const { wrapAxiosWithPayment, x402Client } = await import("@x402/axios");
    const { ExactEvmScheme, toClientEvmSigner } = await import("@x402/evm");
    const { privateKeyToAccount } = await import("viem/accounts");
    const { createWalletClient, http } = await import("viem");
    const { base } = await import("viem/chains");
    const acct = privateKeyToAccount(PK);
    const wallet = createWalletClient({ account: acct, chain: base, transport: http() });
    const client = x402Client([ExactEvmScheme(toClientEvmSigner(wallet))]);
    const api = wrapAxiosWithPayment(axios.create(), client);
    const r = await api.get("https://pro-api.coinmarketcap.com/x402/v1/dex/search?q=bnb");
    OK("paid call status " + r.status + " — x402 safe for the loop");
  } catch (e: any) { NO("x402: " + (e?.message ?? e) + "  (no-funds FAIL is expected; then keep x402 out of loop)"); }
}

function twakSwap() {
  L("\n[8] TWAK tiny REAL swap");
  if (!want("--swap")) return L("  skipped — add --swap AND set $env:I_UNDERSTAND_REAL_FUNDS='yes' to run");
  if (process.env.I_UNDERSTAND_REAL_FUNDS !== "yes") return NO("set I_UNDERSTAND_REAL_FUNDS=yes to run");
  const c = process.env.TWAK_SWAP_CMD || "twak swap --from USDT --to ETH --amount 1 --slippage 0.01 --json";
  try { const o = sh(c); OK("swap submitted"); L(o.slice(0, 800)); const m = o.match(/0x[a-fA-F0-9]{64}/); if (m) L("  tx https://bscscan.com/tx/" + m[0]); }
  catch (e: any) { NO("swap: " + st(e)); }
}

(async () => {
  L("=== Keel integration verification ===");
  await cmcRest(); await cmcMcp(); twakAuth(); twakPortfolio(); twakQuote(); await bscProof(); await x402(); twakSwap();
  L("\n=== done — record results in proofs/integration-results.md ===");
})();
