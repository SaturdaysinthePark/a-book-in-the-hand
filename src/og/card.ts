// Build-time Open Graph card generator. satori (HTML-ish → SVG with fonts embedded
// as glyph paths) → @resvg/resvg-js (SVG → PNG). One 1200×630 card per page; matches
// the site design (cream paper, ink, accent/rust, Newsreader + Geist, the § motif).
import satori from 'satori';
import { Resvg } from '@resvg/resvg-js';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

// Resolve from the project root so it works both in dev (src) and in the bundled
// build output (where import.meta.url would point into dist/).
const fontFile = (f: string) => fs.readFileSync(path.join(process.cwd(), 'src', 'og', 'fonts', f));

const fonts = [
	{ name: 'Newsreader', data: fontFile('Newsreader-400.woff'), weight: 400 as const, style: 'normal' as const },
	{ name: 'Newsreader', data: fontFile('Newsreader-500.woff'), weight: 500 as const, style: 'normal' as const },
	{ name: 'Newsreader', data: fontFile('Newsreader-400-italic.woff'), weight: 400 as const, style: 'italic' as const },
	{ name: 'Geist', data: fontFile('Geist-400.woff'), weight: 400 as const, style: 'normal' as const },
	{ name: 'Geist', data: fontFile('Geist-500.woff'), weight: 500 as const, style: 'normal' as const },
	{ name: 'Geist', data: fontFile('Geist-600.woff'), weight: 600 as const, style: 'normal' as const },
];

const C = {
	bg: '#f3ece0', ink: '#1a1614', ink2: '#3a322a', muted: '#7a6e5e',
	accent: '#8b5a2b', accent2: '#a8472a', paper: '#f8f2e6', rule: 'rgba(26,22,20,0.12)',
};

export interface Spine { bg: string; ink: string; label?: string }
export interface CardOpts {
	kind: 'default' | 'section' | 'review';
	eyebrow?: string;        // e.g. "THE BOOKSHELF" (rendered as "§ …")
	title: string;
	subtitle?: string;       // tagline / figure line / author
	rating?: number | null;  // review only
	blurb?: string;          // review: short description
	cover?: string | null;   // review: heroImage URL
	covers?: string[];       // default: real cover art of the last few books read
	spines?: Spine[];        // default/section decorative row (fallback)
	watermark?: string;      // big faint glyph, defaults to "§"
}

// ── satori vnode helper (no JSX) ──────────────────────────────────────────
type Node = { type: string; props: Record<string, unknown> };
const h = (type: string, style: Record<string, unknown>, children?: unknown): Node =>
	({ type, props: children === undefined ? { style } : { style, children } });
// satori reads src/width/height as props (not style)
const img = (src: string, w: number, h2: number, style: Record<string, unknown> = {}): Node =>
	({ type: 'img', props: { src, width: w, height: h2, style: { width: w, height: h2, ...style } } });

// ── star rating as an inline SVG (font-independent) ───────────────────────
function starsDataUri(rating: number): string {
	const n = Math.max(0, Math.min(5, Math.round(rating)));
	const star = (cx: number, filled: boolean) =>
		`<path transform="translate(${cx},0)" d="M16 2.5l4.05 8.2 9.05 1.32-6.55 6.38 1.55 9.02L16 23.13 7.9 27.42l1.55-9.02L2.9 12.02l9.05-1.32z" fill="${filled ? C.accent2 : 'none'}" stroke="${C.accent2}" stroke-width="1.7" stroke-linejoin="round"/>`;
	let body = '';
	for (let i = 0; i < 5; i++) body += star(i * 40, i < n);
	const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${5 * 40}" height="32" viewBox="0 0 ${5 * 40} 32">${body}</svg>`;
	return `data:image/svg+xml;base64,${Buffer.from(svg).toString('base64')}`;
}

// ── fetch a book cover, normalise to a 2:3 jpeg data-URI (cached) ──────────
async function coverDataUri(url?: string | null): Promise<string | null> {
	if (!url) return null;
	const cacheDir = path.join(process.cwd(), '.cache', 'og-covers');
	fs.mkdirSync(cacheDir, { recursive: true });
	const key = crypto.createHash('sha1').update(url).digest('hex');
	const cachePath = path.join(cacheDir, key + '.jpg');
	try {
		let buf: Buffer;
		if (fs.existsSync(cachePath)) {
			buf = fs.readFileSync(cachePath);
		} else {
			const ctrl = new AbortController();
			const t = setTimeout(() => ctrl.abort(), 7000);
			const res = await fetch(url, { signal: ctrl.signal });
			clearTimeout(t);
			if (!res.ok) return null;
			const raw = Buffer.from(await res.arrayBuffer());
			buf = await sharp(raw).resize(420, 630, { fit: 'cover' }).jpeg({ quality: 82 }).toBuffer();
			fs.writeFileSync(cachePath, buf);
		}
		return `data:image/jpeg;base64,${buf.toString('base64')}`;
	} catch {
		return null;
	}
}

// ── shared shell ──────────────────────────────────────────────────────────
const eyebrow = (text: string, size = 22) =>
	h('div', { display: 'flex', alignItems: 'center', fontFamily: 'Geist', fontSize: size, fontWeight: 600, letterSpacing: '0.18em', textTransform: 'uppercase', color: C.muted }, [
		h('span', { color: C.accent, marginRight: 10 }, '§'),
		text,
	]);

const watermark = (glyph: string) =>
	h('div', { position: 'absolute', top: -70, right: 36, fontFamily: 'Newsreader', fontSize: 460, fontWeight: 400, color: 'rgba(26,22,20,0.05)', lineHeight: 1 }, glyph);

function spineRow(spines: Spine[]) {
	return h('div', { display: 'flex', gap: 14 },
		spines.slice(0, 7).map((s) =>
			h('div', {
				display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
				width: 84, height: 126, background: s.bg, color: s.ink, borderRadius: 2,
				padding: '10px 9px', boxShadow: '0 10px 24px -10px rgba(0,0,0,0.45)',
				fontFamily: 'Newsreader', fontSize: 9, fontWeight: 600, textTransform: 'uppercase',
				lineHeight: 1.1, overflow: 'hidden',
			}, s.label ? s.label.toUpperCase() : ''),
		),
	);
}

function build(o: CardOpts, coverUri: string | null, coverUris: string[]): Node {
	const shell = (children: unknown[]) =>
		h('div', {
			display: 'flex', flexDirection: 'column', width: 1200, height: 630,
			background: C.bg, color: C.ink, padding: '64px 72px', position: 'relative',
			borderBottom: `10px solid ${C.ink}`, justifyContent: 'space-between',
		}, [watermark(o.watermark || '§'), ...children]);

	if (o.kind === 'review') {
		const cover = coverUri
			? img(coverUri, 300, 450, { objectFit: 'cover', borderRadius: 3, boxShadow: '0 30px 60px -24px rgba(0,0,0,0.55)' })
			: h('div', {
					display: 'flex', flexDirection: 'column', justifyContent: 'space-between',
					width: 300, height: 450, background: '#2d4a3e', color: '#d8cdb8',
					borderRadius: 3, padding: '40px 30px', fontFamily: 'Newsreader', fontWeight: 600,
					textTransform: 'uppercase', fontSize: 30, lineHeight: 1.05,
					boxShadow: '0 30px 60px -24px rgba(0,0,0,0.55)',
				}, [h('div', { fontFamily: 'Geist', fontSize: 14, letterSpacing: '0.16em', opacity: 0.7 }, o.subtitle || ''), h('div', {}, o.title)]);

		return shell([
			h('div', { display: 'flex', alignItems: 'center', gap: 56 }, [
				cover,
				h('div', { display: 'flex', flexDirection: 'column', flex: 1 }, [
					eyebrow('Book Review', 24),
					h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 400, fontSize: 58, lineHeight: 1.03, letterSpacing: '-0.02em', margin: '28px 0 0' }, o.title),
					o.subtitle ? h('div', { display: 'flex', fontFamily: 'Geist', fontSize: 22, fontWeight: 500, letterSpacing: '0.1em', textTransform: 'uppercase', color: C.muted, margin: '20px 0 0' }, o.subtitle) : h('div', {}, ''),
					o.rating ? img(starsDataUri(o.rating), 200, 32, { margin: '26px 0 0' }) : h('div', {}, ''),
					o.blurb ? h('div', { display: 'flex', fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 24, lineHeight: 1.4, color: C.ink2, margin: '30px 0 0', maxWidth: 660 }, o.blurb) : h('div', {}, ''),
				]),
			]),
			h('div', {}, ''),
		]);
	}

	// default with covers: text left, the last few books read fanned out on the right
	if (o.kind === 'default' && coverUris.length) {
		return shell([
			h('div', { display: 'flex', alignItems: 'center', justifyContent: 'space-between', flex: 1, gap: 48 }, [
				h('div', { display: 'flex', flexDirection: 'column', maxWidth: 560 }, [
					eyebrow(o.eyebrow || 'Saturdays in a Book', 26),
					h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 400, fontSize: 62, lineHeight: 1.03, letterSpacing: '-0.025em', margin: '30px 0 0' }, o.title),
					o.subtitle ? h('div', { display: 'flex', fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 28, color: C.ink2, margin: '26px 0 0' }, o.subtitle) : h('div', {}, ''),
				]),
				h('div', { display: 'flex', flexWrap: 'wrap', width: 306, gap: 18 },
					coverUris.map((u) => img(u, 144, 216, {
						objectFit: 'cover', borderRadius: 3,
						boxShadow: '0 18px 36px -16px rgba(0,0,0,0.5)',
					})),
				),
			]),
		]);
	}

	// default + section share the same headline/figure layout
	return shell([
		eyebrow(o.eyebrow || 'Saturdays in a Book'),
		h('div', { display: 'flex', flexDirection: 'column', margin: '8px 0' }, [
			h('div', { display: 'flex', fontFamily: 'Newsreader', fontWeight: 400, fontSize: 92, lineHeight: 0.98, letterSpacing: '-0.035em', maxWidth: 920 }, o.title),
			o.subtitle ? h('div', { display: 'flex', fontFamily: 'Newsreader', fontStyle: 'italic', fontSize: 30, color: C.ink2, margin: '22px 0 0' }, o.subtitle) : h('div', {}, ''),
		]),
		o.spines && o.spines.length ? spineRow(o.spines) : h('div', {}, ''),
	]);
}

export async function renderCard(o: CardOpts): Promise<Buffer> {
	const coverUri = o.cover ? await coverDataUri(o.cover) : null;
	const coverUris = o.covers?.length
		? (await Promise.all(o.covers.map((u) => coverDataUri(u)))).filter((x): x is string => !!x)
		: [];
	const svg = await satori(build(o, coverUri, coverUris) as never, { width: 1200, height: 630, fonts });
	const png = new Resvg(svg, { fitTo: { mode: 'width', value: 1200 } }).render().asPng();
	return png;
}
