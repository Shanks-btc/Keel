// Keel v0.2 - decision loop with real CMC market signal. DRY RUN.  node keel.cjs
const { execSync } = require("node:child_process");

const TWAK    = "npx --yes --package @trustwallet/cli twak";
const CHAIN   = "bsc";
const VOL     = "ETH";
const STABLE  = "USDT";
const POLICY  = { eBase: 0.80, slippagePct: 1 };
const CMC_KEY = process.env.CMC_API_KEY;

function twak(a) { return execSync(`${TWAK} ${a}`, { stdio: "pipe", encoding: "utf8" }); }
function asJson(s) { const i = s.indexOf("{"), j = s.lastIndexOf("}"); if (i < 0) throw new Error("no JSON"); return JSON.parse(s.slice(i, j + 1)); }
function fmt(x) { return x == null ? "n/a" : Number(x).toFixed(2); }

async function perceive() {
  if (!CMC_KEY) return { price: null };
  const h = { headers: { "X-CMC_PRO_API_KEY": CMC_KEY } };
  const r = await fetch(`https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=${VOL}`, h);
  const q = (await r.json())?.data?.[VOL]?.quote?.USD;
  let fg = null;
  try { fg = (await (await fetch("https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest", h)).json())?.data?.value ?? null; } catch {}
  return { price: q?.price, c1h: q?.percent_change_1h, c24h: q?.percent_change_24h, fg };
}
function score(m) {
  let r = 0;
  if (m.c1h  != null) r += Math.min(1, Math.abs(m.c1h)  / 3)  * 0.4;
  if (m.c24h != null) r += Math.min(1, Math.abs(m.c24h) / 10) * 0.4;
  if (m.fg   != null) r += Math.max(0, (m.fg - 60) / 40)      * 0.2;
  return Math.max(0, Math.min(1, r));
}
function pickMode(R) {
  if (R < 0.33) return { name: "RISK-ON",  exposure: POLICY.eBase };
  if (R < 0.66) return { name: "NEUTRAL",  exposure: 0.45 };
  return                { name: "RISK-OFF", exposure: 0.18 };
}

(async function run() {
  console.log("=== KEEL v0.2 - decision loop (DRY RUN, real CMC signal) ===\n");
  const m = await perceive();
  if (m.price == null) { console.log('No market data. Set your key:  $env:CMC_API_KEY="..."  then re-run.'); return; }
  const R = score(m), mode = pickMode(R);
  console.log(`market : ${VOL} = $${fmt(m.price)}   1h ${fmt(m.c1h)}%   24h ${fmt(m.c24h)}%   F&G ${m.fg ?? "n/a"}`);
  console.log(`risk R : ${R.toFixed(2)}`);
  console.log(`MODE   : ${mode.name}  -> target ${Math.round(mode.exposure * 100)}% ${VOL}, rest ${STABLE}`);
  try {
    const from = mode.name === "RISK-OFF" ? VOL : STABLE, to = mode.name === "RISK-OFF" ? STABLE : VOL;
    const q = asJson(twak(`swap 5 ${from} ${to} --chain ${CHAIN} --slippage ${POLICY.slippagePct} --quote-only --json`));
    console.log(`decision: would rotate 5 ${from} -> ${to}`);
    console.log(`quote  : impact ${q.priceImpact}  out ${q.output}  minRecv ${q.minReceived}  (${q.provider})`);
  } catch (e) { console.log("quote error:", (e.stdout || e.message || "").toString().slice(0, 300)); }
  console.log("\n(DRY RUN complete - nothing executed.)");
})();