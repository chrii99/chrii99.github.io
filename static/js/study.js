// Study page – clientseitig (statische Website / GitHub Pages)
// Erweiterung: Audio-Aufnahmen pro Satz (max. 30 s), IndexedDB-Speicherung,
// ZIP-Export (manifest.json + audio/<idx>.<ext>) beim Abschicken/Download.
(function () {
    "use strict";

    // ----------------------------- Konstanten ---------------------------------

    const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;
    const STORAGE_PREFIX = "wenker_study::";
    const WENKER_URL = "data/texts/Wenkerbogen.json";
    const MAX_RECORDING_MS = 30000; // 30 Sekunden Hard-Limit

    // ----------------------------- DOM-Helfer ---------------------------------

    const $ = (sel) => document.querySelector(sel);

    const loadingEl = $("#loading");
    const formEl = $("#study-form");
    const sentencesList = $("#sentences-list");
    const participantIdEl = $("#participant-id");
    const copyIdBtn = $("#copy-id");
    const statusBanner = $("#status-banner");
    const micStatus = $("#mic-status");

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

    // ----------------------------- State --------------------------------------

    let wenkerSentences = [];
    let currentParticipantId = null;
    let mediaStream = null;       // einmalig angeforderter Mic-Stream
    let activeRecorder = null;    // { index, recorder, chunks, startedAt, timer, autoStopTimer }

    // ----------------------------- IndexedDB ----------------------------------

    const DB_NAME = "wenker_study";
    const DB_STORE = "audio";
    const DB_VERSION = 1;

    function openDB() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onupgradeneeded = () => {
                const db = req.result;
                if (!db.objectStoreNames.contains(DB_STORE)) {
                    db.createObjectStore(DB_STORE); // key = "audio::<pid>::<idx>"
                }
            };
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }

    function audioKey(pid, idx) {
        return `audio::${pid}::${idx}`;
    }

    async function dbPut(key, value) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).put(value, key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    async function dbGet(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readonly");
            const req = tx.objectStore(DB_STORE).get(key);
            req.onsuccess = () => resolve(req.result || null);
            req.onerror = () => reject(req.error);
        });
    }

    async function dbDelete(key) {
        const db = await openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(DB_STORE, "readwrite");
            tx.objectStore(DB_STORE).delete(key);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
        });
    }

    // ------------------------- Datensatz (Metadaten) --------------------------

    function nowIso() { return new Date().toISOString(); }

    function storageKey(pid) { return STORAGE_PREFIX + pid; }

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
            audio: new Array(nSentences).fill(null), // null oder { mime_type, ext, duration_ms, size_bytes, filename }
            variables: { PLZ: "", age: "", gender: "", sprechweise: "", dialekt: "" },
        };
    }

    function loadRecord(pid) {
        const raw = localStorage.getItem(storageKey(pid));
        if (!raw) return null;
        try {
            const rec = JSON.parse(raw);
            if (typeof rec.submitted !== "boolean") rec.submitted = rec.status === "submitted";
            // Abwärtskompatibilität: audio-Array nachpflegen, falls Datensatz noch ohne Audio
            if (!Array.isArray(rec.audio)) rec.audio = new Array(rec.translations.length).fill(null);
            return rec;
        } catch (_) { return null; }
    }

    function saveRecord(rec) {
        rec.updated_at = nowIso();
        localStorage.setItem(storageKey(rec.participant_id), JSON.stringify(rec));
    }

    // --------------------------- Audio-Format --------------------------------

    function pickMimeType() {
        // Bevorzugt Opus in WebM (Chrome/Firefox/Edge); Fallback MP4/AAC (Safari).
        const candidates = [
            { mime: "audio/webm;codecs=opus", ext: "webm" },
            { mime: "audio/webm", ext: "webm" },
            { mime: "audio/mp4;codecs=mp4a.40.2", ext: "m4a" },
            { mime: "audio/mp4", ext: "m4a" },
            { mime: "audio/ogg;codecs=opus", ext: "ogg" },
        ];
        if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) {
            return { mime: "", ext: "webm" };
        }
        for (const c of candidates) {
            if (MediaRecorder.isTypeSupported(c.mime)) return c;
        }
        return { mime: "", ext: "webm" };
    }

    async function ensureMicStream() {
        if (mediaStream && mediaStream.active) return mediaStream;
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            throw new Error("Mikrofon-API in diesem Browser nicht verfügbar.");
        }
        mediaStream = await navigator.mediaDevices.getUserMedia({
            audio: {
                echoCancellation: true,
                noiseSuppression: true,
                channelCount: 1,
            },
        });
        micStatus.textContent = "🎙 Mikrofon bereit.";
        micStatus.classList.add("ok");
        return mediaStream;
    }

    // ------------------------- UI: Satz + Audio ------------------------------

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
                "). Sie können den Datensatz weiterhin bearbeiten und das ZIP erneut herunterladen.";
        } else {
            statusBanner.hidden = true;
        }
    }

    function fmtMs(ms) {
        const s = Math.max(0, Math.round(ms / 1000));
        return s.toString().padStart(2, "0") + " s";
    }

    function buildSentenceItem(idx, standardText, translationText, audioMeta) {
        const li = document.createElement("li");
        li.className = "sentence-item";
        li.value = idx + 1;
        li.dataset.index = String(idx);

        const stdEl = document.createElement("p");
        stdEl.className = "standard";
        stdEl.textContent = standardText;
        li.appendChild(stdEl);

        const inp = document.createElement("input");
        inp.type = "text";
        inp.className = "translation-input";
        inp.dataset.index = String(idx);
        inp.value = translationText || "";
        inp.placeholder = "Übersetzung in Ihren Dialekt …";
        inp.autocomplete = "off";
        inp.spellcheck = false;
        li.appendChild(inp);

        // Audio-Kontrollleiste
        const audioBar = document.createElement("div");
        audioBar.className = "audio-bar";
        audioBar.innerHTML = `
            <button type="button" class="audio-btn rec" data-action="record" title="Aufnehmen (max. 30 s)">
                <span class="dot"></span><span class="label">Aufnehmen</span>
            </button>
            <button type="button" class="audio-btn stop" data-action="stop" hidden title="Aufnahme stoppen">
                ⏹ <span class="label">Stop</span>
            </button>
            <button type="button" class="audio-btn play" data-action="play" disabled title="Aufnahme abspielen">
                ▶ <span class="label">Abspielen</span>
            </button>
            <button type="button" class="audio-btn redo" data-action="redo" disabled title="Aufnahme neu machen">
                ↻ <span class="label">Neu aufnehmen</span>
            </button>
            <button type="button" class="audio-btn del" data-action="delete" disabled title="Aufnahme löschen">
                ✕ <span class="label">Löschen</span>
            </button>
            <span class="audio-status" aria-live="polite"></span>
            <audio class="audio-player" controls preload="metadata" hidden></audio>
        `;
        li.appendChild(audioBar);

        wireAudioBar(li, idx, audioMeta);
        return li;
    }

    function wireAudioBar(li, idx, audioMeta) {
        const recBtn = li.querySelector('[data-action="record"]');
        const stopBtn = li.querySelector('[data-action="stop"]');
        const playBtn = li.querySelector('[data-action="play"]');
        const redoBtn = li.querySelector('[data-action="redo"]');
        const delBtn = li.querySelector('[data-action="delete"]');
        const status = li.querySelector(".audio-status");
        const player = li.querySelector(".audio-player");

        function setHasAudio(meta) {
            const has = !!meta;
            playBtn.disabled = !has;
            redoBtn.disabled = !has;
            delBtn.disabled = !has;
            if (has) {
                status.textContent = `${fmtMs(meta.duration_ms || 0)} · ${Math.round((meta.size_bytes || 0) / 1024)} KB`;
                status.classList.add("ok");
            } else {
                status.textContent = "";
                status.classList.remove("ok");
                player.hidden = true;
                if (player.src) {
                    try { URL.revokeObjectURL(player.src); } catch (_) {}
                    player.removeAttribute("src");
                }
            }
        }
        setHasAudio(audioMeta);

        recBtn.addEventListener("click", async () => {
            try {
                await startRecording(idx, li);
            } catch (err) {
                setFeedback("Aufnahme fehlgeschlagen: " + err.message, "err");
            }
        });
        stopBtn.addEventListener("click", () => stopRecording(idx));
        redoBtn.addEventListener("click", async () => {
            try {
                await startRecording(idx, li);
            } catch (err) {
                setFeedback("Aufnahme fehlgeschlagen: " + err.message, "err");
            }
        });
        delBtn.addEventListener("click", async () => {
            if (!confirm("Aufnahme für Satz " + (idx + 1) + " wirklich löschen?")) return;
            await deleteAudio(idx, li);
        });
        playBtn.addEventListener("click", async () => {
            const pid = currentParticipantId;
            const blob = await dbGet(audioKey(pid, idx));
            if (!blob) { setFeedback("Keine Aufnahme gefunden.", "err"); return; }
            if (player.src) { try { URL.revokeObjectURL(player.src); } catch (_) {} }
            player.src = URL.createObjectURL(blob);
            player.hidden = false;
            player.play().catch(() => { /* user-gesture present – sollte gehen */ });
        });

        // Lifecycle-API für den Recorder anhängen
        li._setRecordingUi = (active, secondsLeft) => {
            recBtn.hidden = active;
            stopBtn.hidden = !active;
            playBtn.disabled = active || playBtn.disabled;
            redoBtn.disabled = active || redoBtn.disabled;
            delBtn.disabled = active || delBtn.disabled;
            li.classList.toggle("recording", active);
            if (active) {
                status.classList.remove("ok");
                status.classList.add("rec");
                status.textContent = "🔴 Aufnahme … " + secondsLeft + " s";
            } else {
                status.classList.remove("rec");
            }
        };
        li._setHasAudio = setHasAudio;
    }

    function renderSentences(sentences, translations, audioArr) {
        sentencesList.innerHTML = "";
        sentences.forEach((s, i) => {
            sentencesList.appendChild(
                buildSentenceItem(i, s, translations[i], audioArr[i])
            );
        });
    }

    // --------------------------- Recorder-Logik ------------------------------

    async function startRecording(idx, li) {
        if (activeRecorder && activeRecorder.index !== idx) {
            // andere laufende Aufnahme zuerst stoppen
            stopRecording(activeRecorder.index);
        }
        await ensureMicStream();
        const fmt = pickMimeType();
        const recorder = new MediaRecorder(mediaStream, fmt.mime ? { mimeType: fmt.mime, audioBitsPerSecond: 64000 } : undefined);
        const chunks = [];
        recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };

        const startedAt = performance.now();
        let autoStopTimer = null;
        let tickTimer = null;

        const finalize = async (cancelled) => {
            if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
            if (autoStopTimer) { clearTimeout(autoStopTimer); autoStopTimer = null; }
            li._setRecordingUi(false, 0);
            activeRecorder = null;
            if (cancelled) return;

            const blob = new Blob(chunks, { type: fmt.mime || "audio/webm" });
            if (blob.size === 0) {
                setFeedback("Aufnahme war leer.", "err");
                return;
            }
            const durationMs = Math.min(MAX_RECORDING_MS, Math.round(performance.now() - startedAt));
            const meta = {
                mime_type: fmt.mime || blob.type || "audio/webm",
                ext: fmt.ext,
                duration_ms: durationMs,
                size_bytes: blob.size,
                filename: `audio/${String(idx + 1).padStart(2, "0")}.${fmt.ext}`,
                recorded_at: nowIso(),
            };
            await dbPut(audioKey(currentParticipantId, idx), blob);
            const rec = loadRecord(currentParticipantId) || emptyRecord(currentParticipantId, wenkerSentences.length);
            rec.audio[idx] = meta;
            if (!rec.submitted) rec.status = "in_progress";
            saveRecord(rec);
            li._setHasAudio(meta);
            setFeedback(`Satz ${idx + 1}: Aufnahme gespeichert (${fmtMs(durationMs)})`, "ok");
        };

        recorder.onstop = () => finalize(false);
        recorder.onerror = (e) => {
            setFeedback("Recorder-Fehler: " + (e.error && e.error.message || "unbekannt"), "err");
            finalize(true);
        };

        activeRecorder = { index: idx, recorder, chunks, startedAt, timer: null, autoStopTimer: null };
        recorder.start();
        li._setRecordingUi(true, Math.ceil(MAX_RECORDING_MS / 1000));

        // sekundengenauer Countdown
        tickTimer = setInterval(() => {
            const elapsed = performance.now() - startedAt;
            const left = Math.max(0, Math.ceil((MAX_RECORDING_MS - elapsed) / 1000));
            li._setRecordingUi(true, left);
        }, 200);
        activeRecorder.timer = tickTimer;

        // hartes Auto-Stop bei 30 s
        autoStopTimer = setTimeout(() => {
            if (activeRecorder && activeRecorder.recorder === recorder && recorder.state === "recording") {
                recorder.stop();
                setFeedback("30-Sekunden-Limit erreicht – Aufnahme automatisch gestoppt.", "ok");
            }
        }, MAX_RECORDING_MS);
        activeRecorder.autoStopTimer = autoStopTimer;
    }

    function stopRecording(idx) {
        if (!activeRecorder || activeRecorder.index !== idx) return;
        const r = activeRecorder.recorder;
        if (r.state === "recording") r.stop();
    }

    async function deleteAudio(idx, li) {
        await dbDelete(audioKey(currentParticipantId, idx));
        const rec = loadRecord(currentParticipantId);
        if (rec) {
            rec.audio[idx] = null;
            if (!rec.submitted) rec.status = "in_progress";
            saveRecord(rec);
        }
        li._setHasAudio(null);
        setFeedback("Aufnahme gelöscht.", "ok");
    }

    // ----------------------- Variablen / Formular ----------------------------

    function collectPayload() {
        const translations = Array.from(sentencesList.querySelectorAll(".translation-input")).map((el) => el.value.trim());

        let dialekt = fields.dialekt.value;
        if (dialekt === "anderer") dialekt = dialektOther.value.trim();

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
            if (k in payload.variables) record.variables[k] = String(payload.variables[k] || "");
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

    // ------------------------- ZIP-Export ------------------------------------

    async function buildZipBlob(record) {
        if (typeof JSZip === "undefined") {
            throw new Error("JSZip nicht geladen.");
        }
        const zip = new JSZip();
        zip.file(`${record.participant_id}.json`, JSON.stringify(record, null, 2));
        const audioFolder = zip.folder("audio");
        for (let i = 0; i < record.audio.length; i++) {
            const meta = record.audio[i];
            if (!meta) continue;
            const blob = await dbGet(audioKey(record.participant_id, i));
            if (!blob) continue;
            const name = `${String(i + 1).padStart(2, "0")}.${meta.ext || "webm"}`;
            audioFolder.file(name, blob);
        }
        return zip.generateAsync({ type: "blob", compression: "DEFLATE", compressionOptions: { level: 6 } });
    }

    function triggerBlobDownload(blob, filename) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(() => URL.revokeObjectURL(url), 800);
    }

    // ---------------------------- Handlers -----------------------------------

    function handleSave() {
        const pid = currentParticipantId;
        const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
        mergePayloadIntoRecord(rec, collectPayload());
        if (!rec.submitted) {
            rec.submitted = false;
            rec.status = "in_progress";
        }
        saveRecord(rec);
        setFeedback("Zwischengespeichert ✓", "ok");
    }

    async function handleDownload() {
        downloadBtn.disabled = true;
        try {
            const pid = currentParticipantId;
            const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
            mergePayloadIntoRecord(rec, collectPayload());
            if (!rec.submitted) rec.status = "in_progress";
            saveRecord(rec);
            const zipBlob = await buildZipBlob(rec);
            triggerBlobDownload(zipBlob, `${pid}.zip`);
            setFeedback(`ZIP heruntergeladen (${(zipBlob.size / 1024).toFixed(0)} KB) ✓`, "ok");
        } catch (err) {
            setFeedback("ZIP-Export fehlgeschlagen: " + err.message, "err");
        } finally {
            downloadBtn.disabled = false;
        }
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!confirm("Studie wirklich abschicken? Es wird eine ZIP-Datei mit Ihren Antworten und Audio-Aufnahmen heruntergeladen, die Sie an die Studienleitung senden.")) return;
        submitBtn.disabled = true;
        try {
            const pid = currentParticipantId;
            const rec = loadRecord(pid) || emptyRecord(pid, wenkerSentences.length);
            mergePayloadIntoRecord(rec, collectPayload());
            rec.submitted = true;
            rec.status = "submitted";
            rec.submitted_at = nowIso();
            saveRecord(rec);
            const zipBlob = await buildZipBlob(rec);
            triggerBlobDownload(zipBlob, `${pid}.zip`);
            setSubmittedBanner(rec);
            setFeedback(`Abgeschickt + ZIP heruntergeladen (${(zipBlob.size / 1024).toFixed(0)} KB) ✓`, "ok");
        } catch (err) {
            setFeedback("Abschicken fehlgeschlagen: " + err.message, "err");
        } finally {
            submitBtn.disabled = false;
        }
    }

    // ------------------------------- Boot ------------------------------------

    async function loadWenker() {
        const res = await fetch(WENKER_URL, { cache: "no-cache" });
        if (!res.ok) throw new Error("Wenkerbogen.json (" + res.status + ")");
        const data = await res.json();
        const std = (Array.isArray(data) ? data : []).find((e) => e && e.id === 0);
        if (!std || !Array.isArray(std.sentences)) throw new Error("Eintrag mit id=0 (Standarddeutsch) nicht gefunden.");
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

        // Vorsicht: laufende Aufnahme bei Verlassen der Seite stoppen
        window.addEventListener("beforeunload", () => {
            if (activeRecorder && activeRecorder.recorder.state === "recording") {
                try { activeRecorder.recorder.stop(); } catch (_) {}
            }
            if (mediaStream) {
                mediaStream.getTracks().forEach((t) => t.stop());
            }
        });
    }

    function showError(msg) {
        loadingEl.textContent = msg;
        loadingEl.classList.add("error");
    }

    function getIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return (params.get("id") || "").trim();
    }

    async function main() {
        const pid = getIdFromUrl();
        if (!pid) { showError("Keine Teilnehmer-ID in der URL. Bitte über die Startseite teilnehmen."); return; }
        if (!ID_RE.test(pid)) { showError("Die Teilnehmer-ID in der URL hat ein ungültiges Format."); return; }
        currentParticipantId = pid;

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
        renderSentences(wenkerSentences, record.translations, record.audio);
        applyRecordToForm(record);
        setSubmittedBanner(record);

        // Hinweis falls MediaRecorder gar nicht unterstützt wird
        if (typeof MediaRecorder === "undefined") {
            micStatus.textContent = "⚠ Audio-Aufnahme wird von diesem Browser nicht unterstützt. Schriftliche Übersetzung funktioniert normal.";
            micStatus.classList.add("err");
            sentencesList.querySelectorAll(".audio-bar .audio-btn").forEach((b) => { b.disabled = true; });
        }

        initEvents();
        loadingEl.hidden = true;
        formEl.hidden = false;
    }

    main();
})();
