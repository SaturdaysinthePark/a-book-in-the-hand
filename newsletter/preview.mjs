// Preview a saved newsletter issue by emailing it to yourself via Resend.
//
// This uses Resend's TRANSACTIONAL /emails API + the shared onboarding@resend.dev sender,
// which only delivers to your own Resend account email — perfect for a private preview.
// The REAL send goes out as a Resend Broadcast (paste the issue HTML in the dashboard). See README.
//
// Usage (from repo root):
//   RESEND_API_KEY=re_xxx RESEND_TO=you@example.com node newsletter/preview.mjs           # newest issue
//   RESEND_API_KEY=re_xxx RESEND_TO=you@example.com node newsletter/preview.mjs 2026-07    # a specific issue

import { readFileSync, readdirSync } from 'node:fs';

const API_KEY = process.env.RESEND_API_KEY;
const TO = process.env.RESEND_TO;

if (!API_KEY || !TO) {
  console.error(
    'Set RESEND_API_KEY and RESEND_TO env vars. Example:\n' +
      '  RESEND_API_KEY=re_xxx RESEND_TO=you@example.com node newsletter/preview.mjs',
  );
  process.exit(1);
}

const issuesDir = new URL('./issues/', import.meta.url);

// Pick the issue: an explicit arg, otherwise the newest by filename.
let name = process.argv[2];
if (!name) {
  const files = readdirSync(issuesDir).filter((f) => f.endsWith('.html')).sort();
  if (files.length === 0) {
    console.error('No issues found in newsletter/issues/');
    process.exit(1);
  }
  name = files[files.length - 1];
}
if (!name.endsWith('.html')) name += '.html';

const html = readFileSync(new URL(name, issuesDir), 'utf8');

const res = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: { Authorization: `Bearer ${API_KEY}`, 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'Saturdays in a Book <onboarding@resend.dev>',
    to: [TO],
    subject: `Preview — ${name} · ${new Date().toISOString().slice(11, 19)}`,
    html,
  }),
});

const body = await res.json().catch(() => ({}));
if (res.ok) {
  console.log(`✓ Previewed ${name} to ${TO}. Resend id: ${body.id}. Check your inbox.`);
} else {
  console.error(`✗ Failed (${res.status}):`, body);
  process.exit(1);
}
