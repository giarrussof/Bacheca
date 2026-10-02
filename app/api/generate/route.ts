import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { submit } from "@/lib/higgsfield";
import { consumeQuota, isPaused, quota, rateLimit, writePending } from "@/lib/store";
import { ASPECTS, type Aspect } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MIN_INTERVAL = Number(process.env.RATE_LIMIT_SECONDS || 20);
const MAX_PROMPT = 400;

export async function POST(req: Request) {
  let body: { prompt?: string; aspect?: string; device?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Richiesta non valida" }, { status: 400 });
  }

  const prompt = (body.prompt || "").trim().replace(/\s+/g, " ");
  if (prompt.length < 3) return NextResponse.json({ error: "Scrivi qualcosa di più" }, { status: 400 });
  if (prompt.length > MAX_PROMPT)
    return NextResponse.json({ error: `Massimo ${MAX_PROMPT} caratteri` }, { status: 400 });

  const aspect: Aspect = ASPECTS.includes(body.aspect as Aspect) ? (body.aspect as Aspect) : "4:3";
  const device = body.device || "anon";

  if (await isPaused()) {
    return NextResponse.json({ error: "La bacheca è in pausa" }, { status: 503 });
  }

  const q = await quota(device);
  if (q.max > 0 && q.used >= q.max) {
    return NextResponse.json(
      { error: `Hai usato le tue ${q.max} immagini. Grazie per aver partecipato.`, used: q.used, max: q.max },
      { status: 403 },
    );
  }

  const wait = await rateLimit(device, MIN_INTERVAL);
  if (wait > 0) {
    return NextResponse.json({ error: `Aspetta ancora ${wait} s` }, { status: 429 });
  }

  try {
    const { requestId, statusUrl } = await submit(prompt, aspect);
    const id = `${Date.now().toString(36)}-${randomUUID().slice(0, 8)}`;
    const item = {
      kind: "pending" as const,
      id,
      prompt,
      aspect,
      requestId,
      statusUrl,
      createdAt: new Date().toISOString(),
    };
    await Promise.all([writePending(item), consumeQuota(device)]);
    return NextResponse.json({ item, used: q.used + 1, max: q.max });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    console.error("generate:", msg);
    return NextResponse.json({ error: "Generazione non avviata: " + msg }, { status: 502 });
  }
}
