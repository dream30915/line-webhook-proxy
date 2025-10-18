'use strict';

/**
 * Supabase helper adapted for new API keys (sb_publishable_... and sb_secret_...)
 *
 * Behavior:
 * - Use ENV SUPABASE_URL, SUPABASE_SB_PUBLISHABLE, SUPABASE_SB_SECRET.
 * - For server operations we send:
 *     - header "apikey": sb_publishable_xxx
 *     - header "Authorization: Bearer <sb_secret_xxx>"
 *
 * NOTE: Do not commit real secrets to the repo. Use Vercel ENV for production.
 */

const SUPABASE_URL =
    process.env.SUPABASE_URL || 'https://xhcogxcmljnczwybqvia.supabase.co';

// New-key names (set these in Vercel / local env)
const SUPABASE_SB_PUBLISHABLE = process.env.SUPABASE_SB_PUBLISHABLE || '<PASTE_SB_PUBLISHABLE_HERE>';
const SUPABASE_SB_SECRET = process.env.SUPABASE_SB_SECRET || '<PASTE_SB_SECRET_HERE>';

const SUPABASE_BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || 'nextplot';

if (!SUPABASE_URL || !SUPABASE_SB_PUBLISHABLE || !SUPABASE_SB_SECRET) {
    console.warn('[supabase] Missing SUPABASE_URL or SB keys (use ENV SUPABASE_SB_PUBLISHABLE and SUPABASE_SB_SECRET).');
}

function jsonHeaders(asService = true) {
    // For new API key scheme: apikey = publishable, Authorization = Bearer sb_secret
    const h = {
        apikey: SUPABASE_SB_PUBLISHABLE,
        'Content-Type': 'application/json',
        Authorization: `Bearer ${SUPABASE_SB_SECRET}`,
    };
    return h;
}

function binHeaders(contentType = 'application/octet-stream') {
    return {
        apikey: SUPABASE_SB_PUBLISHABLE,
        'Content-Type': contentType,
        Authorization: `Bearer ${SUPABASE_SB_SECRET}`,
    };
}

/**
 * Insert row into table via PostgREST (/rest/v1/<table>).
 * Returns the representation (JSON) of the inserted row.
 */
async function insertRow(table, payload) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...jsonHeaders(), Prefer: 'return=representation' },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] insertRow failed', { url, status: res.status, text });
        throw new Error(`Supabase insert ${table} failed: ${res.status} ${text}`);
    }
    return res.json();
}

/**
 * Ensure bucket exists (using Storage API)
 */
async function ensureBucket(bucket = SUPABASE_BUCKET_NAME) {
    const url = `${SUPABASE_URL}/storage/v1/bucket`;
    const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ name: bucket, public: false }),
    });
    if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] ensureBucket failed', { url, status: res.status, text });
    }
}

/**
 * Upload binary buffer to Storage
 */
async function uploadBuffer(bucket, path, buffer, contentType = 'application/octet-stream') {
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: binHeaders(contentType),
        body: buffer,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] uploadBuffer failed', { url, status: res.status, text });
        throw new Error(`Supabase upload failed: ${res.status} ${text}`);
    }
}

/**
 * Sign a path (get signed URL)
 */
async function signPath(bucket, path, expiresIn = 3600) {
    const url = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(),
        body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] signPath failed', { url, status: res.status, text });
        throw new Error(`Supabase sign URL failed: ${res.status} ${text}`);
    }
    const data = await res.json();
    return `${SUPABASE_URL}${data.signedURL}`;
}

module.exports = {
    SUPABASE_BUCKET_NAME,
    insertRow,
    ensureBucket,
    uploadBuffer,
    signPath,
};