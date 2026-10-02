"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { FeedItem } from "@/lib/types";

function AdminInner() {
  const key = useSearchParams().get("key") || "";
  const [items, setItems] = useState<FeedItem[]>([]);
  const [paused, setPaused] = useState(false);
  const [msg, setMsg] = useState("");

  const load = useCallback(async () => {
    const r = await fetch("/api/feed", { cache: "no-store" });
    const data = (await r.json()) as { items: FeedItem[]; paused: boolean };
    setItems(data.items);
    setPaused(data.paused);
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 5000);
    return () => clearInterval(t);
  }, [load]);

  async function call(body: object) {
    const r = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-admin-key": key },
      body: JSON.stringify(body),
    });
    const data = await r.json();
    if (!r.ok) setMsg(data.error || "Errore");
    else setMsg("");
    await load();
  }

  if (!key) return <main className="admin"><p>Manca la chiave (?key=…).</p></main>;

  return (
    <main className="admin">
      <h1>Controllo bacheca</h1>
      <div className="row">
        <button className={`btn ${paused ? "solid" : ""}`} onClick={() => call({ action: "pause", paused: !paused })}>
          {paused ? "Riprendi generazioni" : "Sospendi generazioni"}
        </button>
        <span style={{ color: paused ? "var(--signal)" : "var(--ink-2)" }}>
          {paused ? "In pausa: nessun prompt viene accettato." : "Attiva."}
        </span>
        <span>{items.length} elementi</span>
        {msg && <span style={{ color: "var(--danger)" }}>{msg}</span>}
      </div>
      <div className="admin-grid">
        {items.map((it) => (
          <div key={it.id}>
            <div className="frame">
              {it.kind === "done" ? <img src={it.imageUrl} alt="" loading="lazy" /> : null}
            </div>
            <p className="caption">{it.prompt}</p>
            <button
              className="btn danger"
              onClick={() => {
                if (confirm("Rimuovere questa immagine dalla bacheca?")) call({ action: "delete", id: it.id });
              }}
            >
              Rimuovi
            </button>
          </div>
        ))}
      </div>
    </main>
  );
}

export default function Admin() {
  return (
    <Suspense>
      <AdminInner />
    </Suspense>
  );
}
