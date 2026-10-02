"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ASPECTS, aspectRatioCss, type Aspect, type FeedItem } from "@/lib/types";

const FEED_EVERY_MS = 4000;
const JOB_EVERY_MS = 3000;

function deviceId(): string {
  try {
    const k = "bacheca-device";
    let v = localStorage.getItem(k);
    if (!v) {
      v = Math.random().toString(36).slice(2) + Date.now().toString(36);
      localStorage.setItem(k, v);
    }
    return v;
  } catch {
    return "anon";
  }
}

function timeLabel(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}

/* icons for the ratio selector: tiny rectangles with the real proportion */
const RATIO_ICON: Record<Aspect, [number, number]> = {
  "1:1": [16, 16],
  "4:3": [18, 13.5],
  "3:4": [13.5, 18],
  "16:9": [20, 11.25],
};

export default function Wall() {
  const [items, setItems] = useState<FeedItem[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [paused, setPaused] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState<Aspect>("4:3");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; kind: "err" | "signal" | "" }>({ text: "", kind: "" });
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [quota, setQuota] = useState<{ used: number; max: number } | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // ---- feed polling ----
  const refresh = useCallback(async () => {
    try {
      const r = await fetch("/api/feed", { cache: "no-store" });
      if (!r.ok) return;
      const data = (await r.json()) as { items: FeedItem[]; paused: boolean };
      setPaused(data.paused);
      setItems((prev) => {
        // keep locally-known pending items that the server list may not show yet (eventual consistency)
        const serverIds = new Set(data.items.map((i) => i.id));
        const recentLocal = prev.filter(
          (p) => p.kind === "pending" && !serverIds.has(p.id) && Date.now() - new Date(p.createdAt).getTime() < 60_000,
        );
        return [...recentLocal, ...data.items].sort(
          (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
        );
      });
      setLoaded(true);
    } catch {
      /* transient */
    }
  }, []);

  useEffect(() => {
    refresh();
    fetch(`/api/quota?device=${deviceId()}`, { cache: "no-store" })
      .then((r) => r.json())
      .then(setQuota)
      .catch(() => {});
    const t = setInterval(refresh, FEED_EVERY_MS);
    return () => clearInterval(t);
  }, [refresh]);

  // ---- advance pending jobs ----
  useEffect(() => {
    const pendingIds = items.filter((i) => i.kind === "pending").map((i) => i.id);
    if (!pendingIds.length) return;
    let cancelled = false;
    const tick = async () => {
      for (const id of pendingIds) {
        if (cancelled) return;
        try {
          const r = await fetch(`/api/job/${id}`, { cache: "no-store" });
          const data = (await r.json()) as { status: string; item?: FeedItem };
          if (data.status === "completed" && data.item) {
            const done = data.item;
            setRevealed((s) => new Set(s).add(done.id));
            setItems((prev) => prev.map((p) => (p.id === done.id ? done : p)));
          } else if (["failed", "nsfw", "canceled", "gone"].includes(data.status)) {
            setItems((prev) => prev.filter((p) => p.id !== id));
            if (data.status === "nsfw") setNote({ text: "Immagine bloccata dal filtro contenuti.", kind: "err" });
            else if (data.status !== "gone") setNote({ text: "Generazione non riuscita. Riprova.", kind: "err" });
          }
        } catch {
          /* retry next tick */
        }
      }
    };
    const t = setInterval(tick, JOB_EVERY_MS);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, [items]);

  // ---- submit ----
  const send = useCallback(async () => {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setNote({ text: "", kind: "" });
    try {
      const r = await fetch("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text, aspect, device: deviceId() }),
      });
      const data = (await r.json()) as { item?: FeedItem; error?: string; used?: number; max?: number };
      if (typeof data.used === "number" && typeof data.max === "number") setQuota({ used: data.used, max: data.max });
      if (!r.ok || !data.item) {
        setNote({ text: data.error || "Errore", kind: "err" });
      } else {
        const item = data.item;
        setItems((prev) => [item, ...prev]);
        setPrompt("");
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    } catch {
      setNote({ text: "Connessione assente. Riprova.", kind: "err" });
    } finally {
      setBusy(false);
      inputRef.current?.focus();
    }
  }, [prompt, aspect, busy]);

  // autosize the textarea
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
  }, [prompt]);

  const pendingCount = items.filter((i) => i.kind === "pending").length;
  const exhausted = !!quota && quota.max > 0 && quota.used >= quota.max;
  const left = quota && quota.max > 0 ? quota.max - quota.used : null;

  return (
    <main>
      <header className="bar">
        <div className="bar-inner">
          <div className="brand">
            <img className="unipv" src="/brand/unipv.png" alt="Università di Pavia" />
          </div>
          <textarea
            ref={inputRef}
            className="prompt"
            rows={1}
            maxLength={400}
            placeholder="Descrivi un'immagine che vorresti vedere"
            value={prompt}
            autoFocus
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            aria-label="Testo dell'immagine da generare"
          />
          <div className="controls">
            <div className="ratios" role="group" aria-label="Formato">
              {ASPECTS.map((a) => {
                const [w, h] = RATIO_ICON[a];
                return (
                  <button
                    key={a}
                    type="button"
                    className="ratio"
                    aria-pressed={aspect === a}
                    aria-label={`Formato ${a}`}
                    title={a}
                    onClick={() => setAspect(a)}
                  >
                    <i style={{ width: w, height: h }} />
                  </button>
                );
              })}
            </div>
            <button type="button" className="go" disabled={busy || paused || exhausted || !prompt.trim()} onClick={send}>
              {busy ? "Invio…" : "Genera"}
            </button>
          </div>
        </div>
        <p className={`note ${note.kind}`} aria-live="polite">
          {paused
            ? "La bacheca è in pausa."
            : exhausted
              ? `Hai usato le tue ${quota!.max} immagini. Grazie per aver partecipato.`
              : note.text ||
                [pendingCount ? `${pendingCount} in arrivo` : "", left !== null ? `${left} ${left === 1 ? "immagine rimasta" : "immagini rimaste"}` : ""]
                  .filter(Boolean)
                  .join(" · ")}
        </p>
      </header>

      {loaded && items.length === 0 ? (
        <p className="empty">Nessuna immagine ancora. Scrivi la prima.</p>
      ) : (
        <section className="wall" aria-live="polite">
          {items.map((it) =>
            it.kind === "pending" ? (
              <article key={it.id} className="card pending">
                <div className="frame" style={{ aspectRatio: aspectRatioCss(it.aspect) }}>
                  <p className="caption">{it.prompt}</p>
                </div>
                <div className="meta">in arrivo</div>
              </article>
            ) : (
              <article key={it.id} className={`card ${revealed.has(it.id) ? "reveal" : ""}`}>
                <div className="frame" style={{ aspectRatio: aspectRatioCss(it.aspect) }}>
                  <img src={it.imageUrl} alt={it.prompt} loading="lazy" decoding="async" />
                </div>
                <p className="caption">{it.prompt}</p>
                <div className="meta">{timeLabel(it.completedAt)}</div>
              </article>
            ),
          )}
        </section>
      )}
      <footer className="credits">
        <span className="date">10 ottobre 2026</span>
        <img
          src="/brand/crediti.png"
          alt="Un evento di I Grandi Maestri dell'Università di Pavia. Con il patrocinio del Comune di Pavia. Con la partecipazione del Sistema Museale di Ateneo. Con il contributo di Regione Lombardia."
        />
      </footer>
    </main>
  );
}
