const crypto = require('crypto')

// อ่าน raw body (ต้องใช้ถ้าจะตรวจลายเซ็น)
function readRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = ''
    req.setEncoding('utf8')
    req.on('data', chunk => { data += chunk })
    req.on('end', () => resolve(data))
    req.on('error', reject)
  })
}

function send(res, code, obj) {
  res.statusCode = code
  res.setHeader('Content-Type', 'application/json')
  res.end(JSON.stringify(obj))
}

function safeEqual(a, b) {
  const aa = Buffer.from(String(a || ''), 'utf8')
  const bb = Buffer.from(String(b || ''), 'utf8')
  if (aa.length !== bb.length) return false
  return crypto.timingSafeEqual(aa, bb)
}

module.exports = async (req, res) => {
  if (req.method !== 'POST') return send(res, 405, { ok: false, error: 'Method Not Allowed' })

  const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN || ''
  const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET || ''
  const RELAXED = String(process.env.LINE_SIGNATURE_RELAXED || 'true').toLowerCase() === 'true'
  const FORWARD = process.env.FORWARD_WEBHOOK_URL || '' // ถ้าจะ proxy ต่อไปปลายทางอื่น

  let raw = ''
  try {
    raw = await readRawBody(req)
  } catch (e) {
    return send(res, 400, { ok: false, error: 'cannot read body' })
  }

  // ตรวจลายเซ็น (ปิดได้ตอน dev ด้วย RELAXED=true)
  if (!RELAXED) {
    const sig = req.headers['x-line-signature']
    const expect = crypto.createHmac('sha256', CHANNEL_SECRET).update(raw).digest('base64')
    if (!safeEqual(sig, expect)) {
      return send(res, 401, { ok: false, error: 'invalid signature' })
    }
  }

  let payload = {}
  try {
    payload = raw ? JSON.parse(raw) : {}
  } catch (_e) {
    // ตอบ 200 เพื่อลด retry จาก LINE
    return send(res, 200, { ok: true, note: 'invalid json but acknowledged' })
  }

  const events = Array.isArray(payload.events) ? payload.events : []

  // ตัวอย่าง: ตอบ echo ถ้าใส่ ACCESS_TOKEN
  if (ACCESS_TOKEN) {
    for (const ev of events) {
      if (ev?.type === 'message' && ev.message?.type === 'text' && ev.replyToken) {
        try {
          await fetch('https://api.line.me/v2/bot/message/reply', {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${ACCESS_TOKEN}`,
              'Content-Type': 'application/json'
            },
            body: JSON.stringify({
              replyToken: ev.replyToken,
              messages: [{ type: 'text', text: `You said: ${ev.message.text}` }]
            })
          })
        } catch (_) {}
      }
    }
  }

  // ทางเลือก: ส่งต่อ raw body ไปปลายทางอื่น
  if (FORWARD) {
    try {
      await fetch(FORWARD, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: raw })
    } catch (_) {}
  }

  return send(res, 200, { ok: true })
}
