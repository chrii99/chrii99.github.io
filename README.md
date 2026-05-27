# Wenker-Studie · Online-Erhebung von Dialektübersetzungen

Statische Website für eine wissenschaftliche Studie. Teilnehmende übersetzen
die 40 Standardsätze des Wenkerbogens in ihren Dialekt und machen einige
Angaben zur Person. Die Seite ist als reine HTML/CSS/JS-Anwendung gebaut
und kann direkt über **GitHub Pages** (oder jeden anderen Static-Host)
ausgeliefert werden.

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
│       └── study.js             # Studie: Render, Save, Download
└── data/
    └── texts/Wenkerbogen.json   # Standarddeutsche Sätze (id=0)
```

## Wie die Datenerhebung funktioniert (statisch, ohne Server)

1. Auf der Landingpage erzeugt ein Klick auf **„An der Studie teilnehmen"**
   eine zufällige 12-stellige Teilnehmer-ID (`crypto.getRandomValues`)
   und leitet auf `study.html?id=<ID>` weiter.
2. Antworten und Variablen werden im **`localStorage`** des Browsers
   unter dem Schlüssel `wenker_study::<ID>` gespeichert. Erneutes Öffnen
   mit derselben ID lädt den gespeicherten Stand.
3. **„Zwischenspeichern"** schreibt nur in den `localStorage`.
4. **„JSON herunterladen"** schreibt in den `localStorage` und triggert
   einen Download `<ID>.json`.
5. **„Abschicken"** setzt zusätzlich `submitted: true`, `submitted_at`
   und `status: "submitted"` und löst ebenfalls einen JSON-Download aus.
   Die Teilnehmenden senden diese Datei dann an die Studienleitung.

> ⚠️ **Wichtig:** Da GitHub Pages keine serverseitige Logik kennt, gibt es
> keine zentrale Speicherung. Die Auswertung erfolgt über die von den
> Teilnehmenden eingesandten `<ID>.json`-Dateien. Wer einen anderen
> Browser oder ein anderes Gerät benutzt, beginnt eine neue Sitzung.

## JSON-Format pro Teilnehmer

```json
{
  "participant_id": "aB3cD4eF5gH6",
  "created_at": "2026-05-27T11:00:00.000Z",
  "updated_at": "2026-05-27T11:15:23.000Z",
  "submitted_at": "2026-05-27T11:15:23.000Z",
  "submitted": true,
  "status": "submitted",
  "translations": ["Im Winta fliagn …", "…"],
  "variables": {
    "PLZ": "8811",
    "age": "26",
    "gender": "m",
    "sprechweise": "Dialekt",
    "dialekt": "Steirisch"
  }
}
```

## Lokal testen

GitHub Pages liefert über HTTP aus, daher reicht ein lokaler
Static-Server (das direkte Öffnen via `file://` scheitert am
`fetch` auf `data/texts/Wenkerbogen.json`):

```bash
cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
python3 -m http.server 8000
# Browser:
# http://127.0.0.1:8000/                          (Landing)
# http://127.0.0.1:8000/study.html?id=TESTID01    (Studie)
```

## Auf GitHub Pages veröffentlichen

1. Ein leeres Repo auf GitHub anlegen, z. B. `wenker-studie`.
2. Den Inhalt dieses Ordners committen und pushen:
   ```bash
   cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
   git init
   git add .
   git commit -m "Initial: Wenker-Studie (static)"
   git branch -M main
   git remote add origin git@github.com:<USERNAME>/wenker-studie.git
   git push -u origin main
   ```
3. In den Repo-Settings → **Pages** als Source `main` / `/ (root)` wählen.
4. Die Studie ist anschließend unter
   `https://<USERNAME>.github.io/wenker-studie/` erreichbar.
   - Landing: `https://<USERNAME>.github.io/wenker-studie/`
   - Resume: `https://<USERNAME>.github.io/wenker-studie/study.html?id=<ID>`

Eine `.nojekyll`-Datei sorgt dafür, dass GitHub Pages die Dateien direkt
ausliefert und keine Jekyll-Verarbeitung anwendet.

## Hinweise

- Die Liste der Dialekte ist auf österreichische Bundesländer ausgelegt
  (Wienerisch, Steirisch, …) plus eine Freitext-Option „anderer".
- Das Feld „Welchen Dialekt?" erscheint nur, wenn als vertrauteste
  Sprechweise „Dialekt" gewählt wird.
- Die Teilnehmer-IDs sind 12-stellige zufällige alphanumerische Strings.
