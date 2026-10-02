import { NextResponse } from "next/server";
import { download, MODEL, pollStatus, TERMINAL_FAILURES } from "@/lib/higgsfield";
import { deletePending, readPending, storeImage, writeDone } from "@/lib/store";
import type { DoneItem } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Advances one job by a single step. Any client that sees a pending card may call this,
 * so the wall keeps moving even if the submitter's browser is gone.
 */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const pending = await readPending(id);
  if (!pending) {
    // either already completed (the feed will show it) or expired
    return NextResponse.json({ status: "gone" });
  }

  try {
    const s = await pollStatus(pending.statusUrl);

    if (s.status === "completed" && s.imageUrl) {
      const { bytes, contentType } = await download(s.imageUrl);
      const imageUrl = await storeImage(id, bytes, contentType);
      const done: DoneItem = {
        kind: "done",
        id,
        prompt: pending.prompt,
        aspect: pending.aspect,
        createdAt: pending.createdAt,
        completedAt: new Date().toISOString(),
        imageUrl,
        model: MODEL,
      };
      await writeDone(done);
      await deletePending(id);
      return NextResponse.json({ status: "completed", item: done });
    }

    if (TERMINAL_FAILURES.has(s.status)) {
      await deletePending(id);
      return NextResponse.json({ status: s.status });
    }

    return NextResponse.json({ status: s.status });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Errore";
    console.error("job:", id, msg);
    return NextResponse.json({ status: "error", error: msg }, { status: 502 });
  }
}
