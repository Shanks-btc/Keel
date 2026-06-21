import { NextResponse } from "next/server";
import { resolve } from "path";

export const dynamic = "force-dynamic";

export async function GET() {
  const isLive = process.env["I_UNDERSTAND_REAL_FUNDS"] === "yes";
  const dataDir = process.env["KEEL_DATA_DIR"] ?? resolve(process.cwd(), "../../data");

  return NextResponse.json({
    ok: true,
    mode: isLive ? "LIVE" : "SAFE",
    dataDir,
    timestamp: new Date().toISOString(),
  });
}
