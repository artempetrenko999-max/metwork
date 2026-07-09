const crypto = require('crypto');

function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

function hash(value) {
  if (!value) return undefined;
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

function normalizePhone(phone) {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = '380' + digits.slice(1);
  }
  return digits;
}

const ALLOWED_EVENTS = ['PageView', 'Lead'];

module.exports = async (req, res) => {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const pixelId = process.env.PIXEL_ID;
  const accessToken = process.env.FB_TOKEN;
  const testEventCode = process.env.FB_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.error('PIXEL_ID or FB_TOKEN is not set in environment variables');
    res.status(500).json({ error: 'Missing PIXEL_ID or FB_TOKEN' });
    return;
  }

  try {
    const data = typeof req.body === 'string' ? JSON.parse(req.body || '{}') : (req.body || {});

    const eventName = ALLOWED_EVENTS.includes(data.event_name) ? data.event_name : 'Lead';

    const cookieHeader = req.headers.cookie;
    const fbc = getCookieValue(cookieHeader, '_fbc');
    const fbp = getCookieValue(cookieHeader, '_fbp');

    const clientIp =
      req.headers['x-real-ip'] ||
      (req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const userAgent = req.headers['user-agent'];

    const eventId =
      data.event_id ||
      eventName.toLowerCase() + '_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const eventPayload = {
      event_name: eventName,
      event_time: Math.floor(Date.now() / 1000),
      event_id: eventId,
      action_source: 'website',
      event_source_url: data.event_source_url,
      user_data: {
        ph: normalizePhone(data.phone) ? [hash(normalizePhone(data.phone))] : undefined,
        fn: data.name ? [hash(data.name)] : undefined,
        client_ip_address: clientIp,
        client_user_agent: userAgent,
        fbc: fbc,
        fbp: fbp,
      },
      custom_data: {
        content_name: 'METWORK — Підставка для бутлів',
        color: data.color,
        utm_source: data.utm_source,
        utm_medium: data.utm_medium,
        utm_campaign: data.utm_campaign,
        utm_content: data.utm_content,
        utm_term: data.utm_term,
      },
    };

    const payload = { data: [eventPayload] };

    if (testEventCode) {
      payload.test_event_code = testEventCode;
    }

    const fbResponse = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const result = await fbResponse.json();

    if (!fbResponse.ok) {
      console.error('Facebook CAPI error:', result);
      res.status(fbResponse.status).json(result);
      return;
    }

    res.status(200).json({ success: true, event_id: eventId, event_name: eventName, fb_response: result });
  } catch (err) {
    console.error('fb-event function error:', err);
    res.status(500).json({ error: err.message });
  }
};
