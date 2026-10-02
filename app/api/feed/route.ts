import { NextResponse } from "next/server";
import { isPaused, readFeed } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [items, paused] = await Promise.all([readFeed(), isPaused()]);
  return NextResponse.json({ items, paused }, { headers: { "Cache-Control": "no-store" } });
}
