# Newsletters

The monthly "Saturdays in a Book" newsletter, sent with [Resend](https://resend.com) Broadcasts.

## Structure
- **`issues/`** — one HTML file per issue (e.g. `2026-07.html`). These are the real, saved
  newsletters, version-controlled with the site.
- **`preview.mjs`** — email an issue to yourself to preview it before sending.

## Preview an issue
From the repo root (uses Resend's transactional API + `onboarding@resend.dev`, which only
delivers to your own Resend account email — fine for a private preview):

```sh
RESEND_API_KEY=re_xxx RESEND_TO=you@example.com node newsletter/preview.mjs           # newest issue
RESEND_API_KEY=re_xxx RESEND_TO=you@example.com node newsletter/preview.mjs 2026-07    # a specific issue
```

## Send an issue for real (Resend Broadcast)
1. Copy the issue HTML to your clipboard: `cat newsletter/issues/2026-07.html | pbcopy`
2. Resend → **Broadcasts** → **Create Broadcast** → choose your Audience.
3. **From:** `Saturdays in a Book <hello@saturdaysinabook.com>` (available once the domain shows **Verified**).
4. Switch the editor to the **HTML / code** view and paste. The `{{{RESEND_UNSUBSCRIBE_URL}}}`
   in the footer is replaced with a real unsubscribe link automatically per recipient.
5. **Send test** to yourself, then **Send**.

## Start a new issue
Copy the latest issue as a starting point and edit the copy:

```sh
cp newsletter/issues/2026-07.html newsletter/issues/2026-08.html
```

## Notes
- Sending identity `hello@saturdaysinabook.com` is authenticated in DNS (DKIM on
  `resend._domainkey`, SPF/return-path on `send.`). Replies forward to Gmail via Porkbun.
- Newsletter sends are **Broadcasts** (Resend free tier: 1,000 contacts, unlimited sends) —
  the 100/day cap is transactional-only and does not apply.
