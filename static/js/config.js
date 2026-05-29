/**
 * Wenker-Studie · Frontend-Konfiguration
 * --------------------------------------
 * Vor dem ersten Deployment ausfüllen.
 *
 * WORKER_URL       URL des Cloudflare-Workers, der die Uploads annimmt
 *                  (siehe worker/README.md). Leerlassen für reinen
 *                  Offline-Modus (nur ZIP-Download, kein Upload).
 * INSTITUTION      Name der durchführenden Stelle (Universität, Institut)
 * STUDY_LEADER     Name der/des Studienverantwortlichen
 * CONTACT_EMAIL    Kontakt-Email für Widerruf, Löschanfragen, Rückfragen
 * STORAGE_REGION   Speicherort der Daten (z.B. "Cloudflare R2, EU (Frankfurt)")
 * RETENTION        Aufbewahrungsdauer (z.B. "10 Jahre nach Abschluss
 *                  der Studie, gemäß DFG-Empfehlung")
 */
window.WENKER_CONFIG = {
    WORKER_URL: "https://ma-dialekt-studie-upload.ma-dialekt-studie.workers.dev",
    INSTITUTION: "Technische Universität Berlin / Fakultät IV",
    STUDY_LEADER: "Christoph Rauchegger",
    CONTACT_EMAIL: "rauchegger@campus.tu-berlin.de",
    STORAGE_REGION: "Cloudflare R2 (EU)",
    RETENTION: "unbefristet, ausschließlich zu wissenschaftlichen Forschungszwecken (Art. 89 DSGVO) – Löschung jederzeit auf Ihren Widerruf hin",
};
