import type { APIRoute } from 'astro';
import { getNewslettersChrono, readNewsletterRawByNum } from '../../utils/newsletters';

// Serves each archived newsletter at /newsletter/NN.html as the raw email HTML, byte-for-byte
// (a static endpoint, like rss.xml.js — no site layout wraps it). The .html.ts name keeps a
// real .html file on disk so Netlify serves it as text/html rather than a download.

export function getStaticPaths() {
	return getNewslettersChrono().map((n) => ({ params: { issue: n.num } }));
}

// A minimal "back to the list" affordance dropped onto the email's cream band.
const BACK_LINK =
	'<div style="text-align:center;padding:16px 16px 0;font-family:-apple-system,\'Helvetica Neue\',Arial,sans-serif;">' +
	'<a href="/newsletter" style="font-size:11px;letter-spacing:0.14em;text-transform:uppercase;color:#7a6e5e;text-decoration:none;">← All issues</a>' +
	'</div>';

export const GET: APIRoute = ({ params }) => {
	let html = readNewsletterRawByNum(params.issue!);
	// Strip Plunk merge tags so {{email}} etc. never leak on the web version.
	html = html.replace(/\{\{[^}]+\}\}/g, '');
	// Keep archived issues out of search.
	html = html.replace('</head>', '<meta name="robots" content="noindex">\n</head>');
	// Add the back-link just inside <body>.
	html = html.replace(/(<body[^>]*>)/i, `$1\n${BACK_LINK}`);
	return new Response(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
};
