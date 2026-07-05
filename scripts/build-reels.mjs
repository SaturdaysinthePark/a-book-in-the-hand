// build-reels.mjs — monthly "Books I Read in <Month>" swipeable slides for
// TikTok Photo Mode / Instagram Carousel (+ an optional silent video cut for the
// Reels / TikTok video feed). Renders 1080×1920 cards that match the site's OG
// design (src/og/card.ts): cream paper, warm ink, rust stars, Newsreader + Geist,
// the § mark. Pipeline: satori (HTML-ish → SVG) → @resvg/resvg-js (→ PNG) → sharp.
//
//   node scripts/build-reels.mjs        # → social/<month>/slide-*.png (+ .mp4 if ffmpeg present)
//   npm run reels
//
// Each month: run `npm run shelf` first (so shelf.json is current), then edit
// MONTH / MONTH_LABEL and the RANK list below. RANK is ordered worst → best; the
// last entry is the payoff. Covers, ratings and authors are pulled from
// src/data/shelf.json by matching each entry's `match` substring, but any field
// can be overridden inline.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

// ── Config: edit each month ───────────────────────────────────────────────────
const MONTH = '2026-06';        // shelf.json dateRead prefix to select
const MONTH_LABEL = 'June';     // shown in titles + eyebrows
const YEAR_LABEL = '2026';
const SITE = 'saturdaysinabook.com';
const SECONDS_PER_SLIDE = 2.5;  // video-cut timing

// Ranked worst → best. `match` finds the book in shelf.json (case-insensitive
// substring of the title). `title` is the clean display title; `series`,
// `rating` and `cover` are optional overrides. Verdicts are hand-written.
const RANK = [
	{
		match: 'London Falling', title: 'London Falling',
		verdict: 'Keefe on a gilded family and the secret it buried. Reads fast, lingers less.',
	},
	{
		match: 'The Dry Heart', title: 'The Dry Heart',
		verdict: 'Opens with a gunshot and only gets colder. A whole marriage in eighty quiet pages.',
	},
	{
		match: 'The Awakening', title: 'The Awakening',
		verdict: "1899's most quietly radical novel. Still stings.",
	},
	{
		match: 'Sword of the Lictor', title: 'The Sword of the Lictor', series: 'The Book of the New Sun · 3',
		verdict: 'Gorgeous, maddening, and worth every ounce of puzzle-box patience.',
	},
	{
		match: 'Citadel of the Autarch', title: 'The Citadel of the Autarch', series: 'The Book of the New Sun · 4',
		verdict: 'The New Sun finally closes the loop, and it lands.',
	},
];

// ── Resolve the storyboard against shelf.json ─────────────────────────────────
const shelf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'shelf.json'), 'utf8'));
const monthBooks = shelf.filter((b) => String(b.dateRead || '').startsWith(MONTH));
const cleanTitle = (t) => String(t || '').replace(/\s*\([^)]*\)\s*$/, '').split(':')[0].trim();

const books = RANK.map((r, i) => {
	const b = monthBooks.find((x) => String(x.title || '').toLowerCase().includes(r.match.toLowerCase()));
	if (!b) { console.warn(`⚠ no ${MONTH} shelf book matches "${r.match}" — skipping`); return null; }
	return {
		rank: RANK.length - i,            // worst gets the highest number
		title: r.title || cleanTitle(b.title),
		author: r.author || b.author,
		series: r.series || null,
		rating: r.rating ?? b.rating ?? 0,
		cover: r.cover || b.coverUrl,
		verdict: r.verdict || '',
	};
}).filter(Boolean);

// Guard against silently dropping a book that was read but left out of RANK.
for (const b of monthBooks) {
	if (!RANK.some((r) => String(b.title || '').toLowerCase().includes(r.match.toLowerCase())))
		console.warn(`⚠ "${b.title}" was read in ${MONTH} but is not in RANK — it will not appear`);
}

// ── Fonts + palette (same as src/og/card.ts) ──────────────────────────────────
const fontFile = (f) => fs.readFileSync(path.join(ROOT, 'src', 'og', 'fonts', f));
const fonts = [
	{ name: 'Newsreader', data: fontFile('Newsreader-400.woff'), weight: 400, style: 'normal' },
	{ name: 'Newsreader', data: fontFile('Newsreader-500.woff'), weight: 500, style: 'normal' },
	{ name: 'Newsreader', data: fontFile('Newsreader-400-italic.woff'), weight: 400, style: 'italic' },
	{ name: 'Geist', data: fontFile('Geist-400.woff'), weight: 400, style: 'normal' },
	{ name: 'Geist', data: fontFile('Geist-500.woff'), weight: 500, style: 'normal' },
	{ name: 'Geist', data: fontFile('Geist-600.woff'), weight: 600, style: 'normal' },
];
const C = {
	bg: '#f3ece0', ink: '#1a1614', ink2: '#3a322a', muted: '#7a6e5e',
	accent: '#8b5a2b', accent2: '#a8472a', paper: '#f8f2e6',
};
const W = 1080, H = 1920;

// ── satori vnode helpers (no JSX; same shape as card.ts) ──────────────────────
const h = (type, style, children) => ({ type, props: children === undefined ? { style } : { style, children } });
const img = (src, w, ht, style = {}) => ({ type: 'img', props: { src, width: w, height: ht, style: { width: w, height: ht, ...style } } });

// Star rating as an inline SVG (font-independent), filled rust — from card.ts.
function starsDataUri(rating) {
	const n = Math.max(0, Math.min(5, Math.round(rating)));
	const star = (cx, filled) =>
		`<path transform="translate(${cx},0)" d="M16 2.5l4.05 8.2 9.05 1.32-6.55 6.38 1.55 9.02L16 23.13 7.9 27.42l1.55-9.02L2.9 12.02l9.05-1.32z" fill="${filled ? C.accent2 : 'none'}" stroke="${C.accent2}" stroke-width="1.7" stroke-linejoin="round"/>`;
	let body = '';
	for (let i = 0; i < 5; i++) body += star(i * 40, i < n);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${5 * 40}" height="32" viewBox="0 0 ${5 * 40} 32">${body}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Fetch a cover, normalise to a crisp 2:3 jpeg data-URI (cached; separate from
// the OG cache so we keep the higher resolution these slides need).
async function coverDataUri(url, w = 600, ht = 900) {
	if (!url) return null;
	const cacheDir = path.join(ROOT, '.cache', 'reel-covers');
	fs.mkdirSync(cacheDir, { recursive: true });
	const cachePath = path.join(cacheDir, crypto.createHash('sha1').update(`${w}x${ht}:${url}`).digest('hex') + '.jpg');
	try {
		let buf;
		if (fs.existsSync(cachePath)) {
			buf = fs.readFileSync(cachePath);
		} else {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 15000);
			const res = await fetch(url, { signal: ctrl.signal });
			clearTimeout(t);
			if (!res.ok) return null;
			const raw = Buffer.from(await res.arrayBuffer());
			buf = await sharp(raw).resize(w, ht, { fit: 'cover' }).jpeg({ quality: 85 }).toBuffer();
			fs.writeFileSync(cachePath, buf);
		}
		return `data:image/jpeg;base64,${buf.toString('base64')}`;
	} catch { return null; }
}

// ── Shared shell + pieces ─────────────────────────────────────────────────────
const eyebrow = (text, size = 26) =>
	h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Geist', fontSize: size, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted }, [
		h('span', { color: C.accent, marginRight: 12 }, '§'),
		text,
	]);

const watermark = () =>
	h('div', { position: 'absolute', bottom: -60, right: 10, fontFamily: 'Newsreader', fontSize: 520, fontWeight: 400, color: 'rgba(26,22,20,0.05)', lineHeight: 1 }, '§');

const shell = (children, padding = '150px 90px 0') =>
	h('div', {
		display: 'flex', flexDirection: 'column', alignItems: 'center',
		width: W, height: H, background: C.bg, color: C.ink, padding,
		position: 'relative', borderBottom: `14px solid ${C.ink}`,
	}, [watermark(), ...children]);

const centeredText = (text, style) =>
	h('div', { display: 'flex', textAlign: 'center', justifyContent: 'center', ...style }, text);

// Cover slide — the hook.
function hookSlide(coverUris) {
	return shell([
		eyebrow('Saturdays in a Book', 26),
		h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 30 }, [
			centeredText(`Books I Read in ${MONTH_LABEL}`, { fontFamily: 'Newsreader', fontWeight: 400, fontSize: 96, lineHeight: 1.0, letterSpacing: '-0.03em', maxWidth: 900 }),
			centeredText(`${books.length} books, ranked worst to best`, { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 38, color: C.ink2, marginTop: 24 }),
		]),
		h('div', { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', width: 960, gap: 18, marginTop: 60 },
			coverUris.map((u) => img(u, 176, 264, { objectFit: 'cover', borderRadius: 3, boxShadow: '0 16px 32px -14px rgba(0,0,0,0.5)' }))),
		centeredText('Swipe →', { fontFamily: 'Geist', fontSize: 26, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.accent, marginTop: 56 }),
	]);
}

// One ranked book.
function bookSlide(b) {
	const cover = b.coverUri
		? img(b.coverUri, 520, 780, { objectFit: 'cover', borderRadius: 3, boxShadow: '0 30px 60px -24px rgba(0,0,0,0.5)', marginTop: 44 })
		: h('div', { display: 'flex', width: 520, height: 780, marginTop: 44, background: '#2d4a3e', borderRadius: 3 }, '');
	return shell([
		eyebrow(`${MONTH_LABEL} ${YEAR_LABEL} · No. ${b.rank}`, 26),
		cover,
		centeredText(b.title, { fontFamily: 'Newsreader', fontWeight: 400, fontSize: 60, lineHeight: 1.06, letterSpacing: '-0.02em', maxWidth: 900, marginTop: 44 }),
		b.series ? centeredText(b.series, { fontFamily: 'Geist', fontSize: 20, fontWeight: 600, letterSpacing: '0.16em', textTransform: 'uppercase', color: C.accent, marginTop: 14 }) : h('div', {}, ''),
		centeredText(b.author, { fontFamily: 'Geist', fontSize: 24, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginTop: 14 }),
		img(starsDataUri(b.rating), 260, 42, { marginTop: 26 }),
		b.verdict ? centeredText(b.verdict, { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 34, lineHeight: 1.36, color: C.ink2, maxWidth: 860, marginTop: 30 }) : h('div', {}, ''),
	]);
}

// Payoff — the #1 book + site CTA.
function outroSlide(top) {
	return shell([
		eyebrow(`${MONTH_LABEL} ${YEAR_LABEL} · The Standout`, 26),
		top.coverUri ? img(top.coverUri, 460, 690, { objectFit: 'cover', borderRadius: 3, boxShadow: '0 30px 60px -24px rgba(0,0,0,0.5)', marginTop: 50 }) : h('div', {}, ''),
		centeredText(top.title, { fontFamily: 'Newsreader', fontWeight: 400, fontSize: 58, lineHeight: 1.05, maxWidth: 900, marginTop: 40 }),
		centeredText(top.author, { fontFamily: 'Geist', fontSize: 24, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginTop: 14 }),
		img(starsDataUri(top.rating), 260, 42, { marginTop: 24 }),
		h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', marginTop: 46 }, [
			centeredText('Full reviews and every book I read at', { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 32, color: C.ink2 }),
			centeredText(SITE, { fontFamily: 'Geist', fontSize: 30, fontWeight: 600, letterSpacing: '0.06em', color: C.accent, marginTop: 14 }),
		]),
	]);
}

async function render(node, out) {
	const svg = await satori(node, { width: W, height: H, fonts });
	const rawPng = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
	const png = await sharp(rawPng).png({ compressionLevel: 9 }).toBuffer();
	fs.writeFileSync(out, png);
	console.log(`✓ ${path.relative(ROOT, out)} (${(png.length / 1024).toFixed(0)} KB)`);
}

async function main() {
	if (!books.length) { console.error('No books to render — check MONTH / RANK.'); process.exit(1); }

	const outDir = path.join(ROOT, 'social', MONTH);
	fs.mkdirSync(outDir, { recursive: true });

	for (const b of books) b.coverUri = await coverDataUri(b.cover);
	const gridUris = books.map((b) => b.coverUri).filter(Boolean);

	const slides = [hookSlide(gridUris)];
	for (const b of books) slides.push(bookSlide(b));      // worst → best
	slides.push(outroSlide(books[books.length - 1]));      // the #1 book

	let n = 1;
	for (const node of slides) {
		await render(node, path.join(outDir, `slide-${String(n).padStart(2, '0')}.png`));
		n++;
	}

	// Optional silent video cut (needs ffmpeg on PATH). Add trending audio in-app.
	const mp4 = path.join(outDir, `${MONTH}.mp4`);
	const args = [
		'-y', '-framerate', `1/${SECONDS_PER_SLIDE}`, '-pattern_type', 'glob',
		'-i', path.join(outDir, 'slide-*.png'),
		'-vf', 'scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2:color=0xf3ece0,format=yuv420p',
		'-r', '30', mp4,
	];
	try {
		execFileSync('ffmpeg', args, { stdio: 'ignore' });
		console.log(`✓ ${path.relative(ROOT, mp4)}  (silent — add trending audio in-app)`);
	} catch {
		const quoted = args.map((a) => /[ '()*]/.test(a) ? `'${a}'` : a).join(' ');
		console.log(`\nℹ ffmpeg not run (missing or errored). Build the video cut with:\n  ffmpeg ${quoted}`);
	}

	console.log(`\n${slides.length} slides → ${path.relative(ROOT, outDir)}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
