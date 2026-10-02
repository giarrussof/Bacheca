import { NextResponse } from "next/server";
import { quota } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const device = new URL(req.url).searchParams.get("device") || "anon";
  return NextResponse.json(await quota(device), { headers: { "Cache-Control": "no-store" } });
}
