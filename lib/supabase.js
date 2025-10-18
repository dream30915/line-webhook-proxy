'use strict';

// ใช้คีย์ Legacy (JWT) ที่คุณให้มาเป็น fallback ครบถ้วน
const FALLBACK = {
    SUPABASE_URL: 'https://xhcogxcmljnczwybqvia.supabase.co',
    // anon public (Legacy API Keys)
    SUPABASE_ANON_KEY:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoY29neGNtbGpuY3p3eWJxdmlhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjAxNTMwMDksImV4cCI6MjA3NTcyOTAwOX0.gwdg61bXoKLIYkDX_8wTt4wEd41IcEqz-jua9OSR0C8',
    // service_role secret (Legacy API Keys)
    SUPABASE_SERVICE_ROLE:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoY29neGNtbGpuY3p3eWJxdmlhIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDE1MzAwOSwiZXhwIjoyMDc1NzI5MDA5fQ.7NxMSeFlRti3EYc9EXqqtL7s4lMXDHIVJXKOth8YEQI',
    SUPABASE_BUCKET_NAME: 'nextplot',
};

const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK.SUPABASE_URL;
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || FALLBACK.SUPABASE_ANON_KEY;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE || FALLBACK.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET_NAME = process.env.SUPABASE_BUCKET_NAME || FALLBACK.SUPABASE_BUCKET_NAME;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE || !SUPABASE_ANON_KEY) {
    console.warn('[supabase] Missing URL/ANON/SERVICE_ROLE (using fallbacks if set).');
}

// apikey = ANON (legacy), Authorization = Bearer SERVICE_ROLE (legacy)
function jsonHeaders(asService = true) {
    const h = { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
    h.Authorization = `Bearer ${asService ? SUPABASE_SERVICE_ROLE : SUPABASE_ANON_KEY}`;
    return h;
}
function binHeaders(contentType = 'application/octet-stream', asService = true) {
    const h = { apikey: SUPABASE_ANON_KEY, 'Content-Type': contentType };
    h.Authorization = `Bearer ${asService ? SUPABASE_SERVICE_ROLE : SUPABASE_ANON_KEY}`;
    return h;
}

/**
 * Insert one row into a table via PostgREST (SERVICE_ROLE)
 */
async function insertRow(table, payload) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: { ...jsonHeaders(true), Prefer: 'return=representation' },
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
 * Ensure bucket exists (ignore 409 conflict)
 */
async function ensureBucket(bucket = SUPABASE_BUCKET_NAME) {
    const url = `${SUPABASE_URL}/storage/v1/bucket`;
    const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(true),
        body: JSON.stringify({ name: bucket, public: false }),
    });
    if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] ensureBucket failed', { url, status: res.status, text });
    }
}

/**
 * Upload binary buffer to Storage (SERVICE_ROLE)
 */
async function uploadBuffer(bucket, path, buffer, contentType = 'application/octet-stream') {
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: binHeaders(contentType, true),
        body: buffer,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] uploadBuffer failed', { url, status: res.status, text });
        throw new Error(`Supabase upload failed: ${res.status} ${text}`);
    }
}

/**
 * Get signed URL for a stored object (SERVICE_ROLE)
 */
async function signPath(bucket, path, expiresIn = 3600) {
    const url = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: jsonHeaders(true),
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