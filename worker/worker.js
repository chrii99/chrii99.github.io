/**
 * Cloudflare Worker · Wenker-Studie Upload-Endpoint
 * --------------------------------------------------
 * Nimmt vom Browser geschickte ZIP-Submissions entgegen und legt sie in
 * R2 ab unter `submissions/<participant_id>/<iso_timestamp>.zip`.
 *
 * Bindings (in wrangler.toml konfiguriert):
 *   - env.STUDY_BUCKET     (R2 Bucket)
 *   - env.ALLOWED_ORIGIN   (z.B. "https://<USER>.github.io")
 *   - env.MAX_BYTES        (optional, default 50 MB)
 *
 * Endpunkte:
 *   OPTIONS /submit      CORS-Preflight
 *   POST    /submit      Upload (Body = ZIP, Header X-Participant-Id)
 *   GET     /health      Liveness-Check
 */

const ID_RE = /^[A-Za-z0-9_-]{6,64}$/;

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        const cors = corsHeaders(env);

        // CORS-Preflight
        if (request.method === "OPTIONS") {
            return new Response(null, { status: 204, headers: cors });
        }

        // Health-Check
        if (url.pathname === "/health" && request.method === "GET") {
            return json({ ok: true, service: "wenker-study-upload" }, 200, cors);
        }

        // Upload
        if (url.pathname === "/submit" && request.method === "POST") {
            return handleSubmit(request, env, cors);
        }

        return json({ error: "Not found" }, 404, cors);
    },
};

async function handleSubmit(request, env, cors) {
    // 1) Participant-ID validieren
    const pid = (request.headers.get("x-participant-id") || "").trim();
    if (!ID_RE.test(pid)) {
        return json({ error: "Ungültige oder fehlende Teilnehmer-ID." }, 400, cors);
    }

    // 2) Content-Type prüfen
    const ct = (request.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("application/zip") && !ct.includes("application/octet-stream")) {
        return json({ error: "Erwarteter Content-Type: application/zip" }, 415, cors);
    }

    // 3) Größenlimit (per Content-Length geprüft, R2-Put streamt)
    const maxBytes = parseInt(env.MAX_BYTES || "52428800", 10); // 50 MB Default
    const contentLength = parseInt(request.headers.get("content-length") || "0", 10);
    if (!contentLength) {
        return json({ error: "Content-Length-Header fehlt." }, 411, cors);
    }
    if (contentLength > maxBytes) {
        return json({ error: `Datei zu groß (>${Math.round(maxBytes / 1024 / 1024)} MB).` }, 413, cors);
    }
    if (contentLength < 200) {
        // Ein realistischer ZIP-Submit ist nie unter ein paar hundert Bytes
        return json({ error: "Datei zu klein – sieht nicht nach einer gültigen Studien-Abgabe aus." }, 400, cors);
    }

    // 4) In R2 ablegen
    const submittedAt = new Date().toISOString();
    const safeStamp = submittedAt.replace(/[:.]/g, "-");
    const key = `submissions/${pid}/${safeStamp}.zip`;

    try {
        await env.STUDY_BUCKET.put(key, request.body, {
            httpMetadata: { contentType: "application/zip" },
            customMetadata: {
                participantId: pid,
                submittedAt,
                userAgent: (request.headers.get("user-agent") || "").slice(0, 200),
                contentLength: String(contentLength),
            },
        });
    } catch (err) {
        return json({ error: "Speichern fehlgeschlagen.", detail: String(err && err.message || err) }, 500, cors);
    }

    return json(
        {
            ok: true,
            participant_id: pid,
            submitted_at: submittedAt,
            storage_key: key,
            size_bytes: contentLength,
        },
        200,
        cors
    );
}

function corsHeaders(env) {
    const origin = env.ALLOWED_ORIGIN || "*";
    return {
        "Access-Control-Allow-Origin": origin,
        "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type, X-Participant-Id",
        "Access-Control-Max-Age": "86400",
        "Vary": "Origin",
    };
}

function json(body, status, extraHeaders) {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "Content-Type": "application/json; charset=utf-8", ...extraHeaders },
    });
}
