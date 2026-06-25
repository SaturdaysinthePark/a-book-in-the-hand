// Hero generator for the curated-list posts. Fetches each list's cover images
// and composes a 2:3 cream poster (matching the site's OG cards in
// src/og/card.ts — same palette, fonts, § motif) into public/book-covers/.
// Re-run any time a cover URL changes. Network access required (covers are
// hotlinked).
//
//   node scripts/build-collage.mjs
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const ROOT = process.cwd();
const fontFile = (f) => fs.readFileSync(path.join(ROOT, 'src', 'og', 'fonts', f));
const fonts = [
	{ name: 'Newsreader', data: fontFile('Newsreader-400.woff'), weight: 400, style: 'normal' },
	{ name: 'Newsreader', data: fontFile('Newsreader-500.woff'), weight: 500, style: 'normal' },
	{ name: 'Geist', data: fontFile('Geist-600.woff'), weight: 600, style: 'normal' },
];

const C = { bg: '#f3ece0', ink: '#1a1614', muted: '#7a6e5e', accent: '#8b5a2b' };
const CW = 1000, CH = 1500; // 2:3 canvas → no crop in the /blog thumbnail

// One entry per list post. `cols` × `coverW` controls the cover grid; covers
// flex-wrap, so any leftover on the last row is centred. Order = post `picks`.
const CONFIGS = [
	{
		out: 'ten-books-publishing-in-2026.png',
		eyebrow: 'Publishing in 2026',
		title: "Ten Books I'm Looking Forward To",
		titleSize: 66, cols: 5, coverW: 164,
		covers: [
			'https://images-na.ssl-images-amazon.com/images/P/1538752034.01.L.jpg', // American Hagwon
			'https://images-na.ssl-images-amazon.com/images/P/0593321464.01.L.jpg', // Exit Party
			'https://images-na.ssl-images-amazon.com/images/P/0063511630.01.L.jpg', // Whistler
			'https://images-na.ssl-images-amazon.com/images/P/0593701585.01.L.jpg', // Glyph
			'https://images-na.ssl-images-amazon.com/images/P/0385548532.01.L.jpg', // London Falling
			'https://images-na.ssl-images-amazon.com/images/P/059380421X.01.L.jpg', // Yesteryear
			'https://images-na.ssl-images-amazon.com/images/P/132411813X.01.L.jpg', // Son of Nobody
			'https://images-na.ssl-images-amazon.com/images/P/0593128281.01.L.jpg', // The Unicorn Hunters
			'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1760631695i/242836148.jpg', // The Witch of Prague
			'https://images-na.ssl-images-amazon.com/images/P/0593803507.01.L.jpg', // Contrapposto
		],
	},
	{
		out: 'top-books-i-read-in-2025.png',
		eyebrow: 'Best of 2025',
		title: 'Top Books I Read in 2025',
		titleSize: 74, cols: 3, coverW: 200,
		covers: [
			'https://images-na.ssl-images-amazon.com/images/P/1644453150.01.L.jpg', // Taiwan Travelogue
			'https://images-na.ssl-images-amazon.com/images/P/0143135031.01.L.jpg', // Brás Cubas
			'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1327364614i/3115359.jpg', // 2666
			'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1344371173i/13414651.jpg', // Hadji Murat
			'https://m.media-amazon.com/images/S/compressed.photo.goodreads.com/books/1537315266i/40163119.jpg', // Say Nothing
		],
	},
];

// satori vnode helpers (no JSX) — same shape as src/og/card.ts
const h = (type, style, children) => ({ type, props: children === undefined ? { style } : { style, children } });
const img = (src, w, ht, style = {}) => ({ type: 'img', props: { src, width: w, height: ht, style: { width: w, height: ht, ...style } } });

// Fetch a cover, normalise to a 2:3 jpeg data-URI (cached; cache shared with card.ts).
async function coverDataUri(url) {
	const cacheDir = path.join(ROOT, '.cache', 'og-covers');
	fs.mkdirSync(cacheDir, { recursive: true });
	const cachePath = path.join(cacheDir, crypto.createHash('sha1').update(url).digest('hex') + '.jpg');
	let buf;
	if (fs.existsSync(cachePath)) {
		buf = fs.readFileSync(cachePath);
	} else {
		const ctrl = new AbortController();
		const t = setTimeout(() => ctrl.abort(), 15000);
		const res = await fetch(url, { signal: ctrl.signal });
		clearTimeout(t);
		if (!res.ok) throw new Error(`fetch ${url} → ${res.status}`);
		const raw = Buffer.from(await res.arrayBuffer());
		buf = await sharp(raw).resize(420, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
		fs.writeFileSync(cachePath, buf);
	}
	return `data:image/jpeg;base64,${buf.toString('base64')}`;
}

const GAP = 16;

async function renderOne(cfg) {
	const uris = await Promise.all(cfg.covers.map(coverDataUri));
	const coverH = Math.round(cfg.coverW * 1.5);
	const gridW = cfg.cols * cfg.coverW + (cfg.cols - 1) * GAP;

	const tree = h('div', {
		display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
		width: CW, height: CH, background: C.bg, color: C.ink, padding: '56px 56px 0',
		borderBottom: `10px solid ${C.ink}`, position: 'relative',
	}, [
		h('div', {
			display: 'flex', alignItems: 'center', fontFamily: 'Geist', fontSize: 24, fontWeight: 600,
			letterSpacing: '0.2em', textTransform: 'uppercase', color: C.muted, marginBottom: 18,
		}, [h('span', { color: C.accent, marginRight: 12 }, '§'), cfg.eyebrow]),
		h('div', {
			display: 'flex', textAlign: 'center', fontFamily: 'Newsreader', fontWeight: 400, fontSize: cfg.titleSize,
			lineHeight: 1.05, letterSpacing: '-0.025em', maxWidth: 840, marginBottom: 56, justifyContent: 'center',
		}, cfg.title),
		h('div', { display: 'flex', flexWrap: 'wrap', justifyContent: 'center', width: gridW, gap: GAP },
			uris.map((u) => img(u, cfg.coverW, coverH, {
				objectFit: 'cover', borderRadius: 3, boxShadow: '0 16px 32px -14px rgba(0,0,0,0.5)',
			})),
		),
	]);

	const svg = await satori(tree, { width: CW, height: CH, fonts });
	const rawPng = new Resvg(svg, { fitTo: { mode: 'width', value: CW } }).render().asPng();
	const png = await sharp(rawPng).png({ compressionLevel: 9, quality: 80, effort: 8 }).toBuffer();
	const out = path.join(ROOT, 'public', 'book-covers', cfg.out);
	fs.mkdirSync(path.dirname(out), { recursive: true });
	fs.writeFileSync(out, png);
	console.log(`✓ ${path.relative(ROOT, out)} (${CW}×${CH}, ${(png.length / 1024).toFixed(0)} KB)`);
}

async function main() {
	for (const cfg of CONFIGS) await renderOne(cfg);
}

main().catch((e) => { console.error(e); process.exit(1); });
