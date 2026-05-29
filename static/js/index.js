// Landing page – clientseitig (statische Website / GitHub Pages)
// Einwilligungs-Flow + ID-Erzeugung + Resume.
(function () {
    "use strict";

    const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

    function newParticipantId() {
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const bytes = new Uint8Array(12);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        let s = "";
        for (let i = 0; i < bytes.length; i++) s += alphabet[bytes[i] % alphabet.length];
        return s;
    }

    // -------- Datenschutz-Texte aus Config befüllen --------
    function applyConfigToConsentTexts() {
        const cfg = window.WENKER_CONFIG || {};
        const set = (id, text) => {
            const el = document.getElementById(id);
            if (el) el.textContent = text;
        };
        set("consent-institution", cfg.INSTITUTION || "[Institution]");
        set("consent-leader", cfg.STUDY_LEADER || "[Studienleitung]");
        set("consent-region", cfg.STORAGE_REGION || "[Speicherort]");
        set("consent-retention", cfg.RETENTION || "[Aufbewahrungsdauer]");
        const mailEl = document.getElementById("consent-email");
        if (mailEl) {
            const email = cfg.CONTACT_EMAIL || "[kontakt@example.org]";
            mailEl.textContent = email;
            mailEl.href = email.startsWith("mailto:") ? email : ("mailto:" + email);
        }
    }

    const startBtn = document.getElementById("start-btn");
    const consentCheck = document.getElementById("consent-check");
    const resumeForm = document.getElementById("resume-form");
    const resumeInput = document.getElementById("resume-id");

    function syncStartBtn() {
        startBtn.disabled = !consentCheck.checked;
        startBtn.title = consentCheck.checked
            ? ""
            : "Bitte zuerst die Einwilligung bestätigen.";
    }

    function init() {
        applyConfigToConsentTexts();
        syncStartBtn();
        consentCheck.addEventListener("change", syncStartBtn);

        startBtn.addEventListener("click", () => {
            if (!consentCheck.checked) {
                syncStartBtn();
                return;
            }
            // Einwilligungs-Zeitstempel für später lokal merken (wird beim
            // Anlegen des Records in study.js übernommen)
            try {
                sessionStorage.setItem(
                    "wenker_study::consent_at",
                    new Date().toISOString()
                );
            } catch (_) { /* ignore */ }
            const pid = newParticipantId();
            window.location.href = `study.html?id=${encodeURIComponent(pid)}`;
        });

        resumeForm.addEventListener("submit", (e) => {
            e.preventDefault();
            const id = (resumeInput.value || "").trim();
            if (!id) { resumeInput.focus(); return; }
            if (!ID_RE.test(id)) {
                alert("Die Teilnehmer-ID hat ein ungültiges Format.");
                return;
            }
            window.location.href = `study.html?id=${encodeURIComponent(id)}`;
        });
    }

    if (document.readyState === "loading") {
        document.addEventListener("DOMContentLoaded", init);
    } else {
        init();
    }
})();
