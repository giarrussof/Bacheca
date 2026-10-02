import { put, list, del } from "@vercel/blob";
import type { DoneItem, PendingItem, FeedItem } from "./types";

/*
  Storage layout (Vercel Blob, one store):
    gen/<id>.json      immutable metadata of a finished generation
    gen/<id>.jpg|png   the image itself (downloaded from Higgsfield)
    pending/<id>.json  immutable metadata of a job still running
    admin/paused       exists  => generation is paused
    rl/<device>        touched on every accepted request; uploadedAt = last request
  Everything mutable is expressed as "a file exists / when was it written",
  never as file contents, so CDN caching of public blobs can never return stale state.
*/

const PENDING_TTL_MS = 10 * 60 * 1000;

// in-memory cache of immutable JSON blobs, per serverless instance
const jsonCache = new Map<string, FeedItem>();

async function readJson<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`blob read ${r.status}`);
  return (await r.json()) as T;
}

async function readCached(pathname: string, url: string): Promise<FeedItem | null> {
  const hit = jsonCache.get(pathname);
  if (hit) return hit;
  try {
    const item = await readJson<FeedItem>(url);
    jsonCache.set(pathname, item);
    return item;
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      out[idx] = await fn(items[idx]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

export async function writePending(item: PendingItem) {
  await put(`pending/${item.id}.json`, JSON.stringify(item), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
}

export async function readPending(id: string): Promise<PendingItem | null> {
  const { blobs } = await list({ prefix: `pending/${id}.json`, limit: 1 });
  if (!blobs.length) return null;
  const item = await readCached(blobs[0].pathname, blobs[0].url);
  return item && item.kind === "pending" ? item : null;
}

export async function deletePending(id: string) {
  const { blobs } = await list({ prefix: `pending/${id}.json`, limit: 1 });
  if (blobs.length) await del(blobs[0].url);
  jsonCache.delete(`pending/${id}.json`);
}

export async function storeImage(id: string, bytes: ArrayBuffer, contentType: string): Promise<string> {
  const ext = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  const blob = await put(`gen/${id}.${ext}`, bytes, {
    access: "public",
    addRandomSuffix: false,
    contentType,
  });
  return blob.url;
}

export async function writeDone(item: DoneItem) {
  await put(`gen/${item.id}.json`, JSON.stringify(item), {
    access: "public",
    addRandomSuffix: false,
    contentType: "application/json",
  });
  jsonCache.set(`gen/${item.id}.json`, item);
}

export async function deleteDone(id: string) {
  const { blobs } = await list({ prefix: `gen/${id}.`, limit: 10 });
  await Promise.all(blobs.map((b) => del(b.url)));
  jsonCache.delete(`gen/${id}.json`);
}

/** Newest first. Pending items older than PENDING_TTL are treated as dead and hidden. */
export async function readFeed(limit = 400): Promise<FeedItem[]> {
  const [gen, pending] = await Promise.all([
    list({ prefix: "gen/", limit: 1000 }),
    list({ prefix: "pending/", limit: 200 }),
  ]);
  const now = Date.now();
  const jsonBlobs = [
    ...gen.blobs.filter((b) => b.pathname.endsWith(".json")),
    ...pending.blobs.filter(
      (b) => b.pathname.endsWith(".json") && now - new Date(b.uploadedAt).getTime() < PENDING_TTL_MS,
    ),
  ]
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
    .slice(0, limit);

  const items = await mapLimit(jsonBlobs, 24, (b) => readCached(b.pathname, b.url));
  return (items.filter(Boolean) as FeedItem[]).sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export async function isPaused(): Promise<boolean> {
  const { blobs } = await list({ prefix: "admin/paused", limit: 1 });
  return blobs.length > 0;
}

export async function setPaused(paused: boolean) {
  if (paused) {
    await put("admin/paused", "1", { access: "public", addRandomSuffix: false, allowOverwrite: true });
  } else {
    const { blobs } = await list({ prefix: "admin/paused", limit: 1 });
    if (blobs.length) await del(blobs[0].url);
  }
}

/**
 * Per-device quota. Each accepted request writes quota/<event>/<device>/<n>; counting the
 * files gives the number used. Changing EVENT_ID starts everyone from zero again.
 * Returns { used, max }. max = 0 means unlimited.
 */
export async function quota(device: string): Promise<{ used: number; max: number }> {
  const max = Number(process.env.MAX_PER_DEVICE ?? 0);
  const dev = device.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const ev = (process.env.EVENT_ID || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  const { blobs } = await list({ prefix: `quota/${ev}/${dev}/`, limit: 100 });
  return { used: blobs.length, max };
}

export async function consumeQuota(device: string) {
  const dev = device.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64);
  const ev = (process.env.EVENT_ID || "default").replace(/[^a-zA-Z0-9_-]/g, "");
  await put(`quota/${ev}/${dev}/${Date.now()}`, "1", { access: "public", addRandomSuffix: false });
}

/** Returns seconds the caller must still wait, or 0 if allowed (and records the hit). */
export async function rateLimit(device: string, minIntervalSec: number): Promise<number> {
  const key = `rl/${device.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 64)}`;
  const { blobs } = await list({ prefix: key, limit: 1 });
  if (blobs.length) {
    const elapsed = (Date.now() - new Date(blobs[0].uploadedAt).getTime()) / 1000;
    if (elapsed < minIntervalSec) return Math.ceil(minIntervalSec - elapsed);
  }
  await put(key, String(Date.now()), { access: "public", addRandomSuffix: false, allowOverwrite: true });
  return 0;
}
