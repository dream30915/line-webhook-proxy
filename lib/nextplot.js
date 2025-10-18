'use strict';

const { insertRow } = require('./supabase');

const ALLOW = (process.env.LINE_USER_ID_ALLOWLIST || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);

/**
 * ประมวลผล event จาก LINE
 * - เฉพาะ owner (allowlist) เท่านั้น
 * - บันทึกข้อความลง public.messages
 * - ถ้าข้อมูลไม่ครบ (CODE, เลขโฉนด) → คืน Quick Reply
 * - ถ้าครบพอ → ตอบรับสั้นๆ
 *
 * Return:
 *   { reply: LINEMessageObject } | null
 */
async function processEvent(event) {
    const userId = event?.source?.userId;
    if (ALLOW.length && !ALLOW.includes(userId)) return null;
    if (event?.type !== 'message') return null;

    const msg = event?.message;
    if (!msg || msg.type !== 'text') return null;

    const text = msg.text || '';

    // 1) บันทึกลง Supabase (ไม่ทำให้ webhook ล่มถ้า fail)
    try {
        await insertRow('messages', {
            user_id: userId || 'unknown',
            event_type: 'text',
            text_content: text,
            raw: event,
        });
    } catch (e) {
        console.warn('[nextplot] insert messages failed:', e.message);
    }

    // 2) ตรวจความครบถ้วน
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

    // ข้อมูลครบพอแล้ว
    return { reply: { type: 'text', text: 'รับข้อมูลแล้ว จัดกลุ่มเป็นแปลงให้เรียบร้อย' } };
}

module.exports = { processEvent };