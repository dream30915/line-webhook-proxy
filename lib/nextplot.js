'use strict';

const {
    SUPABASE_BUCKET_NAME,
    insertRow,
    ensureBucket,
    uploadBuffer,
    signPath,
} = require('./supabase');

const ALLOW = (process.env.LINE_USER_ID_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

const LINE_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

/**
 * Fetch binary content of a LINE message by messageId
 */
async function fetchLineContent(messageId) {
    const url = `https://api-data.line.me/v2/bot/message/${encodeURIComponent(messageId)}/content`;
    const res = await fetch(url, {
        method: 'GET',
        headers: { Authorization: `Bearer ${LINE_TOKEN}` },
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`LINE content fetch failed: ${res.status} ${txt}`);
    }
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    const ct = res.headers.get('content-type') || 'application/octet-stream';
    return { buffer: buf, contentType: ct };
}

function nowPathPrefix() {
    const d = new Date();
    const yyyy = d.getUTCFullYear();
    const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
    const dd = String(d.getUTCDate()).padStart(2, '0');
    return `${yyyy}/${mm}/${dd}`;
}

/**
 * ประมวลผล event จาก LINE
 * - text: บันทึกลง messages + Quick Reply ถ้าไม่ครบ
 * - image/file: ดึงคอนเทนต์ → อัปโหลด Storage → เซ็น URL → บันทึกลง messages
 */
async function processEvent(event) {
    const userId = event?.source?.userId;
    if (ALLOW.length && !ALLOW.includes(userId)) return null;
    if (event?.type !== 'message') return null;

    const msg = event?.message;
    if (!msg) return null;

    // TEXT
    if (msg.type === 'text') {
        const text = msg.text || '';

        try {
            await insertRow('messages', {
                user_id: userId || 'unknown',
                event_type: 'text',
                text_content: text,
                raw: event,
            });
        } catch (e) {
            console.warn('[nextplot] insert messages(text) failed:', e.message);
        }

        const needs = [];
        if (!/[A-Z]{2,10}-\d{1,4}/.test(text)) needs.push('CODE');
        if (!/(โฉนด|น\.ส\.3)\s*\d+/.test(text)) needs.push('เลขโฉนด');

        if (needs.length) {
            return {
                reply: {
                    type: 'text',
                    text: `ข้อมูลยังไม่ครบ: ${needs.join(', ')}`,
                    quickReply: {
                        items: [
                            { type: 'action', action: { type: 'message', label: 'กำหนด CODE', text: 'กำหนด CODE WC-001' } },
                            { type: 'action', action: { type: 'message', label: 'แนบรูปโฉนด', text: 'แนบรูปโฉนด' } },
                            { type: 'action', action: { type: 'message', label: 'บันทึกชั่วคราว', text: 'บันทึกชั่วคราว' } },
                        ],
                    },
                },
            };
        }
        return { reply: { type: 'text', text: 'รับข้อมูลแล้ว จัดกลุ่มเป็นแปลงให้เรียบร้อย' } };
    }

    // IMAGE or FILE
    if (msg.type === 'image' || msg.type === 'file') {
        if (!LINE_TOKEN) {
            console.warn('[nextplot] Missing LINE_CHANNEL_ACCESS_TOKEN for content fetch');
            return null;
        }

        const messageId = msg.id;
        let filename = msg.fileName || `${messageId}`;
        let defaultExt = msg.type === 'image' ? '.jpg' : '';
        try {
            const { buffer, contentType } = await fetchLineContent(messageId);
            const prefix = nowPathPrefix();
            // ถ้าไม่มีนามสกุล ให้เดาจาก content-type
            if (!/\.[a-z0-9]+$/i.test(filename)) {
                if (contentType.startsWith('image/')) {
                    defaultExt = '.' + contentType.split('/')[1].replace(/jpeg/, 'jpg');
                }
                filename = filename + defaultExt;
            }
            const storagePath = `line/${prefix}/${filename}`;

            await ensureBucket(SUPABASE_BUCKET_NAME);
            await uploadBuffer(SUPABASE_BUCKET_NAME, storagePath, buffer, contentType);
            const signedURL = await signPath(SUPABASE_BUCKET_NAME, storagePath, 3600);

            try {
                await insertRow('messages', {
                    user_id: userId || 'unknown',
                    event_type: msg.type,
                    text_content: filename,
                    raw: {
                        ...event,
                        media: {
                            bucket: SUPABASE_BUCKET_NAME,
                            path: storagePath,
                            contentType,
                            signedURL,
                        },
                    },
                });
            } catch (e) {
                console.warn('[nextplot] insert messages(media) failed:', e.message);
            }

            return { reply: { type: 'text', text: 'รับสื่อแล้ว อัปโหลดเก็บไว้เรียบร้อย' } };
        } catch (e) {
            console.warn('[nextplot] media pipeline failed:', e.message);
            return { reply: { type: 'text', text: 'รับสื่อแล้ว แต่มีปัญหาในการบันทึก' } };
        }
    }

    return null;
}

module.exports = { processEvent };