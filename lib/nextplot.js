const { insertRow } = require('./supabase');

const ALLOW = (process.env.LINE_USER_ID_ALLOWLIST || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

/**
 * ประมวลผล event จาก LINE
 * - บันทึกลง public.messages
 * - คืนค่า { reply } เพื่อให้ webhook ต้นทางส่งกลับผู้ใช้
 */
async function processEvent(event) {
  const userId = event?.source?.userId;
  if (ALLOW.length && !ALLOW.includes(userId)) return null;
  if (event?.type !== 'message') return null;

  const type = event?.message?.type;
  if (type === 'text') {
    const text = event?.message?.text || '';

    // 1) บันทึกลง Supabase (ตาราง messages)
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

    // 2) ตรวจความครบถ้วน แล้วสร้าง Quick Reply ถ้าจำเป็น
    const needs = [];
    if (!/[A-Z]{2,10}-\d{1,4}/.test(text)) needs.push('CODE');
    if (!/(โฉนด|น\.ส\.3)\s*\d+/.test(text)) needs.push('เลขโฉนด');

    if (needs.length) {
      const reply = {
        type: 'text',
        text: `ข้อมูลยังไม่ครบ: ${needs.join(', ')}`,
        quickReply: {
          items: [
            { type: 'action', action: { type: 'message', label: 'กำหนด CODE',    text: 'กำหนด CODE WC-001' } },
            { type: 'action', action: { type: 'message', label: 'แนบรูปโฉนด',     text: 'แนบรูปโฉนด' } },
            { type: 'action', action: { type: 'message', label: 'บันทึกชั่วคราว', text: 'บันทึกชั่วคราว' } },
          ],
        },
      };
      return { reply };
    }

    // ข้อมูลครบพอแล้ว ตอบสั้นๆ
    return { reply: { type: 'text', text: 'รับข้อมูลแล้ว จัดกลุ่มเป็นแปลงให้เรียบร้อย' } };
  }

  // ประเภทอื่น (image/file) ไว้ต่อยอดอัปโหลด Storage ภายหลัง
  return null;
}

module.exports = { processEvent };
