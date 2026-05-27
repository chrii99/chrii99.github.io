// Landing page interactions
(function () {
    "use strict";

    const startBtn = document.getElementById("start-btn");
    const resumeForm = document.getElementById("resume-form");
    const resumeInput = document.getElementById("resume-id");

    startBtn.addEventListener("click", async () => {
        startBtn.disabled = true;
        startBtn.textContent = "Teilnehmer-ID wird erstellt …";
        try {
            const res = await fetch("/api/start", { method: "POST" });
            if (!res.ok) {
                throw new Error("Server-Fehler: " + res.status);
            }
            const data = await res.json();
            if (!data.participant_id) {
                throw new Error("Keine Teilnehmer-ID erhalten.");
            }
            window.location.href = `/study?id=${encodeURIComponent(data.participant_id)}`;
        } catch (err) {
            startBtn.disabled = false;
            startBtn.textContent = "An der Studie teilnehmen";
            alert("Die Teilnehmer-ID konnte nicht erstellt werden.\n" + err.message);
        }
    });

    resumeForm.addEventListener("submit", (e) => {
        e.preventDefault();
        const id = (resumeInput.value || "").trim();
        if (!id) {
            resumeInput.focus();
            return;
        }
        if (!/^[A-Za-z0-9_-]{6,64}$/.test(id)) {
            alert("Die Teilnehmer-ID hat ein ungültiges Format.");
            return;
        }
        window.location.href = `/study?id=${encodeURIComponent(id)}`;
    });
})();
