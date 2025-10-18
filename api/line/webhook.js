'use strict';

const crypto = require('crypto');
const { processEvent } = require('../../lib/nextplot');

function isTrue(val) {
  const s = String(val ?? '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function sendLineReply(replyToken, message) {
  if (!replyToken) return;
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) {
    console.warn('[webhook] Missing LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }
  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn('[webhook] LINE reply failed:', res.status, txt);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const raw = await getRawBody(req);
    const signature = req.headers['x-line-signature'];
    const secret = process.env.LINE_CHANNEL_SECRET || '';
    const relaxed = isTrue(process.env.LINE_SIGNATURE_RELAXED);

    if (!relaxed) {
      if (!signature || !secret) {
        return res.status(401).json({ ok: false, error: 'missing_signature_or_secret' });
      }
      const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
      if (computed !== signature) {
        return res.status(401).json({ ok: false, error: 'invalid_signature' });
      }
    }

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    const events = Array.isArray(body.events) ? body.events : [];
    for (const event of events) {
      try {
        const result = await processEvent(event);
        if (result?.reply) {
          await sendLineReply(event.replyToken, result.reply);
        }
      } catch (e) {
        console.warn('[webhook] nextplot process failed:', e?.message || e);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[webhook] fatal', e?.stack || e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
}; 'use strict';

const crypto = require('crypto');
const { processEvent } = require('../../lib/nextplot');

// Fallback values (ใช้เมื่อ process.env ไม่มีค่า)
const FALLBACK = {
  LINE_CHANNEL_SECRET: '7b61f77577cc663a7b62ba17051ef7ff',
  LINE_SIGNATURE_RELAXED: 'false',
};

function isTrue(val) {
  const s = String(val ?? '').toLowerCase();
  return s === 'true' || s === '1' || s === 'yes';
}

function getRawBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => (data += chunk));
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

async function sendLineReply(replyToken, message) {
  if (!replyToken) return;

  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN || '';
  if (!token) {
    console.warn('[webhook] Missing LINE_CHANNEL_ACCESS_TOKEN');
    return;
  }

  const res = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ replyToken, messages: [message] }),
  });

  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    console.warn('[webhook] LINE reply failed:', res.status, txt);
  }
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') {
      res.setHeader('Allow', 'POST');
      return res.status(405).json({ ok: false, error: 'method_not_allowed' });
    }

    const raw = await getRawBody(req);

    const signature = req.headers['x-line-signature'];
    const secret =
      process.env.LINE_CHANNEL_SECRET || FALLBACK.LINE_CHANNEL_SECRET;
    const relaxed = isTrue(
      process.env.LINE_SIGNATURE_RELAXED ?? FALLBACK.LINE_SIGNATURE_RELAXED
    );

    if (!relaxed) {
      if (!signature || !secret) {
        return res
          .status(401)
          .json({ ok: false, error: 'missing_signature_or_secret' });
      }
      const computed = crypto.createHmac('sha256', secret).update(raw).digest('base64');
      if (computed !== signature) {
        return res.status(401).json({ ok: false, error: 'invalid_signature' });
      }
    }

    let body = {};
    try {
      body = raw ? JSON.parse(raw) : {};
    } catch {
      return res.status(400).json({ ok: false, error: 'invalid_json' });
    }

    const events = Array.isArray(body.events) ? body.events : [];
    for (const event of events) {
      try {
        const result = await processEvent(event);
        if (result?.reply) {
          await sendLineReply(event.replyToken, result.reply);
        }
      } catch (e) {
        console.warn('[webhook] nextplot process failed:', e?.message || e);
      }
    }

    return res.status(200).json({ ok: true });
  } catch (e) {
    console.error('[webhook] fatal', e?.stack || e);
    return res.status(500).json({ ok: false, error: 'internal_error' });
  }
};