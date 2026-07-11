// list-subscribers.mjs — show who's on the newsletter (Plunk contacts). Run:
//   PLUNK_SECRET_KEY=sk_… node scripts/list-subscribers.mjs
//
// Reads the Plunk secret key from the environment (never commit it). Hits Plunk's
// read API and prints a table, flagging obvious test/owner rows so the real
// subscriber count is clear. Signups land in Plunk via netlify/functions/subscribe.mjs.

const KEY = process.env.PLUNK_SECRET_KEY;
if (!KEY) {
  console.error('Set PLUNK_SECRET_KEY (sk_…) in the environment first, e.g.:');
  console.error('  PLUNK_SECRET_KEY=sk_xxx node scripts/list-subscribers.mjs');
  process.exit(1);
}

const OWNER = 'sabtain.a.khan@gmail.com';
const isTest = (email) =>
  /@example\.(com|org|net)$/i.test(email) ||
  /^(localtest|buildtest|handlertest|test)/i.test(email) ||
  email === OWNER;

const res = await fetch('https://next-api.useplunk.com/contacts', {
  headers: { Authorization: `Bearer ${KEY}` },
});
if (!res.ok) {
  console.error(`Plunk API error: ${res.status} ${res.statusText}`);
  process.exit(1);
}

const contacts = (await res.json()).data ?? [];

const row = (c) => {
  const flag = c.email === OWNER ? 'you' : isTest(c.email) ? 'test' : 'REAL';
  const sub = c.subscribed ? 'subscribed' : 'unsub';
  const when = (c.createdAt || '').slice(0, 10);
  return `  [${flag.padEnd(4)}] ${sub.padEnd(10)} ${when}  ${c.email}  (${c.data?.source ?? '—'})`;
};

const real = contacts.filter((c) => c.subscribed && !isTest(c.email));

console.log(`\nPlunk contacts: ${contacts.length} total\n`);
for (const c of [...contacts].sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''))) {
  console.log(row(c));
}
console.log(`\nReal subscribers (subscribed, excluding tests + owner): ${real.length}`);
for (const c of real) console.log(`  • ${c.email}`);
console.log('');
