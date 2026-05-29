# Wenker-Studie · Online-Erhebung von Dialektübersetzungen

Statische Studien-Website (GitHub Pages) + Cloudflare-Worker-Backend mit
R2 Object Storage. Teilnehmende übersetzen die 40 Standardsätze des
Wenkerbogens schriftlich und optional als Audio-Aufnahme, geben einige
Angaben zur Person und schicken ihre Antworten mit einem Klick ab.

## Projektstruktur

```
wenker_study/
├── index.html                   # Landingpage mit Einwilligungserklärung
├── study.html                   # Studienseite
├── .nojekyll
├── .gitignore
├── README.md                    # diese Datei
├── static/
│   ├── css/style.css
│   └── js/
│       ├── config.js            # ★ Worker-URL + Kontakt etc. hier eintragen
│       ├── index.js             # Landing: Consent, ID-Erzeugung, Resume
│       └── study.js             # Studie: Render, Save, Audio, ZIP, Upload
├── data/
│   └── texts/Wenkerbogen.json   # Standarddeutsche Sätze (id=0)
└── worker/                      # Cloudflare-Worker für Uploads
    ├── worker.js                # Worker-Code (POST /submit → R2)
    ├── wrangler.toml            # Cloudflare-Konfiguration
    └── README.md                # Deploy-Anleitung
```

## Datenfluss

```
Browser ─────►  GitHub Pages (HTML/CSS/JS)
   │
   │  Klick "An der Studie teilnehmen" (Consent-Checkbox)
   │  → Teilnehmer-ID erzeugt
   │
   ▼  Klick "Abschicken"
Browser baut ZIP (manifest.json + audio/*.webm)
   │
   │  POST /submit  (Content-Type: application/zip,
   │                 X-Participant-Id: <pid>)
   ▼
Cloudflare Worker  ───►  R2-Bucket  (submissions/<pid>/<ts>.zip)
```

Beim Abschicken läuft alles in einem einzigen Klick:
**ZIP wird im Browser gebaut → an den Worker geschickt → in R2 gespeichert →
Erfolgsmeldung mit Teilnehmer-ID anzeigen.**

## Erstmaliges Setup

### 1. Backend (Cloudflare Worker + R2)

Siehe `worker/README.md` für den vollständigen Ablauf. Kurz:

1. Cloudflare-Account anlegen (kostenlos).
2. R2-Bucket erstellen (EU-Region).
3. `worker/wrangler.toml` anpassen (Bucket-Name, ALLOWED_ORIGIN).
4. `wrangler deploy` im `worker/`-Ordner.
5. Worker-URL notieren (z.B. `https://wenker-study-upload.<acc>.workers.dev`).

### 2. Frontend-Konfiguration

In `static/js/config.js` die Platzhalter ersetzen:

```js
window.WENKER_CONFIG = {
    WORKER_URL:    "https://wenker-study-upload.<acc>.workers.dev",
    INSTITUTION:   "Universität XY · Institut für Germanistik",
    STUDY_LEADER:  "Max Mustermann (Masterarbeit, betreut durch …)",
    CONTACT_EMAIL: "wenker-studie@uni-xy.at",
    STORAGE_REGION:"Cloudflare R2 (EU, Frankfurt)",
    RETENTION:     "10 Jahre nach Studienabschluss",
};
```

Diese Werte landen automatisch in der Datenschutzerklärung auf der
Landingpage.

### 3. Auf GitHub Pages veröffentlichen

```bash
cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
git init && git add . && git commit -m "Initial commit"
git branch -M main
git remote add origin git@github.com:<USER>/wenker-studie.git
git push -u origin main
# GitHub → Repo → Settings → Pages → Source: main / (root)
```

Anschließend ist die Studie unter `https://<USER>.github.io/wenker-studie/`
erreichbar.

**Achtung:** Die `ALLOWED_ORIGIN` im Worker (`wrangler.toml`) muss exakt
die Pages-Domain sein (Schema + Host, ohne Pfad), z.B.
`https://<USER>.github.io`. Bei einem benutzerdefinierten Subpfad zählt
nur der Host, nicht der Pfad.

## Wie der Datenstand pro Teilnehmer aussieht

Im hochgeladenen `<ID>.zip` liegt ein Manifest `<ID>.json`:

```json
{
  "participant_id": "aB3cD4eF5gH6",
  "created_at": "2026-05-29T11:00:00.000Z",
  "updated_at": "2026-05-29T11:15:23.000Z",
  "submitted_at": "2026-05-29T11:15:23.000Z",
  "submitted": true,
  "status": "submitted",
  "consent": {
    "given": true,
    "given_at": "2026-05-29T10:58:11.000Z",
    "version": "v1",
    "scope": "study_participation + audio (Art. 9 DSGVO)"
  },
  "uploads": [
    { "attempted_at": "2026-05-29T11:15:24.000Z",
      "ok": true,
      "storage_key": "submissions/aB3cD4eF5gH6/2026-05-29T11-15-24-000Z.zip",
      "size_bytes": 4823104 }
  ],
  "translations": ["Im Winta fliagn …", "…"],
  "audio": [
    { "mime_type": "audio/webm;codecs=opus", "ext": "webm",
      "duration_ms": 8420, "size_bytes": 71234,
      "filename": "audio/01.webm", "recorded_at": "..." },
    null, "..."
  ],
  "variables": {
    "PLZ": "8811", "age": "26", "gender": "m",
    "sprechweise": "Dialekt", "dialekt": "Steirisch"
  }
}
```

Plus pro vorhandener Aufnahme `audio/01.webm`, `audio/02.webm`, … im ZIP.

## DSGVO-Checkliste vor dem Live-Gang

- [ ] `config.js` mit korrekten Daten (Institution, Studienleitung,
      Kontakt, Aufbewahrungsdauer) ausgefüllt.
- [ ] R2-Bucket-Region: **EU** (Frankfurt) oder gleichwertig.
- [ ] Worker `ALLOWED_ORIGIN` exakt auf die Studien-Domain gesetzt.
- [ ] Datenschutzerklärung auf der Landingpage (wird automatisch aus
      `config.js` befüllt) von DSB/Betreuer:in geprüft.
- [ ] Verzeichnis von Verarbeitungstätigkeiten (Art. 30 DSGVO)
      ausgefüllt.
- [ ] Hinweis im Cloudflare-Account: Logpush, Audit-Logging
      eingeschaltet (Free-Tier verfügbar).
- [ ] Lösch- und Auskunfts-Workflow definiert: Eingang Mail mit
      Teilnehmer-ID → Suche in R2 unter `submissions/<pid>/` →
      Löschung der entsprechenden Objekte → Bestätigung an Person.

## Lokales Testen

```bash
cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
python3 -m http.server 8000
# Browser → http://127.0.0.1:8000/
```

Mikrofon-Aufnahmen funktionieren nur via `http://localhost:…` oder
HTTPS, nicht via `file://`.

Für den Worker (parallel im zweiten Terminal):
```bash
cd worker
wrangler dev      # http://localhost:8787
```

In `static/js/config.js` temporär `WORKER_URL` auf
`http://localhost:8787` setzen, dann gehen Upload-Tests gegen den
lokalen Worker.

## Hinweise

- Die Liste der Dialekte ist auf österreichische Bundesländer ausgelegt;
  Freitext-Option „anderer" ist vorgesehen.
- Das Feld „Welchen Dialekt?" erscheint nur bei Sprechweise „Dialekt".
- Teilnehmer-IDs sind 12-stellige zufällige alphanumerische Strings.
- Bei Upload-Fehlern: Fallback ist der manuelle ZIP-Download — die Daten
  gehen nie verloren, weil sie zusätzlich im `localStorage`/`IndexedDB`
  des Browsers bleiben.
