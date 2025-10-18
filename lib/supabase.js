'use strict';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE) {
    console.warn('[supabase] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE env.');
}

/**
 * Insert one row into Supabase (PostgREST)
 * - table: string (e.g. "messages")
 * - payload: object
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

module.exports = { insertRow };