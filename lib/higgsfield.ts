import type { Aspect } from "./types";

/*
  Higgsfield REST API (docs.higgsfield.ai, verified 2026-09-29):
    POST https://api.higgsfield.ai/<model>          -> { status:"queued", request_id, status_url, cancel_url }
    GET  <status_url>                                -> { status, images?: [{url}] }
  Auth header on both:  Authorization: Key <KEY_ID>:<KEY_SECRET>
  Terminal statuses: completed | failed | nsfw | canceled
*/

export const MODEL = process.env.HF_MODEL || "higgsfield-ai/soul/v2/standard";
const BASE = "https://api.higgsfield.ai";

function authHeader(): string {
  const id = process.env.HF_API_KEY_ID;
  const secret = process.env.HF_API_KEY_SECRET;
  if (!id || !secret) throw new Error("HF_API_KEY_ID / HF_API_KEY_SECRET non configurate");
  return `Key ${id}:${secret}`;
}

export interface SubmitResult {
  requestId: string;
  statusUrl: string;
}

export async function submit(prompt: string, aspect: Aspect): Promise<SubmitResult> {
  const r = await fetch(`${BASE}/${MODEL}`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      prompt,
      aspect_ratio: aspect,
      resolution: process.env.HF_RESOLUTION || "720p",
      enhance_prompt: (process.env.HF_ENHANCE_PROMPT ?? "true") === "true",
      batch_size: 1,
    }),
    cache: "no-store",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Higgsfield ${r.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { request_id: string; status_url: string };
  if (!data.request_id || !data.status_url) throw new Error(`Risposta inattesa: ${text.slice(0, 300)}`);
  return { requestId: data.request_id, statusUrl: data.status_url };
}

export interface JobStatus {
  status: string; // queued | in_progress | completed | failed | nsfw | canceled
  imageUrl?: string;
}

export async function pollStatus(statusUrl: string): Promise<JobStatus> {
  const r = await fetch(statusUrl, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
    cache: "no-store",
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`Higgsfield status ${r.status}: ${text.slice(0, 300)}`);
  const data = JSON.parse(text) as { status: string; images?: { url: string }[] };
  if (data.status === "completed") {
    const url = data.images?.[0]?.url;
    if (!url) throw new Error("completed senza immagine");
    return { status: "completed", imageUrl: url };
  }
  return { status: data.status };
}

export const TERMINAL_FAILURES = new Set(["failed", "nsfw", "canceled"]);

export async function download(url: string): Promise<{ bytes: ArrayBuffer; contentType: string }> {
  const r = await fetch(url, { cache: "no-store" });
  if (!r.ok) throw new Error(`download ${r.status}`);
  return { bytes: await r.arrayBuffer(), contentType: r.headers.get("content-type") || "image/jpeg" };
}
