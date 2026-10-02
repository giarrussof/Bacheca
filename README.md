# Bacheca — installazione pubblica con Higgsfield

Web app Next.js: barra del prompt in alto, parete di tutte le immagini generate sotto,
aggiornata in tempo reale. Le immagini vengono generate via API Higgsfield e archiviate
in modo permanente su Vercel Blob.

## Struttura
- `app/page.tsx`        pagina pubblica (PC in sala)
- `app/admin/page.tsx`  pannello di controllo: `/admin?key=<ADMIN_KEY>`
- `app/api/generate`    invia il prompt a Higgsfield (pausa + freno per dispositivo)
- `app/api/job/[id]`    avanza un job: quando è completo scarica l'immagine e la archivia
- `app/api/feed`        elenco di tutte le immagini (archivio + in arrivo)
- `app/api/admin`       pausa / rimozione
- `app/globals.css`     identità visiva: tutte le variabili sono in `:root`

## Deploy su Vercel (una volta sola)
1. Crea un repository su GitHub e carica questi file (oppure `npx vercel` da questa cartella).
2. Su vercel.com: Add New → Project → importa il repository. Framework: Next.js (rilevato da solo).
3. Storage → Create → Blob → collega lo store al progetto. Questo crea da solo la variabile
   `BLOB_READ_WRITE_TOKEN`.
4. Settings → Environment Variables, aggiungi:
   - `HF_API_KEY_ID`       (da console.higgsfield.ai)
   - `HF_API_KEY_SECRET`   (da console.higgsfield.ai)
   - `ADMIN_KEY`           una stringa segreta lunga a piacere
   - `MAX_PER_DEVICE`  immagini per browser/telefono (default 0 = illimitate; lasciare 0 con il solo PC in sala)
   - `EVENT_ID`        etichetta dell'evento: cambiala per azzerare i conteggi (es. `2026-11-evento`)
   - opzionali: `RATE_LIMIT_SECONDS` (default 20), `HF_RESOLUTION` (720p|1080p),
     `HF_MODEL` (default higgsfield-ai/soul/v2/standard), `NEXT_PUBLIC_TITLE`
5. Redeploy. Apri l'URL del progetto sul PC in sala a schermo intero (F11).

## Come funziona la pausa
Apri `https://<tuo-dominio>/admin?key=<ADMIN_KEY>` dal telefono: un pulsante sospende
tutte le generazioni, e accanto a ogni immagine c'è "Rimuovi".

## Note
- Higgsfield conserva gli output solo circa 7 giorni: per questo ogni immagine viene
  scaricata e salvata sul tuo Blob al momento del completamento.
- Lo stato "in pausa" e il freno anti-abuso sono espressi come esistenza/data di piccoli
  file nel Blob, così non c'è mai un dato mutabile che possa restare in cache.
- Le generazioni bloccate dal filtro contenuti di Higgsfield (`nsfw`) non compaiono.
