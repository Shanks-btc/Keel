// §7a — Agent Wallet Proof panel.
// Display only. NO private-key input, NO seed-phrase input, NO wallet onboarding.
// Keys are never stored here. Shows the registered wallet address and on-chain proof.

"use client";

import { Card, CardHeader } from "./ui/Card";
import { shortHash } from "../lib/format";

// Registered agent wallet and verified BSC transactions (hardcoded — display only).
const AGENT_WALLET       = "0x66af72374Eb358cf939bc1954b8F62EfcF08E10a";
const REGISTRATION_TX    = "0x006151e42ceb1b151ddcd7b172b9dd2087cbabbe7fbe3a58c63274c3fa6ac305";
const FIRST_SWAP_TX      = "0x99ef6856cd679a65a7d7877b97bd5a4f525b98b0b61a2589481f2a108e6d9854";

function LiveBadge() {
  return (
    <span
      style={{
        fontSize: "9px",
        fontWeight: 700,
        letterSpacing: "0.1em",
        color: "var(--green)",
        background: "var(--green)18",
        border: "1px solid var(--green)40",
        borderRadius: "3px",
        padding: "2px 5px",
      }}
    >
      LIVE
    </span>
  );
}

function ProofRow({
  label,
  value,
  href,
  note,
}: {
  label: string;
  value: string;
  href: string;
  note?: string;
}) {
  return (
    <div
      style={{
        paddingBottom: "10px",
        marginBottom: "10px",
        borderBottom: "1px solid var(--border)",
      }}
    >
      <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
        {label}
      </div>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        style={{
          fontSize: "12px",
          color: "var(--blue)",
          fontFamily: "monospace",
          textDecoration: "none",
          wordBreak: "break-all",
          display: "block",
        }}
      >
        {value} ↗
      </a>
      {note && (
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "2px", lineHeight: "1.3" }}>
          {note}
        </div>
      )}
    </div>
  );
}

interface Props {
  /** Last qualifying swap tx hash from the audit log, if available */
  lastQualifyingTxHash?: string | null;
}

export function AgentWalletProofCard({ lastQualifyingTxHash }: Props) {
  const qualifyingTx = lastQualifyingTxHash ?? FIRST_SWAP_TX;

  return (
    <Card>
      <CardHeader
        title="Agent Wallet Proof"
        subtitle="Registered identity — BSC on-chain proof"
        action={<LiveBadge />}
      />

      {/* Display-only notice */}
      <div
        style={{
          fontSize: "11px",
          color: "var(--amber)",
          background: "var(--amber)10",
          border: "1px solid var(--amber)30",
          borderRadius: "4px",
          padding: "6px 10px",
          marginBottom: "14px",
          lineHeight: "1.4",
        }}
      >
        Display only. No private-key input, no seed-phrase input, no wallet onboarding.
        Keys are never stored or processed here.
      </div>

      <ProofRow
        label="Registered agent wallet (BSC)"
        value={AGENT_WALLET}
        href={`https://bscscan.com/address/${AGENT_WALLET}`}
      />
      <ProofRow
        label="Registration transaction (BSC)"
        value={shortHash(REGISTRATION_TX)}
        href={`https://bscscan.com/tx/${REGISTRATION_TX}`}
        note="Full tx: 0x006151e4…ac305"
      />
      <div>
        <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
          Last qualifying swap (BSC)
        </div>
        <a
          href={`https://bscscan.com/tx/${qualifyingTx}`}
          target="_blank"
          rel="noopener noreferrer"
          style={{
            fontSize: "12px",
            color: "var(--blue)",
            fontFamily: "monospace",
            textDecoration: "none",
          }}
        >
          {shortHash(qualifyingTx)} ↗
        </a>
        <div style={{ fontSize: "10px", color: "var(--text-muted)", marginTop: "3px", lineHeight: "1.3" }}>
          minimum-risk qualifying attempt · BSC only · never Base/x402
        </div>
      </div>
    </Card>
  );
}
