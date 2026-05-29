# Wenker-Studie · Online-Erhebung von Dialektübersetzungen

Statische Website für eine wissenschaftliche Studie. Teilnehmende übersetzen
die 40 Standardsätze des Wenkerbogens in ihren Dialekt – schriftlich **und**
optional als kurze Audio-Aufnahme – und machen einige Angaben zur Person.
Die Seite ist als reine HTML/CSS/JS-Anwendung gebaut und kann direkt über
**GitHub Pages** ausgeliefert werden.

## Projektstruktur

```
wenker_study/
├── index.html                   # Landingpage (Root)
├── study.html                   # Studienseite (Root)
├── .nojekyll                    # GitHub Pages: ohne Jekyll ausliefern
├── .gitignore
├── README.md
├── static/
│   ├── css/style.css
│   └── js/
│       ├── index.js             # Landing: ID erzeugen / Resume
│       └── study.js             # Studie: Render, Save, Audio, ZIP-Download
└── data/
    └── texts/Wenkerbogen.json   # Standarddeutsche Sätze (id=0)
```

JSZip wird vom CDN geladen (`cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1`).

## Wie die Datenerhebung funktioniert (statisch, ohne Server)

1. Auf der Landingpage erzeugt ein Klick auf **„An der Studie teilnehmen"**
   eine zufällige 12-stellige Teilnehmer-ID (`crypto.getRandomValues`)
   und leitet auf `study.html?id=<ID>` weiter.
2. **Schriftliche Antworten + Metadaten** werden im **`localStorage`** des
   Browsers unter `wenker_study::<ID>` gespeichert.
3. **Audio-Aufnahmen** werden in **IndexedDB** abgelegt (Schlüssel
   `audio::<ID>::<satzindex>`). Das passt zu beliebig vielen Aufnahmen,
   ohne die 5-MB-Grenze von `localStorage` zu sprengen.
4. **„Zwischenspeichern"** schreibt Text/Variablen in `localStorage`. Audio
   wird sofort beim Stop automatisch in IndexedDB persistiert.
5. **„ZIP herunterladen"** baut on-the-fly eine ZIP-Datei `<ID>.zip` mit
   Manifest `<ID>.json` + `audio/01.<ext>` … `audio/40.<ext>`.
6. **„Abschicken"** setzt zusätzlich `submitted: true`, `submitted_at`
   und `status: "submitted"` und löst denselben ZIP-Download aus. Die
   Teilnehmenden senden die ZIP-Datei dann an die Studienleitung.

> ⚠️ **Wichtig:** Da GitHub Pages keine serverseitige Logik kennt, gibt es
> keine zentrale Speicherung. Die Auswertung erfolgt über die von den
> Teilnehmenden eingesandten `<ID>.zip`-Dateien.

## Audio-Aufnahme

* **Aufnahme pro Satz** über die Buttons *Aufnehmen* / *Stop* / *Abspielen* /
  *Neu aufnehmen* / *Löschen* direkt unter dem Eingabefeld.
* **Hardlimit 30 Sekunden** pro Aufnahme. Die UI zeigt einen Countdown;
  bei 30 s wird automatisch gestoppt.
* **Format:** Browser wählt automatisch das beste verfügbare Codec.
  Chrome/Firefox/Edge: `audio/webm;codecs=opus` (`.webm`).
  Safari/iOS: `audio/mp4;codecs=mp4a.40.2` (`.m4a`).
  Bitrate ~64 kbps Mono — phonetisch analysetauglich, ca. 8 KB/s.
* **Mikrofon-Berechtigung** wird beim ersten Klick auf *Aufnehmen*
  angefordert. Bei Verweigerung bleibt die Studie schriftlich nutzbar.
* **Voraussetzung:** HTTPS (GitHub Pages liefert das automatisch). Lokales
  Testen geht über `http://localhost:…`.

## JSON-Format pro Teilnehmer (`<ID>.json` im ZIP)

```json
{
  "participant_id": "aB3cD4eF5gH6",
  "created_at": "2026-05-27T11:00:00.000Z",
  "updated_at": "2026-05-27T11:15:23.000Z",
  "submitted_at": "2026-05-27T11:15:23.000Z",
  "submitted": true,
  "status": "submitted",
  "translations": ["Im Winta fliagn …", "…"],
  "audio": [
    {
      "mime_type": "audio/webm;codecs=opus",
      "ext": "webm",
      "duration_ms": 8420,
      "size_bytes": 71234,
      "filename": "audio/01.webm",
      "recorded_at": "2026-05-27T11:03:11.000Z"
    },
    null,
    "..."
  ],
  "variables": {
    "PLZ": "8811",
    "age": "26",
    "gender": "m",
    "sprechweise": "Dialekt",
    "dialekt": "Steirisch"
  }
}
```

`audio[i]` ist `null`, wenn für Satz *i* keine Aufnahme vorliegt.

## ZIP-Inhalt

```
<ID>.zip
├── <ID>.json
└── audio/
    ├── 01.webm
    ├── 02.webm
    └── ...
```

## Lokal testen

```bash
cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
python3 -m http.server 8000
# Browser:
# http://127.0.0.1:8000/                          (Landing)
# http://127.0.0.1:8000/study.html?id=TESTID01    (Studie)
```

Hinweis: Mikrofon-Aufnahme funktioniert nur über `http://localhost:…`
oder `https://…`, nicht über `file://`.

## Auf GitHub Pages veröffentlichen

1. Ein leeres Repo auf GitHub anlegen, z. B. `wenker-studie`.
2. Push:
   ```bash
   cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
   git init && git add . && git commit -m "Initial: Wenker-Studie (static)"
   git branch -M main
   git remote add origin git@github.com:<USERNAME>/wenker-studie.git
   git push -u origin main
   ```
3. Repo-Settings → **Pages** → Source `main` / `/ (root)`.
4. Erreichbar unter `https://<USERNAME>.github.io/wenker-studie/`.

## DSGVO-Hinweis

Stimmaufnahmen sind in der Regel **biometrische Daten** (Art. 9 DSGVO).
Vor der Erhebung:

* informierte Einwilligung dokumentieren (Zweck, Speicherort,
  Aufbewahrungsdauer, Löschmöglichkeit),
* Pseudonymisierung über die Teilnehmer-ID (keine Klartextnamen),
* Speicherung bevorzugt im EU-Raum bzw. auf Uni-Servern,
* keine Veröffentlichung der Audio-Dateien in einem öffentlichen Repo.

## Hinweise

- Die Liste der Dialekte ist auf österreichische Bundesländer ausgelegt
  (Wienerisch, Steirisch, …) plus eine Freitext-Option „anderer".
- Das Feld „Welchen Dialekt?" erscheint nur, wenn als vertrauteste
  Sprechweise „Dialekt" gewählt wird.
- Die Teilnehmer-IDs sind 12-stellige zufällige alphanumerische Strings.
