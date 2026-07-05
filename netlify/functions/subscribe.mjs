// Newsletter signup endpoint. The on-site form (NewsletterSignup.astro) posts here;
// we add the contact to Plunk (subscribed) via /v1/track, which Plunk gates behind
// the PUBLIC key (pk_) — safe to hold server-side here so we can enforce validation
// + the honeypot before forwarding. Netlify v2 function → /.netlify/functions/subscribe.

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'Content-Type': 'application/json' } });

export default async (req) => {
  if (req.method !== 'POST') return json({ ok: false, error: 'method' }, 405);

  let data;
  try { data = await req.json(); } catch { return json({ ok: false, error: 'bad_request' }, 400); }

  const email = String(data.email || '').trim().toLowerCase();
  const source = String(data.source || 'unknown').slice(0, 40);

  // Honeypot: a real user never fills this. Pretend success, add nothing.
  if (data.company) return json({ ok: true });

  if (!EMAIL_RE.test(email)) return json({ ok: false, error: 'invalid_email' }, 400);

  const key = process.env.PLUNK_PUBLIC_KEY; // pk_ — /v1/track requires the public key
  if (!key) return json({ ok: false, error: 'not_configured' }, 500);

  // Plunk /v1/track upserts the contact, marks them subscribed, and fires an
  // event we can later hang a welcome automation off of.
  const res = await fetch('https://next-api.useplunk.com/v1/track', {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      event: 'newsletter-signup',
      email,
      subscribed: true,
      data: { source },
    }),
  });

  if (!res.ok) return json({ ok: false, error: 'upstream' }, 502);
  return json({ ok: true });
};
