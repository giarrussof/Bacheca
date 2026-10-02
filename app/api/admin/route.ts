import { NextResponse } from "next/server";
import { deleteDone, deletePending, isPaused, setPaused } from "@/lib/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function authorized(req: Request): boolean {
  const key = process.env.ADMIN_KEY;
  if (!key) return false;
  return req.headers.get("x-admin-key") === key;
}

export async function POST(req: Request) {
  if (!authorized(req)) return NextResponse.json({ error: "Non autorizzato" }, { status: 401 });
  const body = (await req.json()) as { action: string; id?: string; paused?: boolean };

  if (body.action === "pause") {
    await setPaused(Boolean(body.paused));
    return NextResponse.json({ paused: await isPaused() });
  }
  if (body.action === "delete" && body.id) {
    await Promise.all([deleteDone(body.id), deletePending(body.id)]);
    return NextResponse.json({ ok: true });
  }
  return NextResponse.json({ error: "Azione sconosciuta" }, { status: 400 });
}
