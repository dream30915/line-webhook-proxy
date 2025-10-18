'use strict';

// Fallback values (ใช้เมื่อ process.env ไม่มีค่า)
const FALLBACK = {
    SUPABASE_URL: 'https://xhcogxcmljnczwybqvia.supabase.co',
    SUPABASE_SERVICE_ROLE:
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhoY29neGNtbGpuY3p3eWJxdmlhIiwicm9zZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc2MDE1MzAwOSwiZXhwIjoyMDc1NzI5MDA5fQ.7NxMSeFlRti3EYc9EXqqtL7s4lMXDHIVJXKOth8YEQI',
    SUPABASE_BUCKET_NAME: 'nextplot',
};

const SUPABASE_URL = process.env.SUPABASE_URL || FALLBACK.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE =
    process.env.SUPABASE_SERVICE_ROLE || FALLBACK.SUPABASE_SERVICE_ROLE;
const SUPABASE_BUCKET_NAME =
    process.env.SUPABASE_BUCKET_NAME || FALLBACK.SUPABASE_BUCKET_NAME;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env/fallback.');
}

/**
 * Insert one row into a table via PostgREST
 */
async function insertRow(table, payload) {
    const url = `${SUPABASE_URL}/rest/v1/${table}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            'Content-Type': 'application/json',
            Prefer: 'return=representation',
        },
        body: JSON.stringify(payload),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
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
        headers: {
            apikey: SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name: bucket, public: false }),
    });
    if (!res.ok && res.status !== 409) {
        const text = await res.text().catch(() => '');
        console.warn('[supabase] ensureBucket failed:', res.status, text);
    }
}

/**
 * Upload binary buffer to Storage
 */
async function uploadBuffer(bucket, path, buffer, contentType = 'application/octet-stream') {
    const url = `${SUPABASE_URL}/storage/v1/object/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            'Content-Type': contentType,
        },
        body: buffer,
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Supabase upload failed: ${res.status} ${text}`);
    }
}

/**
 * Get signed URL for a stored object
 */
async function signPath(bucket, path, expiresIn = 3600) {
    const url = `${SUPABASE_URL}/storage/v1/object/sign/${encodeURIComponent(bucket)}/${path}`;
    const res = await fetch(url, {
        method: 'POST',
        headers: {
            apikey: SUPABASE_SERVICE_ROLE,
            Authorization: `Bearer ${SUPABASE_SERVICE_ROLE}`,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ expiresIn }),
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
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