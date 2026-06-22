// Static endpoint: one branded Open Graph PNG per page.
//   /og/default.png (homepage, /book-reviews, /my-lists, /about) · /og/stats.png
//   · /og/reviews/<id>.png · /og/lists/<id>.png
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { renderCard, type CardOpts, type Spine } from '../../og/card';
import { getCoverColor } from '../../utils/blog';
import { computeStats } from '../../utils/stats';
import shelfData from '../../data/shelf.json';

const compact = (n: number) => new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 }).format(n);
const spineOf = (title: string, label = false): Spine => {
	const c = getCoverColor(title);
	return { bg: c.bg, ink: c.ink, ...(label ? { label: title } : {}) };
};
const clip = (s: string | undefined, n: number): string | undefined => {
	if (!s) return undefined;
	if (s.length <= n) return s;
	const cut = s.slice(0, n);
	const sp = cut.lastIndexOf(' ');
	return (sp > 40 ? cut.slice(0, sp) : cut).replace(/[\s.,;:]+$/, '') + '…';
};

export async function getStaticPaths() {
	const live = (await getCollection('blog', ({ data }) => data.status === 'live'))
		.sort((a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf());
	const reviews = live.filter((p) => p.data.postType === 'review');
	const lists = live.filter((p) => p.data.postType === 'list');
	const stats = computeStats();

	const spines = reviews.slice(0, 7).map((p) => spineOf(p.data.bookTitle || p.data.title));

	// Real cover art of the last 4 books read (shelf.json is the source of truth for "read").
	const recentCovers = [...(shelfData as { dateRead: string; coverUrl: string | null }[])]
		.filter((b) => b.coverUrl)
		.sort((a, b) => (b.dateRead || '').localeCompare(a.dateRead || ''))
		.slice(0, 4)
		.map((b) => b.coverUrl as string);

	const paths: { params: { path: string }; props: CardOpts }[] = [];

	// One shared card for the homepage, /book-reviews and /my-lists (set via ogImage).
	paths.push({ params: { path: 'default' }, props: {
		kind: 'default', eyebrow: 'Saturdays in a Book',
		title: 'A reading log with book reviews and recommendations.',
		subtitle: 'Open to see my latest review and more!',
		covers: recentCovers, spines,
	} });

	paths.push({ params: { path: 'stats' }, props: {
		kind: 'section', eyebrow: 'Statistics', title: 'Reading, by the numbers.',
		subtitle: `${stats.uniqueBooks} unique books · ${compact(stats.pagesRead)} pages read`, spines,
	} });

	for (const p of reviews) {
		paths.push({ params: { path: `reviews/${p.id}` }, props: {
			kind: 'review',
			title: p.data.bookTitle || p.data.title,
			subtitle: p.data.author || undefined,
			rating: p.data.rating ?? null,
			blurb: clip(p.data.description, 155),
			cover: p.data.heroImage ?? null,
		} });
	}
	for (const p of lists) {
		const picks = (p.data.picks ?? []).slice(0, 7).map((pk) => spineOf(pk.bookTitle, true));
		paths.push({ params: { path: `lists/${p.id}` }, props: {
			kind: 'section', eyebrow: 'A Curated List', title: p.data.title,
			subtitle: p.data.description || `${(p.data.picks ?? []).length} books`,
			spines: picks.length ? picks : spines,
		} });
	}

	return paths;
}

export const GET: APIRoute = async ({ props }) => {
	const png = await renderCard(props as CardOpts);
	return new Response(new Uint8Array(png), {
		headers: { 'Content-Type': 'image/png', 'Cache-Control': 'public, max-age=31536000, immutable' },
	});
};
