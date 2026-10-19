// build-reels-mac.mjs — monthly "What I Read in <Month>" slides in a macOS
// desktop look, for TikTok Photo Mode / Instagram Carousel (+ a silent video
// cut). Same pipeline and palette as build-reels.mjs (satori → resvg → sharp),
// but each slide is a window on a warm desktop: a Finder window of covers for
// the hook, a Quick Look window per book, and a Safari window for the CTA. The
// Dock at the bottom holds the month's covers and lights up the current one, so
// it doubles as a progress bar while swiping.
//
//   node scripts/build-reels-mac.mjs     # → social/<month>-mac/slide-*.png (+ .mp4 if ffmpeg present)
//   npm run reels:mac
//
// Each month: run `npm run shelf` first, then edit MONTH / MONTH_LABEL and the
// BOOKS list below. BOOKS is in reading order. Covers, ratings, authors and
// finish dates come from src/data/shelf.json by `match`; any field can be
// overridden inline.
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();

// ── Config: edit each month ───────────────────────────────────────────────────
const MONTH = '2026-09';
const MONTH_LABEL = 'September';
const YEAR_LABEL = '2026';
const SITE = 'saturdaysinabook.com';
const SECONDS_PER_SLIDE = 2.5;

const BOOKS = [
	{ match: 'Demian', title: 'Demian', blurb: "Light and dark aren't opposites to escape. Learning to hold both is how you become yourself." },
	{ match: 'Whistler', title: 'Whistler', blurb: 'A chance reunion at the Met pulls Daphne back into a childhood she only half understood.' },
	{ match: 'The King Must Die', title: 'The King Must Die', blurb: 'Theseus as he might really have been, shaped by his faith, his conquests and the bull ring of Crete.' },
	{ match: 'By Night in Chile', title: 'By Night in Chile', blurb: 'One 130-page paragraph from a dying priest who chose not to see the wrongs around him.' },
	{ match: 'Alexander', title: 'Alexander: God, King, Man', blurb: 'A well-researched biography that pulls the real Alexander out from under the myth.' },
];

// ── Resolve against shelf.json ────────────────────────────────────────────────
const shelf = JSON.parse(fs.readFileSync(path.join(ROOT, 'src', 'data', 'shelf.json'), 'utf8'));
const monthBooks = shelf.filter((b) => String(b.dateRead || '').startsWith(MONTH));
const cleanTitle = (t) => String(t || '').replace(/\s*\([^)]*\)\s*$/, '').split(':')[0].trim();
const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const shortDate = (iso) => { const [, m, d] = String(iso).split('-').map(Number); return m ? `${SHORT_MONTHS[m - 1]} ${d}` : ''; };

const books = BOOKS.map((r) => {
	const b = monthBooks.find((x) => String(x.title || '').toLowerCase().includes(r.match.toLowerCase()));
	if (!b) { console.warn(`⚠ no ${MONTH} shelf book matches "${r.match}" — skipping`); return null; }
	return {
		title: r.title || cleanTitle(b.title),
		author: (r.author || b.author || '').replace(/\s+/g, ' '),
		rating: r.rating ?? b.rating ?? 0,
		cover: r.cover || b.coverUrl,
		finished: r.finished || shortDate(b.dateRead),
		blurb: r.blurb || '',
	};
}).filter(Boolean);

for (const b of monthBooks) {
	if (!BOOKS.some((r) => String(b.title || '').toLowerCase().includes(r.match.toLowerCase())))
		console.warn(`⚠ "${b.title}" was read in ${MONTH} but is not in BOOKS — it will not appear`);
}

// ── Fonts + palette (same as build-reels.mjs / src/og/card.ts) ────────────────
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
	card: '#efe6d6', line: 'rgba(26,22,20,0.10)', chrome: '#ebe2d2',
};
const W = 1080, H = 1920;
const WIN_X = 60, WIN_W = W - 2 * WIN_X, WIN_TOP = 130;

// ── satori vnode helpers ──────────────────────────────────────────────────────
const h = (type, style, children) => ({ type, props: children === undefined ? { style } : { style, children } });
const img = (src, w, ht, style = {}) => ({ type: 'img', props: { src, width: w, height: ht, style: { width: w, height: ht, ...style } } });
const text = (t, style) => h('div', { display: 'flex', ...style }, t);
const none = () => h('div', { display: 'none' }, '');

function starsDataUri(rating) {
	const n = Math.max(0, Math.min(5, Math.round(rating)));
	const star = (cx, filled) =>
		`<path transform="translate(${cx},0)" d="M16 2.5l4.05 8.2 9.05 1.32-6.55 6.38 1.55 9.02L16 23.13 7.9 27.42l1.55-9.02L2.9 12.02l9.05-1.32z" fill="${filled ? C.accent2 : 'none'}" stroke="${C.accent2}" stroke-width="1.7" stroke-linejoin="round"/>`;
	let body = '';
	for (let i = 0; i < 5; i++) body += star(i * 40, i < n);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${5 * 40}" height="32" viewBox="0 0 ${5 * 40} 32">${body}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// Shares build-reels.mjs's cover cache.
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

const cover = (uri, w, ht, style = {}) => uri
	? img(uri, w, ht, { objectFit: 'cover', borderRadius: 4, boxShadow: '0 24px 44px -18px rgba(0,0,0,0.55)', ...style })
	: h('div', { display: 'flex', width: w, height: ht, background: '#2d4a3e', borderRadius: 4, ...style }, '');

// ── Desktop pieces ────────────────────────────────────────────────────────────
// Warm "Sonoma"-ish wallpaper built from the site palette.
const wallpaper = () => h('div', {
	position: 'absolute', top: 0, left: 0, width: W, height: H, display: 'flex',
	backgroundImage: 'radial-gradient(circle at 15% 20%, #e7c9a1 0%, rgba(231,201,161,0) 45%), radial-gradient(circle at 90% 55%, #c98e62 0%, rgba(201,142,98,0) 50%), radial-gradient(circle at 30% 95%, #8b5a2b 0%, rgba(139,90,43,0) 55%), linear-gradient(180deg, #f3ece0 0%, #e2cfb2 100%)',
}, '');

const menuBar = (app) => h('div', {
	position: 'absolute', top: 0, left: 0, width: W, height: 56, display: 'flex', alignItems: 'center',
	justifyContent: 'space-between', padding: '0 34px', background: 'rgba(248,242,230,0.72)',
	fontFamily: 'Geist', fontSize: 24, color: C.ink, borderBottom: `1px solid ${C.line}`,
}, [
	h('div', { display: 'flex', alignItems: 'center', gap: 30 }, [
		text('§', { fontFamily: 'Newsreader', fontSize: 32, color: C.accent, marginTop: -4 }),
		text(app, { fontWeight: 600 }),
		text('File', {}), text('Edit', {}), text('View', {}),
	]),
	text(`${MONTH_LABEL.slice(0, 3)} ${YEAR_LABEL}`, { fontWeight: 500 }),
]);

const lights = () => h('div', { display: 'flex', gap: 14 },
	['#ff5f57', '#febc2e', '#28c840'].map((c) => h('div', { display: 'flex', width: 22, height: 22, borderRadius: 11, background: c, border: '1px solid rgba(0,0,0,0.12)' }, '')));

// A window: title bar with traffic lights + centred title, then content.
const windowFrame = (title, children, { top = WIN_TOP, height, bar } = {}) => h('div', {
	position: 'absolute', top, left: WIN_X, width: WIN_W, height, display: 'flex', flexDirection: 'column',
	background: C.paper, borderRadius: 26, overflow: 'hidden',
	boxShadow: '0 50px 90px -30px rgba(40,24,10,0.55)', border: '1px solid rgba(26,22,20,0.14)',
}, [
	h('div', { display: 'flex', alignItems: 'center', height: 72, padding: '0 26px', background: C.chrome, borderBottom: `1px solid ${C.line}`, position: 'relative' }, [
		lights(),
		h('div', { position: 'absolute', left: 0, top: 0, width: WIN_W, height: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' },
			bar || text(title, { fontFamily: 'Geist', fontSize: 24, fontWeight: 600, color: C.ink2 })),
	]),
	...children,
]);

// The Dock: the month's covers, current one lifted with a dot under it.
const DOCK_TOP = 1590;
function dock(activeIndex = -1) {
	const items = books.map((b, i) => {
		const on = i === activeIndex;
		return h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10, marginTop: on ? -22 : 0 }, [
			cover(b.coverUri, on ? 92 : 76, on ? 138 : 114, { borderRadius: 6, boxShadow: '0 10px 18px -8px rgba(0,0,0,0.5)' }),
			h('div', { display: 'flex', width: 9, height: 9, borderRadius: 5, background: on ? C.ink : 'rgba(0,0,0,0)' }, ''),
		]);
	});
	return h('div', { position: 'absolute', top: DOCK_TOP, left: 0, width: W, display: 'flex', justifyContent: 'center' }, [
		h('div', {
			display: 'flex', alignItems: 'flex-end', gap: 22, padding: '18px 30px 10px',
			background: 'rgba(248,242,230,0.55)', borderRadius: 34, border: '1px solid rgba(255,255,255,0.55)',
			boxShadow: '0 20px 40px -20px rgba(40,24,10,0.5)',
		}, items),
	]);
}

const desktop = (app, children, activeIndex) =>
	h('div', { display: 'flex', width: W, height: H, position: 'relative', background: C.bg }, [wallpaper(), menuBar(app), ...children, dock(activeIndex)]);

// ── Slides ────────────────────────────────────────────────────────────────────
// Hook: Finder window of the month's covers.
function hookSlide() {
	const tile = (b) => h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', width: 270 }, [
		cover(b.coverUri, 228, 342),
		text(b.title.split(':')[0], { fontFamily: 'Geist', fontSize: 21, fontWeight: 500, color: C.ink2, marginTop: 18, maxWidth: 240, textAlign: 'center', justifyContent: 'center' }),
	]);
	return desktop('Finder', [
		windowFrame(`${MONTH_LABEL} ${YEAR_LABEL}`, [
			h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '64px 50px 0' }, [
				text(`§ Saturdays in a Book`, { fontFamily: 'Geist', fontSize: 24, fontWeight: 600, letterSpacing: '0.2em', textTransform: 'uppercase', color: C.accent }),
				text(`What I Read in ${MONTH_LABEL}`, { fontFamily: 'Newsreader', fontSize: 92, lineHeight: 1.0, letterSpacing: '-0.03em', color: C.ink, marginTop: 22, textAlign: 'center', justifyContent: 'center', maxWidth: 820 }),
				h('div', { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', rowGap: 40, columnGap: 10, width: 840, marginTop: 56 }, books.map(tile)),
			]),
			h('div', { display: 'flex', flexGrow: 1 }, ''),
			h('div', { display: 'flex', justifyContent: 'space-between', padding: '20px 34px', borderTop: `1px solid ${C.line}`, fontFamily: 'Geist', fontSize: 22, color: C.muted }, [
				text(`${books.length} items`, {}),
				text('Swipe →', { fontWeight: 600, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.accent }),
			]),
		], { height: 1410 }),
	], -1);
}

// One book: Quick Look window.
function bookSlide(b, i) {
	return desktop('Preview', [
		windowFrame(`${b.title.split(':')[0]} — ${b.author}`, [
			h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 44px 0' }, [
				h('div', { display: 'flex', justifyContent: 'center', alignItems: 'center', width: 872, height: 820, background: C.card, borderRadius: 30 }, [
					cover(b.coverUri, 460, 690),
				]),
				text(b.title, { fontFamily: 'Newsreader', fontSize: 60, lineHeight: 1.05, letterSpacing: '-0.02em', color: C.ink, marginTop: 40, textAlign: 'center', justifyContent: 'center', maxWidth: 860 }),
				text(b.author, { fontFamily: 'Geist', fontSize: 23, fontWeight: 500, letterSpacing: '0.14em', textTransform: 'uppercase', color: C.muted, marginTop: 14 }),
				b.blurb ? text(b.blurb, { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 34, lineHeight: 1.34, color: C.ink2, marginTop: 26, textAlign: 'center', justifyContent: 'center', maxWidth: 800 }) : none(),
			]),
			h('div', { display: 'flex', flexGrow: 1 }, ''),
			h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '20px 34px', borderTop: `1px solid ${C.line}`, fontFamily: 'Geist', fontSize: 22, color: C.muted }, [
				text(`Finished ${b.finished}`, {}),
				img(starsDataUri(b.rating), 200, 32),
				text(`${i + 1} of ${books.length}`, {}),
			]),
		], { height: 1410 }),
	], i);
}

// CTA: Safari window pointing at the shelf.
function outroSlide() {
	const bar = h('div', { display: 'flex', alignItems: 'center', justifyContent: 'center', width: 560, height: 46, borderRadius: 12, background: C.paper, border: `1px solid ${C.line}`, fontFamily: 'Geist', fontSize: 22, color: C.ink2 }, [
		text(SITE, {}),
	]);
	return desktop('Safari', [
		windowFrame('', [
			h('div', { display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '110px 60px 0' }, [
				text('§', { fontFamily: 'Newsreader', fontSize: 110, color: C.accent, lineHeight: 1 }),
				text('Full reviews of all five', { fontFamily: 'Newsreader', fontSize: 80, lineHeight: 1.02, letterSpacing: '-0.03em', color: C.ink, marginTop: 30, textAlign: 'center', justifyContent: 'center', maxWidth: 820 }),
				text('and every book I’ve read, on the shelf at', { fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 36, color: C.ink2, marginTop: 26 }),
				text(SITE, { fontFamily: 'Geist', fontSize: 36, fontWeight: 600, letterSpacing: '0.04em', color: C.accent, marginTop: 18 }),
				h('div', { display: 'flex', gap: 18, marginTop: 80 }, books.map((b, i) => cover(b.coverUri, 140, 210, { transform: `rotate(${[-6, -3, 0, 3, 6][i % 5]}deg)` }))),
				text(`What should I read in ${nextMonth()}?`, { fontFamily: 'Geist', fontSize: 26, fontWeight: 600, letterSpacing: '0.12em', textTransform: 'uppercase', color: C.muted, marginTop: 90 }),
			]),
		], { height: 1410, bar }),
	], -1);
}

function nextMonth() {
	const names = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
	return names[(Number(MONTH.split('-')[1]) % 12)];
}

async function render(node, out) {
	const svg = await satori(node, { width: W, height: H, fonts });
	const rawPng = new Resvg(svg, { fitTo: { mode: 'width', value: W } }).render().asPng();
	const png = await sharp(rawPng).png({ compressionLevel: 9 }).toBuffer();
	fs.writeFileSync(out, png);
	console.log(`✓ ${path.relative(ROOT, out)} (${(png.length / 1024).toFixed(0)} KB)`);
}

async function main() {
	if (!books.length) { console.error('No books to render — check MONTH / BOOKS.'); process.exit(1); }

	const outDir = path.join(ROOT, 'social', `${MONTH}-mac`);
	fs.mkdirSync(outDir, { recursive: true });

	for (const b of books) b.coverUri = await coverDataUri(b.cover);

	const slides = [hookSlide(), ...books.map(bookSlide), outroSlide()];
	let n = 1;
	for (const node of slides) {
		await render(node, path.join(outDir, `slide-${String(n).padStart(2, '0')}.png`));
		n++;
	}

	const mp4 = path.join(outDir, `${MONTH}.mp4`);
	const args = [
		'-y', '-framerate', `1/${SECONDS_PER_SLIDE}`, '-pattern_type', 'glob',
		'-i', path.join(outDir, 'slide-*.png'),
		'-vf', 'scale=1080:1920,format=yuv420p', '-r', '30', mp4,
	];
	try {
		execFileSync('ffmpeg', args, { stdio: 'ignore' });
		console.log(`✓ ${path.relative(ROOT, mp4)}  (silent — add trending audio in-app)`);
	} catch {
		console.log('\nℹ ffmpeg not run (missing or errored) — slides are still ready.');
	}

	console.log(`\n${slides.length} slides → ${path.relative(ROOT, outDir)}/`);
}

main().catch((e) => { console.error(e); process.exit(1); });
