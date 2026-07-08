const crypto = require('crypto');

/* Витягуємо значення кукі за назвою з заголовка Cookie */
function getCookieValue(cookieHeader, name) {
  if (!cookieHeader) return undefined;
  const match = cookieHeader.match(new RegExp('(?:^|; )' + name + '=([^;]+)'));
  return match ? decodeURIComponent(match[1]) : undefined;
}

/* SHA256-хешування (обов'язково для email/phone у Conversions API) */
function hash(value) {
  if (!value) return undefined;
  return crypto
    .createHash('sha256')
    .update(String(value).trim().toLowerCase())
    .digest('hex');
}

/* Нормалізація телефону: лишаємо тільки цифри, додаємо код країни якщо треба */
function normalizePhone(phone) {
  if (!phone) return undefined;
  let digits = phone.replace(/\D/g, '');
  if (digits.length === 10 && digits.startsWith('0')) {
    digits = '380' + digits.slice(1);
  }
  return digits;
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const pixelId = process.env.PIXEL_ID;
  const accessToken = process.env.FB_TOKEN;
  const testEventCode = process.env.FB_TEST_EVENT_CODE;

  if (!pixelId || !accessToken) {
    console.error('PIXEL_ID or FB_TOKEN is not set in environment variables');
    return { statusCode: 500, body: JSON.stringify({ error: 'Missing PIXEL_ID or FB_TOKEN' }) };
  }

  try {
    const data = JSON.parse(event.body || '{}');

    const cookieHeader = event.headers.cookie || event.headers.Cookie;
    const fbc = getCookieValue(cookieHeader, '_fbc');
    const fbp = getCookieValue(cookieHeader, '_fbp');

    const clientIp =
      event.headers['x-nf-client-connection-ip'] ||
      (event.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const userAgent = event.headers['user-agent'];

    const eventId = data.event_id || 'lead_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const eventPayload = {
      event_name: 'Lead',
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

    const response = await fetch(
      `https://graph.facebook.com/v19.0/${pixelId}/events?access_token=${accessToken}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('Facebook CAPI error:', result);
      return { statusCode: response.status, body: JSON.stringify(result) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, event_id: eventId, fb_response: result }),
    };
  } catch (err) {
    console.error('fb-event function error:', err);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
