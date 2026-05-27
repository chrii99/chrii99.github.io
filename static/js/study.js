// Study page – clientseitig (statische Website / GitHub Pages)
// Persistenz: localStorage pro Teilnehmer-ID. Abschicken => JSON-Download.
(function () {
    "use strict";

    const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
    const STORAGE_PREFIX = "wenker_study::";
    // Relativer Pfad funktioniert sowohl bei username.github.io/<repo>/ als
    // auch bei lokaler Auslieferung über `python -m http.server`.
    const WENKER_URL = "data/texts/Wenkerbogen.json";

    const $ = (sel) => document.querySelector(sel);

    const loadingEl = $("#loading");
    const formEl = $("#study-form");
    const sentencesList = $("#sentences-list");
    const participantIdEl = $("#participant-id");
    const copyIdBtn = $("#copy-id");
    const statusBanner = $("#status-banner");

    const fields = {
        PLZ: $("#var-plz"),
        age: $("#var-age"),
        gender: $("#var-gender"),
        sprechweise: $("#var-sprechweise"),
        dialekt: $("#var-dialekt"),
    };
    const dialektField = $("#dialekt-field");
    const dialektOther = $("#var-dialekt-other");

    const saveBtn = $("#save-btn");
    const submitBtn = $("#submit-btn");
    const downloadBtn = $("#download-btn");
    const feedback = $("#action-feedback");

    let wenkerSentences = []; // wird einmalig geladen

    // ---------- helpers ----------

    function getIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("id") || "").trim();
    }

    function nowIso() {
        return new Date().toISOString();
    }

    function storageKey(pid) {
        return STORAGE_PREFIX + pid;
    }

    function emptyRecord(pid, nSentences) {
        const now = nowIso();
        return {
            participant_id: pid,
            created_at: now,
            updated_at: now,
            submitted_at: null,
            submitted: false,
            status: "in_progress",
            translations: new Array(nSentences).fill(""),
            variables: {
                PLZ: "",
                age: "",
                gender: "",
                sprechweise: "",
                dialekt: "",
            },
        };
    }

    function loadRecord(pid) {
        const raw = localStorage.getItem(storageKey(pid));
        if (!raw) return null;
        try {
            const rec = JSON.parse(raw);
            // Abwärtskompatibilität
            if (typeof rec.submitted !== "boolean") {
                rec.submitted = rec.status === "submitted";
            }
            return rec;
        } catch (_) {
            return null;
        }
    }

    function saveRecord(rec) {
        rec.updated_at = nowIso();
        localStorage.setItem(storageKey(rec.participant_id), JSON.stringify(rec));
    }

    function showError(msg) {
        loadingEl.textContent = msg;
        loadingEl.classList.add("error");
    }

    function setFeedback(msg, kind) {
        feedback.textContent = msg;
        feedback.className = "feedback" + (kind ? " " + kind : "");
        if (msg) {
            setTimeout(() => {
                if (feedback.textContent === msg) {
                    feedback.textContent = "";
                    feedback.className = "feedback";
                }
            }, 4000);
        }
    }

    function setSubmittedBanner(record) {
        if (record.submitted) {
            statusBanner.hidden = false;
            statusBanner.textContent =
                "Diese Studie wurde bereits abgeschickt (" +
                new Date(record.submitted_at).toLocaleString() +
                "). Sie können den Datensatz weiterhin bearbeiten und erneut herunterladen.";
        } else {
            statusBanner.hidden = true;
        }
    }

    function renderSentences(sentences, translations) {
        sentencesList.innerHTML = "";
        sentences.forEach((s, i) => {
            const li = document.createElement("li");
            li.className = "sentence-item";
            li.value = i + 1;

            const stdEl = document.createElement("p");
            stdEl.className = "standard";
            stdEl.textContent = s;

            const inp = document.createElement("input");
            inp.type = "text";
            inp.className = "translation-input";
            inp.dataset.index = String(i);
            inp.value = (translations && translations[i]) || "";
            inp.placeholder = "Übersetzung in Ihren Dialekt …";
            inp.autocomplete = "off";
            inp.spellcheck = false;

            li.appendChild(stdEl);
            li.appendChild(inp);
            sentencesList.appendChild(li);
        });
    }

    function collectPayload() {
        const translations = Array.from(
            sentencesList.querySelectorAll(".translation-input")
        ).map((el) => el.value.trim());

        let dialekt = fields.dialekt.value;
        if (dialekt === "anderer") {
            dialekt = dialektOther.value.trim();
        }

        const variables = {
            PLZ: fields.PLZ.value.trim(),
            age: fields.age.value.trim(),
            gender: fields.gender.value,
            sprechweise: fields.sprechweise.value,
            dialekt: dialekt,
        };

        return { translations, variables };
    }

    function mergePayloadIntoRecord(record, payload) {
        const n = wenkerSentences.length;
        const cleaned = (payload.translations || []).slice(0, n).map((t) => String(t || ""));
        while (cleaned.length < n) cleaned.push("");
        record.translations = cleaned;

        const allowed = ["PLZ", "age", "gender", "sprechweise", "dialekt"];
        allowed.forEach((k) => {
            if (k in payload.variables) {
                record.variables[k] = String(payload.variables[k] || "");
            }
        });
        return record;
    }

    function applyRecordToForm(record) {
        const v = record.variables || {};
        fields.PLZ.value = v.PLZ || "";
        fields.age.value = v.age || "";
        fields.gender.value = v.gender || "";
        fields.sprechweise.value = v.sprechweise || "";

        updateDialektVisibility();

        const presetDialekt = v.dialekt || "";
        const knownOptions = Array.from(fields.dialekt.options).map((o) => o.value);
        if (presetDialekt && !knownOptions.includes(presetDialekt)) {
            fields.dialekt.value = "anderer";
            dialektOther.hidden = false;
            dialektOther.value = presetDialekt;
        } else {
            fields.dialekt.value = presetDialekt;
            dialektOther.hidden = fields.dialekt.value !== "anderer";
            if (dialektOther.hidden) dialektOther.value = "";
        }
    }

    function updateDialektVisibility() {
        const showDialekt = fields.sprechweise.value === "Dialekt";
        dialektField.hidden = !showDialekt;
        if (!showDialekt) {
            fields.dialekt.value = "";
            dialektOther.value = "";
            dialektOther.hidden = true;
        }
    }

    function triggerDownload(record) {
        const blob = new Blob([JSON.stringify(record, null, 2)], {
            type: "application/json;charset=utf-8",
        });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `${record.participant_id}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 500);
    }

    // ---------- handlers ----------

    function handleSave() {
        const pid = participantIdEl.textContent;
        const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
        mergePayloadIntoRecord(rec, collectPayload());
        // Schon-abgeschickte Datensätze bleiben submitted=true
        if (!rec.submitted) {
            rec.submitted = false;
            rec.status = "in_progress";
        }
        saveRecord(rec);
        setFeedback("Zwischengespeichert ✓", "ok");
    }

    function handleDownload() {
        const pid = participantIdEl.textContent;
        const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
        // Letzten Stand aus dem Formular reinmergen, dann speichern und herunterladen
        mergePayloadIntoRecord(rec, collectPayload());
        if (!rec.submitted) rec.status = "in_progress";
        saveRecord(rec);
        triggerDownload(rec);
        setFeedback("JSON heruntergeladen ✓", "ok");
    }

    function handleSubmit(e) {
        e.preventDefault();
        const pid = participantIdEl.textContent;
        if (!confirm("Studie wirklich abschicken? Es wird eine JSON-Datei heruntergeladen, die Sie an die Studienleitung senden.")) {
            return;
        }
        const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
        mergePayloadIntoRecord(rec, collectPayload());
        rec.submitted = true;
        rec.status = "submitted";
        rec.submitted_at = nowIso();
        saveRecord(rec);
        triggerDownload(rec);
        setSubmittedBanner(rec);
        setFeedback("Abgeschickt + heruntergeladen ✓", "ok");
    }

    // ---------- boot ----------

    async function loadWenker() {
        const res = await fetch(WENKER_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error("Wenkerbogen.json (" + res.status + ")");
        const data = await res.json();
        const std = (Array.isArray(data) ? data : []).find((e) => e && e.id === 0);
        if (!std || !Array.isArray(std.sentences)) {
            throw new Error("Eintrag mit id=0 (Standarddeutsch) nicht gefunden.");
        }
        return std.sentences;
    }

    function initEvents() {
        fields.sprechweise.addEventListener("change", updateDialektVisibility);
        fields.dialekt.addEventListener("change", () => {
            dialektOther.hidden = fields.dialekt.value !== "anderer";
            if (dialektOther.hidden) dialektOther.value = "";
        });
        saveBtn.addEventListener("click", handleSave);
        downloadBtn.addEventListener("click", handleDownload);
        formEl.addEventListener("submit", handleSubmit);

        copyIdBtn.addEventListener("click", async () => {
            try {
                await navigator.clipboard.writeText(participantIdEl.textContent);
                setFeedback("ID kopiert ✓", "ok");
            } catch (_) {
                setFeedback("Konnte ID nicht kopieren – bitte manuell markieren.", "err");
            }
        });
    }

    async function main() {
        const pid = getIdFromUrl();
        if (!pid) {
            showError("Keine Teilnehmer-ID in der URL. Bitte über die Startseite teilnehmen.");
            return;
        }
        if (!ID_RE.test(pid)) {
            showError("Die Teilnehmer-ID in der URL hat ein ungültiges Format.");
            return;
        }
        try {
            wenkerSentences = await loadWenker();
        } catch (err) {
            showError("Konnte Wenker-Sätze nicht laden: " + err.message);
            return;
        }

        let record = loadRecord(pid);
        if (!record) {
            record = emptyRecord(pid, wenkerSentences.length);
            saveRecord(record);
        }

        participantIdEl.textContent = record.participant_id;
        renderSentences(wenkerSentences, record.translations);
        applyRecordToForm(record);
        setSubmittedBanner(record);

        initEvents();

        loadingEl.hidden = true;
        formEl.hidden = false;
    }

    main();
})();
