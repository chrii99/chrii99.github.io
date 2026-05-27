# Wenker-Studie · Online-Erhebung von Dialektübersetzungen

Eine kleine Flask-Webanwendung für eine wissenschaftliche Studie. Teilnehmende
übersetzen die 40 Standardsätze des Wenkerbogens in ihren Dialekt und machen
einige Angaben zur Person.

## Projektstruktur

```
wenker_study/
├── app.py                       # Flask-Backend (alle Routen)
├── requirements.txt             # Python-Abhängigkeiten
├── README.md                    # diese Datei
├── templates/
│   ├── index.html               # Landingpage
│   └── study.html               # Studienseite
├── static/
│   ├── css/style.css
│   └── js/
│       ├── index.js             # Logik der Landingpage
│       └── study.js             # Logik der Studienseite
└── data/
    ├── texts/Wenkerbogen.json   # Quell-Sätze (id=0 = Standarddeutsch)
    └── participants/            # Pro Teilnehmer eine <ID>.json
```

## Installation

```bash
cd /Users/christoph.raucheggersmycles.com/Documents/dump/wenker_study
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## Starten

```bash
source .venv/bin/activate
python app.py
```

Standard-URL: <http://127.0.0.1:5050/>

Die Studienseite hat folgende Form:

- `http://127.0.0.1:5050/study?id=<TEILNEHMER_ID>`

Neue Teilnehmer erhalten ihre ID automatisch über den Button "An der Studie
teilnehmen" auf der Landingpage; die ID wird in der URL angezeigt und kann
notiert werden, um die Studie später fortzusetzen.

## Datenspeicherung

Pro Teilnehmer wird eine JSON-Datei im Ordner `data/participants/` angelegt,
benannt nach der Teilnehmer-ID (z. B. `data/participants/aB3cD4eF5gH6.json`).
Beispielinhalt:

```json
{
  "participant_id": "aB3cD4eF5gH6",
  "created_at": "2026-05-27T11:00:00+00:00",
  "updated_at": "2026-05-27T11:15:23+00:00",
  "submitted_at": null,
  "status": "in_progress",
  "translations": ["Im Winta fliagn …", "Es heat glei auf …", "…"],
  "variables": {
    "PLZ": "8811",
    "age": "26",
    "gender": "m",
    "sprechweise": "Dialekt",
    "dialekt": "Steirisch"
  }
}
```

Beim **Zwischenspeichern** wird `status` auf `in_progress` gesetzt, beim
**Abschicken** wird `status` auf `submitted` gesetzt und `submitted_at`
gefüllt. Auch nach dem Abschicken bleibt der Datensatz editierbar (jede
weitere Speicherung wird in `updated_at` festgehalten).

## API-Übersicht

| Methode | Route                                  | Zweck                                |
|--------:|----------------------------------------|--------------------------------------|
| GET     | `/`                                    | Landingpage                          |
| GET     | `/study?id=<pid>`                      | Studienseite (lädt clientseitig)     |
| GET     | `/api/wenker`                          | Standardsätze (id=0)                 |
| POST    | `/api/start`                           | Neue Teilnehmer-ID + leerer Datensatz|
| GET     | `/api/participant/<pid>`               | Datensatz lesen                      |
| POST    | `/api/participant/<pid>/save`          | Zwischenspeichern                    |
| POST    | `/api/participant/<pid>/submit`        | Endgültig abschicken                 |

## Hinweise zur Studie

- Die Liste der Dialekte ist auf österreichische Bundesländer ausgelegt
  (Wienerisch, Steirisch, …) plus eine Freitext-Option "anderer".
- Das Feld "Welchen Dialekt?" erscheint nur, wenn als vertrauteste
  Sprechweise "Dialekt" gewählt wird.
- Die Teilnehmer-IDs sind 12-stellige zufällige alphanumerische Strings
  (`secrets`-Modul). Sie sind URL-safe und kollisionsfrei.
