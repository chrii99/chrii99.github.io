// Study page – sentence-by-sentence translation + participant variables
(function () {
    "use strict";

    const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

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
    const feedback = $("#action-feedback");

    function getIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("id") || "").trim();
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
        if (record.status === "submitted") {
            statusBanner.hidden = false;
            statusBanner.textContent =
                "Diese Studie wurde bereits abgeschickt (" +
                new Date(record.submitted_at).toLocaleString() +
                "). Änderungen werden weiterhin gespeichert.";
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

    function applyRecordToForm(record) {
        const v = record.variables || {};
        fields.PLZ.value = v.PLZ || "";
        fields.age.value = v.age || "";
        fields.gender.value = v.gender || "";
        fields.sprechweise.value = v.sprechweise || "";

        updateDialektVisibility();

        // Dialekt-Vorbelegung
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

    async function loadAll(pid) {
        try {
            const [wenkerRes, partRes] = await Promise.all([
                fetch("/api/wenker"),
                fetch(`/api/participant/${encodeURIComponent(pid)}`),
            ]);
            if (!wenkerRes.ok) throw new Error("Wenker-Sätze konnten nicht geladen werden.");
            if (!partRes.ok) throw new Error("Teilnehmer-Datensatz konnte nicht geladen werden.");
            const wenker = await wenkerRes.json();
            const record = await partRes.json();

            participantIdEl.textContent = record.participant_id;
            renderSentences(wenker.sentences, record.translations);
            applyRecordToForm(record);
            setSubmittedBanner(record);

            loadingEl.hidden = true;
            formEl.hidden = false;
        } catch (err) {
            showError("Fehler: " + err.message);
        }
    }

    async function postJSON(url, body) {
        const res = await fetch(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body || {}),
        });
        if (!res.ok) {
            const text = await res.text().catch(() => "");
            throw new Error("Server-Fehler " + res.status + ": " + text);
        }
        return res.json();
    }

    async function handleSave() {
        const pid = participantIdEl.textContent;
        saveBtn.disabled = true;
        try {
            const payload = collectPayload();
            const r = await postJSON(
                `/api/participant/${encodeURIComponent(pid)}/save`,
                payload
            );
            setFeedback("Zwischengespeichert ✓", "ok");
        } catch (err) {
            setFeedback("Speichern fehlgeschlagen: " + err.message, "err");
        } finally {
            saveBtn.disabled = false;
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        const pid = participantIdEl.textContent;
        if (!confirm("Studie wirklich abschicken? Sie können den Datensatz danach weiterhin bearbeiten und erneut speichern.")) {
            return;
        }
        submitBtn.disabled = true;
        try {
            const payload = collectPayload();
            const r = await postJSON(
                `/api/participant/${encodeURIComponent(pid)}/submit`,
                payload
            );
            setFeedback("Studie erfolgreich abgeschickt ✓", "ok");
            statusBanner.hidden = false;
            statusBanner.textContent =
                "Diese Studie wurde abgeschickt (" +
                new Date(r.submitted_at).toLocaleString() +
                "). Vielen Dank für Ihre Teilnahme!";
        } catch (err) {
            setFeedback("Abschicken fehlgeschlagen: " + err.message, "err");
        } finally {
            submitBtn.disabled = false;
        }
    }

    function initEvents() {
        fields.sprechweise.addEventListener("change", updateDialektVisibility);
        fields.dialekt.addEventListener("change", () => {
            dialektOther.hidden = fields.dialekt.value !== "anderer";
            if (dialektOther.hidden) dialektOther.value = "";
        });
        saveBtn.addEventListener("click", handleSave);
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

    // Boot
    const pid = getIdFromUrl();
    if (!pid) {
        showError("Keine Teilnehmer-ID in der URL. Bitte über die Startseite teilnehmen.");
        return;
    }
    if (!ID_RE.test(pid)) {
        showError("Die Teilnehmer-ID in der URL hat ein ungültiges Format.");
        return;
    }
    initEvents();
    loadAll(pid);
})();
