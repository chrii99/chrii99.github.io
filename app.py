"""
Wenker-Studie – Flask-Backend
------------------------------
Wissenschaftliche Online-Studie zur Erhebung dialektaler Übersetzungen der
Wenker-Sätze.

Routen:
  GET  /                                Landingpage
  POST /api/start                       Neue Teilnehmer-ID erzeugen + leeren Datensatz anlegen
  GET  /study                           Studienseite (erwartet ?id=<participant_id>)
  GET  /api/wenker                      Liefert die Standardsätze aus Wenkerbogen.json
  GET  /api/participant/<pid>           Liefert den aktuellen Stand des Teilnehmers
  POST /api/participant/<pid>/save      Zwischenspeichern
  POST /api/participant/<pid>/submit    Endgültig abschicken
"""

from __future__ import annotations

import json
import os
import re
import secrets
import string
from datetime import datetime, timezone
from pathlib import Path

from flask import (
    Flask,
    abort,
    jsonify,
    render_template,
    request,
    send_from_directory,
)

# ---------------------------------------------------------------------------
# Pfade
# ---------------------------------------------------------------------------

BASE_DIR = Path(__file__).resolve().parent
DATA_DIR = BASE_DIR / "data"
TEXTS_DIR = DATA_DIR / "texts"
PARTICIPANTS_DIR = DATA_DIR / "participants"
WENKER_FILE = TEXTS_DIR / "Wenkerbogen.json"

PARTICIPANTS_DIR.mkdir(parents=True, exist_ok=True)

# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------

app = Flask(__name__, static_folder="static", template_folder="templates")

# Hilfsmuster für sichere Teilnehmer-IDs
_ID_RE = re.compile(r"^[A-Za-z0-9_-]{6,64}$")


def _load_wenker() -> dict:
    """Liest die Wenkerbogen-Datei und extrahiert die Standardsätze (id=0)."""
    with WENKER_FILE.open("r", encoding="utf-8") as fh:
        data = json.load(fh)
    standard = next((e for e in data if e.get("id") == 0), None)
    if standard is None:
        raise RuntimeError("Kein Eintrag mit id=0 (Wenker-Standard) gefunden.")
    return {
        "author": standard.get("author", "Wenker"),
        "sentences": standard["sentences"],
    }


def _new_participant_id() -> str:
    """Erzeugt eine kollisionsfreie, URL-sichere Teilnehmer-ID."""
    alphabet = string.ascii_letters + string.digits
    while True:
        pid = "".join(secrets.choice(alphabet) for _ in range(12))
        if not _participant_path(pid).exists():
            return pid


def _participant_path(pid: str) -> Path:
    if not _ID_RE.match(pid):
        abort(400, description="Ungültige Teilnehmer-ID.")
    return PARTICIPANTS_DIR / f"{pid}.json"


def _empty_record(pid: str, sentence_count: int) -> dict:
    now = datetime.now(timezone.utc).isoformat()
    return {
        "participant_id": pid,
        "created_at": now,
        "updated_at": now,
        "submitted_at": None,
        "submitted": False,
        "status": "in_progress",
        "translations": ["" for _ in range(sentence_count)],
        "variables": {
            "PLZ": "",
            "age": "",
            "gender": "",
            "sprechweise": "",
            "dialekt": "",
        },
    }


def _read_record(pid: str) -> dict | None:
    path = _participant_path(pid)
    if not path.exists():
        return None
    with path.open("r", encoding="utf-8") as fh:
        record = json.load(fh)
    # Abwärtskompatibilität: Flag aus altem Status ableiten, falls nicht vorhanden.
    if "submitted" not in record:
        record["submitted"] = (record.get("status") == "submitted")
    return record


def _write_record(pid: str, record: dict) -> None:
    path = _participant_path(pid)
    record["updated_at"] = datetime.now(timezone.utc).isoformat()
    tmp = path.with_suffix(".json.tmp")
    with tmp.open("w", encoding="utf-8") as fh:
        json.dump(record, fh, ensure_ascii=False, indent=2)
    tmp.replace(path)


# ---------------------------------------------------------------------------
# Routen
# ---------------------------------------------------------------------------


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/study")
def study():
    # Die Seite selbst lädt die Daten clientseitig über /api/*.
    return render_template("study.html")


@app.route("/api/wenker")
def api_wenker():
    return jsonify(_load_wenker())


@app.route("/api/start", methods=["POST"])
def api_start():
    wenker = _load_wenker()
    pid = _new_participant_id()
    record = _empty_record(pid, len(wenker["sentences"]))
    _write_record(pid, record)
    return jsonify({"participant_id": pid})


@app.route("/api/participant/<pid>", methods=["GET"])
def api_participant_get(pid: str):
    record = _read_record(pid)
    if record is None:
        # Wenn jemand eine fremde ID in die URL setzt: leeren Datensatz anlegen,
        # damit die ID weiterhin nutzbar bleibt.
        wenker = _load_wenker()
        record = _empty_record(pid, len(wenker["sentences"]))
        _write_record(pid, record)
    return jsonify(record)


def _merge_payload(record: dict, payload: dict) -> dict:
    """Übernimmt translations und variables aus dem Request-Body in den Datensatz."""
    translations = payload.get("translations")
    if isinstance(translations, list):
        # Länge des Arrays an die Wenker-Sätze angleichen
        wenker = _load_wenker()
        n = len(wenker["sentences"])
        cleaned = [str(t) if t is not None else "" for t in translations[:n]]
        while len(cleaned) < n:
            cleaned.append("")
        record["translations"] = cleaned

    variables = payload.get("variables")
    if isinstance(variables, dict):
        # Nur erwartete Felder übernehmen
        allowed = {"PLZ", "age", "gender", "sprechweise", "dialekt"}
        for key in allowed:
            if key in variables:
                record["variables"][key] = str(variables[key]) if variables[key] is not None else ""
    return record


@app.route("/api/participant/<pid>/save", methods=["POST"])
def api_participant_save(pid: str):
    record = _read_record(pid)
    if record is None:
        abort(404, description="Teilnehmer-ID unbekannt.")
    payload = request.get_json(silent=True) or {}
    record = _merge_payload(record, payload)
    # Zwischenspeichern darf einen schon-abgeschickten Datensatz nicht zurücksetzen,
    # falls Teilnehmer:innen nach dem Abschicken noch ergänzen.
    if not record.get("submitted"):
        record["submitted"] = False
        record["status"] = "in_progress"
    _write_record(pid, record)
    return jsonify({
        "ok": True,
        "status": record["status"],
        "submitted": record.get("submitted", False),
        "updated_at": record["updated_at"],
    })


@app.route("/api/participant/<pid>/submit", methods=["POST"])
def api_participant_submit(pid: str):
    record = _read_record(pid)
    if record is None:
        abort(404, description="Teilnehmer-ID unbekannt.")
    payload = request.get_json(silent=True) or {}
    record = _merge_payload(record, payload)
    record["submitted"] = True
    record["status"] = "submitted"
    record["submitted_at"] = datetime.now(timezone.utc).isoformat()
    _write_record(pid, record)
    return jsonify({
        "ok": True,
        "status": record["status"],
        "submitted": record["submitted"],
        "submitted_at": record["submitted_at"],
    })


@app.errorhandler(400)
@app.errorhandler(404)
def _json_error(err):
    return jsonify({"error": err.description}), err.code


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    port = int(os.environ.get("PORT", "5050"))
    app.run(host="127.0.0.1", port=port, debug=True)
