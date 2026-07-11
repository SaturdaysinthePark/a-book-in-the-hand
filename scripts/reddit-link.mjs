// reddit-link.mjs — build UTM-tagged links for sharing reviews on Reddit (or any
// social). GA4 then attributes the clicks cleanly under Traffic acquisition. Run:
//   node scripts/reddit-link.mjs /blog/2025/12/14/2666/
//   node scripts/reddit-link.mjs https://saturdaysinabook.com/blog/2025/12/14/2666/
//   node scripts/reddit-link.mjs --campaign=best-of-2025 /blog/a/ /blog/b/
//
// Optional flags: --source (default reddit), --medium (default social),
// --campaign (default = the review's slug). Prints one tagged URL per input.

const SITE = 'https://saturdaysinabook.com';

const opts = { source: 'reddit', medium: 'social', campaign: '' };
const inputs = [];
for (const a of process.argv.slice(2)) {
  const m = a.match(/^--(source|medium|campaign)=(.*)$/);
  if (m) opts[m[1]] = m[2];
  else inputs.push(a);
}

if (inputs.length === 0) {
  console.error(
    'Usage: node scripts/reddit-link.mjs [--source=] [--medium=] [--campaign=] <review-url-or-/blog/path> ...',
  );
  process.exit(1);
}

const slugify = (s) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

for (const input of inputs) {
  let url;
  try {
    url = new URL(input, SITE);
  } catch {
    console.error(`skip (not a URL/path): ${input}`);
    continue;
  }
  const segs = url.pathname.split('/').filter(Boolean);
  const campaign = opts.campaign || slugify(segs.at(-1) || 'review');
  url.searchParams.set('utm_source', opts.source);
  url.searchParams.set('utm_medium', opts.medium);
  url.searchParams.set('utm_campaign', campaign);
  console.log(url.toString());
}
