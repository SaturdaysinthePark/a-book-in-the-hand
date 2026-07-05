// On-brand unsubscribe endpoint. The /unsubscribe page posts the recipient's email
// (from ?email= in the campaign's unsubscribe link, resolved by Plunk's {{email}} tag)
// and we flip them to unsubscribed in Plunk via /v1/track — which, like subscribe,
// is gated behind the PUBLIC key (pk_). Netlify v2 → /.netlify/functions/unsubscribe.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  let data;
  try { data = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }

  const email = String(data.email || '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);

  const key = process.env.PLUNK_PUBLIC_KEY; // pk_ — /v1/track requires the public key
  if (!key) return json({ ok: false, error: 'not_configured' }, 500);

  const res = await fetch('https://next-api.useplunk.com/v1/track', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ event: 'newsletter-unsubscribe', email, subscribed: false }),
  });

  if (!res.ok) return json({ ok: false, error: 'upstream' }, 502);
  return json({ ok: true });
};
