const crypto = require('crypto');

const PIXEL_ID = process.env.PIXEL_ID;
const FB_TOKEN = process.env.FB_TOKEN;

function sha256(value) {
  return crypto.createHash('sha256').update(value.trim().toLowerCase()).digest('hex');
}

exports.handler = async function (event) {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, body: 'Invalid JSON' };
  }

  const { name, phone, color, utm_source, utm_medium, utm_campaign, utm_content, utm_term } = body;

  // Normalize phone: keep digits and + only
  const phoneClean = (phone || '').replace(/[^\d+]/g, '');

  const fbPayload = {
    data: [
      {
        event_name: 'Lead',
        event_time: Math.floor(Date.now() / 1000),
        action_source: 'website',
        user_data: {
          ph: phoneClean ? [sha256(phoneClean)] : undefined,
          fn: name ? [sha256(name)] : undefined,
        },
        custom_data: {
          color: color || '',
          utm_source:   utm_source   || '',
          utm_medium:   utm_medium   || '',
          utm_campaign: utm_campaign || '',
          utm_content:  utm_content  || '',
          utm_term:     utm_term     || '',
        },
      },
    ],
  };

  try {
    const response = await fetch(
      `https://graph.facebook.com/v19.0/${PIXEL_ID}/events?access_token=${FB_TOKEN}`,
      {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(fbPayload),
      }
    );

    const result = await response.json();

    if (!response.ok) {
      console.error('FB CAPI error:', JSON.stringify(result));
      return { statusCode: 502, body: JSON.stringify({ error: result }) };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, events_received: result.events_received }),
    };
  } catch (err) {
    console.error('Fetch error:', err.message);
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) };
  }
};
