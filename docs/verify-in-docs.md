# Keel — Verification Record (`verify-in-docs`)

This is the honest record of what was actually tested in practice and what was
not. Every integration is classified with one of:

- **confirmed** — tested successfully, real output observed.
- **confirmed in script but not yet integrated** — works in isolation, not yet
  wired into the agent.
- **partial** — partially exercised; some part returned, some did not.
- **risky** — attempted with an unclear/transient result; treat with caution.
- **unavailable / not tested** — not exercised at all.
- **fallback required** — needs an alternate path.
- **[VERIFY IN DOCS]** — must be re-run and recorded before relying on it.

**Honesty rule:** do not upgrade any item below to "confirmed" without a real
successful run. Where exact output is not recorded verbatim, that is stated, and
the canonical place to paste fresh raw output is `proofs/integration-results.md`.

Environment for all tests: Windows, Node `v24.14.0`, Python `3.14.5`.

---

## Integration status table

| # | Integration | Status |
|---|-------------|--------|
| 1 | CMC REST data | **confirmed** |
| 2 | CMC MCP | **unavailable / not tested** |
| 3 | Fear & Greed | **confirmed** |
| 4 | price / 1h / 24h change | **confirmed** |
| 5 | TWAK authentication | **confirmed** |
| 6 | TWAK quote path | **confirmed** |
| 7 | TWAK portfolio/balance path | **partial / risky** |
| 8 | TWAK tiny real swap | **unavailable / not tested (fund-gated)** |
| 9 | TWAK local signing behavior | **partial** (wallet+custody confirmed; live signing not exercised) |
| 10 | x402 paid call path | **partial** (client confirmed; paid call not executed) |
| 11 | x402 settlement chain/token | **confirmed (capability)** |
| 12 | BSC RPC / explorer proof | **partial / [VERIFY IN DOCS]** |
| 13 | BNB Agent SDK install | **confirmed** |
| 14 | BNB Agent SDK identity registration | **unavailable / not tested** |
| 15 | BNB Agent SDK network status | **confirmed** |
| 16 | token allowlist / eligible assets | **confirmed** |

---

## Detail per integration

### 1. CMC REST data — confirmed
Endpoint: `GET https://pro-api.coinmarketcap.com/v1/cryptocurrency/quotes/latest?symbol=ETH`
Header: `X-CMC_PRO_API_KEY`. Works on the **free Basic** tier.
Observed live in `keel.cjs` v0.2 (sample run): `ETH = $1719.30`.
Exact full JSON body not recorded verbatim — re-run and paste into
`proofs/integration-results.md` if a raw capture is needed.

### 2. CMC MCP — unavailable / not tested
Only the REST path was exercised. The MCP surface was never called or tested in
this chat. Do not claim MCP works. `[VERIFY IN DOCS]` if/when needed.

### 3. Fear & Greed — confirmed
Endpoint: `GET https://pro-api.coinmarketcap.com/v3/fear-and-greed/latest`
(same `X-CMC_PRO_API_KEY` header). Returned a live value on the free Basic tier
(sample: `F&G 23`). Code already handles its absence gracefully if a tier ever
omits it.

### 4. price / 1h / 24h change — confirmed
From `quotes/latest`: `quote.USD.price`, `quote.USD.percent_change_1h`,
`quote.USD.percent_change_24h`. Sample run: `1h 0.24%`, `24h 2.10%`. Used as the
risk-engine inputs.

### 5. TWAK authentication — confirmed
`twak init` read `TWAK_ACCESS_ID` + `TWAK_HMAC_SECRET` from environment and
saved credentials. Observed output: `Credentials saved from environment variables
to ~/.twak/credentials.json`. Subsequent authenticated commands succeeded, which
re-confirms auth.
Note: on Windows the `export ...` hint printed by the CLI is Linux syntax; the
working path is PowerShell `$env:VAR="..."` then `twak init`.

### 6. TWAK quote path — confirmed
Command form:
`twak swap <amt> <from> <to> --chain bsc --slippage <pct> --quote-only --json`
Sample (`5 USDT -> ETH`, bsc): returned fields
`input, output, minReceived, provider, priceImpact` with provider `LiquidMesh`,
`priceImpact 0`, `output ~0.002886 ETH`. Run both directly and inside
`keel.cjs` v0.2.

### 7. TWAK portfolio / balance path — partial / risky
`twak wallet status --json` → confirmed (returned wallet config:
`agentWallet: configured`, `keychainPassword: stored`, `chains: 25`).
`twak wallet address --chain bsc --json` → confirmed (returned BSC address).
`twak wallet balance --chain bsc --json` → **did NOT succeed**: returned
`{"error":"Could not fetch balances. Please try again later.","errorCode":"NETWORK_ERROR"}`.
This appeared transient (wallet is empty anyway), but a successful balance fetch
was **not** observed. Re-run and record a clean balance result before relying on
it. Marked **partial/risky**.

### 8. TWAK tiny real swap — unavailable / not tested
No real (non-quote) swap has been executed. This is fund-gated: it needs the
agent wallet funded. Execute form will be the quote command **with `--password`
instead of `--quote-only`**. Record the resulting tx hash into
`proofs/integration-results.md`. `[VERIFY IN DOCS]`.

### 9. TWAK local signing behavior — partial
Self-custody wallet was created successfully: sealed encrypted keystore in
`~/.twak`, password stored in the OS keychain, **no private key or seed exported
by design** (`twak wallet` exposes no export command — keys stay sealed). Wallet
creation messages observed: `Agent wallet created successfully`,
`Wallet registered with backend`, `Generated addresses for 25 chains`,
`Password saved to OS keychain`.
However, **actual signing of a live transaction has not been exercised** (that is
fund-gated, see #8). So self-custody storage is confirmed; end-to-end local
signing of a real swap is **not yet** confirmed.
Known quirk: `twak wallet create` throws a harmless libuv assertion on exit on
Windows (`Assertion failed: !(handle->flags & UV_HANDLE_CLOSING) ... src\win\async.c`)
**after** the work completes. It does not affect `price`/`swap`/`balance`.

### 10. x402 paid call path — partial
The x402 **client** is confirmed via `twak x402 info`: native x402 (V1 + V2) with
EIP-3009 + Permit2 signing; commands `quote` (read-only, no wallet),
`request` (pays), `info`. Options confirmed: `--max-payment <atomic>`
(`10000` = 0.01 USDC at 6dp), `--prefer-network base|bsc`,
`--prefer-method eip3009|permit2-exact`, `--yes`, `--json`.
A real **paid** `request` has **not** been executed (fund-gated). Planned live
form: `twak x402 request <url> --prefer-network base --max-payment 10000 --yes --json`.
`[VERIFY IN DOCS]` for the actual payment + settlement tx.

### 11. x402 settlement chain / token — confirmed (capability)
From `twak x402 info`: settlement can be restricted to **base** or **bsc**, and
`--max-payment 10000` corresponds to **0.01 USDC (6 decimals)**. For paying CMC,
the intended route is **Base / USDC**. This is a confirmed capability of the
client; not yet exercised with a real settlement.

### 12. BSC RPC / explorer proof — partial / [VERIFY IN DOCS]
`twak chains --json` confirmed **BSC** is supported (`key: bsc`, BNB Smart
Chain). The agent's BSC address resolves. But **no real tx hash exists yet**
(no live swap/registration has run), so explorer proof links cannot be shown
until live actions occur. Generate proof links once #8/#14 run; record in
`proofs/integration-results.md`.

### 13. BNB Agent SDK install — confirmed
`pip install bnbagent` succeeded on **Python 3.14.5** (wheels available for
cp314). Installed `bnbagent 0.3.6` with `web3 7.16.0`, `eth-account 0.13.7`, and
deps. One harmless warning: a `websockets.exe` script dir not on PATH —
irrelevant, the package is used as a library.

### 14. BNB Agent SDK identity registration — unavailable / not tested
`register_agent` (an on-chain write; gas-free via paymaster) has **not** been
run. Only network resolution (#15) was tested. `[VERIFY IN DOCS]`.

### 15. BNB Agent SDK network status — confirmed
`from bnbagent import config; config.resolve_network('bsc-mainnet')` returned:
`registry: 0x8004A169FB4a3325136EB29fA0ceB6D2e539a432 | gas-free: True`.
Mainnet registry resolves and the paymaster (gas-free) flag is true.

### 16. token allowlist / eligible assets — confirmed
The chosen allowlist (ETH, CAKE, LINK volatile; USDT, USDC, USD1, FDUSD stables)
was checked against the supported BEP-20 asset universe and all are present.
**BNB, BTC, BTCB are NOT in the tradeable set** — BNB is a gas reserve only. The
UI and agent must hold/show only allowlist assets.

---

## Confirmed reference facts (for reuse in code)

- **Agent wallet (BSC):** `0x66af72374Eb358cf939bc1954b8F62EfcF08E10a`
  (created `2026-06-15T13:25:39Z`; password in OS keychain; sealed keystore in
  `~/.twak`).
- **TWAK command surfaces confirmed available:** `chains`, `compete`
  (`register`, `status`), `x402` (`request`, `quote`, `info`), `erc8004`
  (`register`, `set-uri`, `set-metadata`, `get-metadata`, `show`), `wallet`
  (`create`, `address`, `addresses`, `balance`, `keychain`, `connect`, `status`,
  `portfolio`, `sign-message`, `register`).
- **TWAK quote fields:** `input`, `output`, `minReceived`, `provider`,
  `priceImpact`.
- **Chain flag:** `--chain bsc`.
- **CMC headers/endpoints:** `X-CMC_PRO_API_KEY`; `quotes/latest`;
  `v3/fear-and-greed/latest`.

## What is NOT recorded verbatim
Full raw JSON bodies for CMC `quotes/latest`, the exact swap-quote JSON, and the
`twak wallet status` full payload were summarized, not captured byte-for-byte. If
byte-exact evidence is required, re-run each command and paste the raw output into
`proofs/integration-results.md`.