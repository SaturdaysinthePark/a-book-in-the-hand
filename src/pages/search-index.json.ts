// Static search index served at /search-index.json. The header search overlay
// fetches this once (lazily, on first open) and runs Fuse.js against it client-side.
import type { APIRoute } from 'astro';
import { getCollection } from 'astro:content';
import { buildSearchIndex } from '../utils/search';

export const GET: APIRoute = async () => {
	const live = await getCollection('blog', ({ data }) => data.status === 'live');
	const index = buildSearchIndex(
		live.filter((p) => p.data.postType === 'review'),
		live.filter((p) => p.data.postType === 'list')
	);
	return new Response(JSON.stringify(index), {
		headers: { 'Content-Type': 'application/json' },
	});
};
