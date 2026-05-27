// Landing page – clientseitig (statische Website / GitHub Pages)
(function () {
    "use strict";

    const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

    function newParticipantId() {
        // 12-stellige zufällige ID aus A-Za-z0-9 (kryptographisch sicher)
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
        const bytes = new Uint8Array(12);
        (window.crypto || window.msCrypto).getRandomValues(bytes);
        let s = "";
        for (let i = 0; i < bytes.length; i++) {
            s += alphabet[bytes[i] % alphabet.length];
        }
        return s;
    }

    const startBtn = document.getElementById("start-btn");
    const resumeForm = document.getElementById("resume-form");
    const resumeInput = document.getElementById("resume-id");

    startBtn.addEventListener("click", () => {
        const pid = newParticipantId();
        window.location.href = `study.html?id=${encodeURIComponent(pid)}`;
    });

    resumeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = (resumeInput.value || "").trim();
        if (!id) {
            resumeInput.focus();
            return;
        }
        if (!ID_RE.test(id)) {
            alert("Die Teilnehmer-ID hat ein ungültiges Format.");
            return;
        }
        window.location.href = `study.html?id=${encodeURIComponent(id)}`;
    });
})();
