// Server-side API route — reads persisted agent state and audit log from disk.
// Uses fs directly (no @keel/agent import) to avoid cross-package bundling issues.
// Types are from @keel/shared (already a dependency of this workspace).

import { NextResponse } from "next/server";
import { readFileSync } from "fs";
import { join, resolve } from "path";
import type { AgentPersistentState, AuditEntry } from "@keel/shared";

export const dynamic = "force-dynamic";

// Data dir: env override → ../../data relative to apps/web CWD (repo root/data)
const DATA_DIR = process.env.KEEL_DATA_DIR ?? resolve(process.cwd(), "../../data");

function readState(): AgentPersistentState | null {
  try {
    const raw = readFileSync(join(DATA_DIR, "agent-state.json"), "utf8");
    return JSON.parse(raw) as AgentPersistentState;
  } catch {
    return null;
  }
}

function readAudit(): AuditEntry[] {
  try {
    const raw = readFileSync(join(DATA_DIR, "audit.jsonl"), "utf8");
    return raw
      .split("\n")
      .filter(Boolean)
      .map((line) => JSON.parse(line) as AuditEntry);
  } catch {
    return [];
  }
}

export async function GET() {
  const state = readState();
  const audit = readAudit();
  const lastEntry = audit.length > 0 ? audit[audit.length - 1] : null;

  return NextResponse.json({
    ok: true,
    state,
    lastAuditEntry: lastEntry,
    totalCycles: audit.length,
  });
}
