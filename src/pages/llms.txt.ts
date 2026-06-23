import type { APIContext } from 'astro';
import { getCollection } from 'astro:content';
import { SITE_TITLE } from '../consts';

// Generated /llms.txt — a curated map of the site for AI crawlers (ChatGPT, Perplexity,
// Google AI Overviews, etc.). Generated from live content so it never goes stale. Follows
// the llms.txt convention: H1 title, a blockquote summary, then sections of links.
export async function GET(context: APIContext) {
	const site = context.site!; // set via `site` in astro.config.mjs
	const abs = (path: string) => new URL(path, site).href;

	const posts = (await getCollection('blog', ({ data }) => data.status === 'live')).sort(
		(a, b) => b.data.pubDate.valueOf() - a.data.pubDate.valueOf(),
	);
	const reviews = posts.filter((p) => p.data.postType === 'review');
	const lists = posts.filter((p) => p.data.postType === 'list');

	const recentReviews = reviews.slice(0, 30).map((p) => {
		const name =
			p.data.bookTitle && p.data.author
				? `${p.data.bookTitle} by ${p.data.author}`
				: p.data.title;
		const desc = (p.data.description ?? '').trim();
		return `- [${name}](${abs(`/blog/${p.id}/`)})${desc ? `: ${desc}` : ''}`;
	});

	const listItems = lists.map((p) => `- [${p.data.title}](${abs(`/blog/${p.id}/`)})`);

	const lines = [
		`# ${SITE_TITLE}`,
		'',
		'> A reading log from Brooklyn — honest book reviews, curated lists, and reading ' +
			'recommendations by Sabtain Khan, spanning literary fiction, science fiction, ' +
			'fantasy, classics, and nonfiction.',
		'',
		'## About',
		`- [About & how I rate books](${abs('/about/')})`,
		'',
		'## Key pages',
		`- [All book reviews](${abs('/book-reviews/')})`,
		`- [Reading lists](${abs('/my-lists/')})`,
		`- [Reading stats](${abs('/stats/')})`,
		'',
		'## Recent reviews',
		...recentReviews,
		'',
		'## Lists',
		...listItems,
		'',
	];

	return new Response(lines.join('\n'), {
		headers: { 'Content-Type': 'text/plain; charset=utf-8' },
	});
}
