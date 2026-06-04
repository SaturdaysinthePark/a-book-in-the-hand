// search.ts — assembles a single fuzzy-search index spanning every searchable
// thing on the site: reviews, lists, the full bookshelf (incl. "coming soon"
// books), authors, and genres. Served as static JSON via
// src/pages/search-index.json.ts and consumed by the header search overlay.
//
// Reviews + books reuse buildShelf() so the reviewed/url/cover/genre data stays
// in lockstep with /book-reviews. Authors and genres are derived aggregates that
// link to a pre-filtered shelf (?author= / ?subgenre= / ?category=).

import type { CollectionEntry } from 'astro:content';
import { buildShelf } from './shelf';
import { getBlogUrl, filterDisplayTags } from './blog';

type Post = CollectionEntry<'blog'>;

export interface SearchEntry {
	type: 'review' | 'book' | 'list' | 'author' | 'genre';
	title: string; // display title
	subtitle?: string; // author name, "N books", "Genre", etc.
	url?: string; // undefined → non-clickable (coming-soon books)
	cover?: string | null;
	rating?: number | null;
	// Lowercased fields Fuse searches over (kept separate from display fields).
	_title: string;
	_author: string;
	_keywords: string;
}

export interface SearchIndex {
	entries: SearchEntry[];
	suggestions: {
		genres: { label: string; url: string }[];
		reviews: SearchEntry[];
	};
}

const lc = (s: string | null | undefined) => (s || '').toLowerCase();
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/**
 * Build the unified search index + browse suggestions.
 * @param reviews live review posts (postType 'review', status 'live')
 * @param lists   live list posts (postType 'list', status 'live')
 */
export function buildSearchIndex(reviews: Post[], lists: Post[]): SearchIndex {
	const { cards } = buildShelf(reviews);
	const entries: SearchEntry[] = [];

	// 1) Reviews + coming-soon books (one card per book read).
	for (const c of cards) {
		const keywords = [c.genre, c.category, ...c.subgenres, ...c.tags]
			.filter(Boolean)
			.join(' ');
		entries.push({
			type: c.reviewed ? 'review' : 'book',
			title: c.title,
			subtitle: c.author || undefined,
			url: c.reviewed ? c.url : undefined,
			cover: c.cover,
			rating: c.rating,
			_title: lc(c.title),
			_author: lc(c.author),
			_keywords: lc(keywords),
		});
	}

	// 2) Lists.
	for (const l of lists) {
		const keywords = filterDisplayTags(l.data.tags || []).join(' ');
		entries.push({
			type: 'list',
			title: l.data.title,
			subtitle: 'List',
			url: getBlogUrl(l.id),
			_title: lc(l.data.title),
			_author: '',
			_keywords: lc(`${l.data.description || ''} ${keywords}`),
		});
	}

	// 3) Authors → pre-filtered shelf (exact-case name matches the shelf combo).
	const authorCounts: Record<string, number> = {};
	for (const c of cards) {
		if (c.author) authorCounts[c.author] = (authorCounts[c.author] || 0) + 1;
	}
	for (const [name, count] of Object.entries(authorCounts)) {
		entries.push({
			type: 'author',
			title: name,
			subtitle: `${count} book${count !== 1 ? 's' : ''}`,
			url: `/book-reviews?author=${encodeURIComponent(name)}`,
			_title: lc(name),
			_author: lc(name),
			_keywords: '',
		});
	}

	// 4) Genres: fiction/nonfiction categories + subgenres → pre-filtered shelf.
	const subgenreCounts: Record<string, number> = {};
	let fictionCount = 0;
	let nonfictionCount = 0;
	for (const c of cards) {
		if (c.category === 'fiction') fictionCount++;
		else if (c.category === 'nonfiction') nonfictionCount++;
		for (const s of c.subgenres) subgenreCounts[s] = (subgenreCounts[s] || 0) + 1;
	}
	if (fictionCount) {
		entries.push({
			type: 'genre', title: 'Fiction', subtitle: 'Genre',
			url: '/book-reviews?category=fiction',
			_title: 'fiction', _author: '', _keywords: 'fiction',
		});
	}
	if (nonfictionCount) {
		entries.push({
			type: 'genre', title: 'Nonfiction', subtitle: 'Genre',
			url: '/book-reviews?category=nonfiction',
			_title: 'nonfiction', _author: '', _keywords: 'nonfiction',
		});
	}
	for (const sub of Object.keys(subgenreCounts)) {
		entries.push({
			type: 'genre',
			title: cap(sub),
			subtitle: 'Genre',
			url: `/book-reviews?subgenre=${encodeURIComponent(sub)}`,
			_title: lc(sub),
			_author: '',
			_keywords: lc(sub),
		});
	}

	// Suggestions (empty-state): most-read subgenres + a few top-rated recent reviews.
	const topGenres = Object.entries(subgenreCounts)
		.sort((a, b) => b[1] - a[1])
		.slice(0, 8)
		.map(([sub]) => ({
			label: cap(sub),
			url: `/book-reviews?subgenre=${encodeURIComponent(sub)}`,
		}));

	const topReviews = cards
		.filter((c) => c.reviewed && (c.rating ?? 0) >= 4)
		.slice(0, 4) // cards are already newest-read-first
		.map(
			(c): SearchEntry => ({
				type: 'review',
				title: c.title,
				subtitle: c.author || undefined,
				url: c.url,
				cover: c.cover,
				rating: c.rating,
				_title: lc(c.title),
				_author: lc(c.author),
				_keywords: '',
			})
		);

	return { entries, suggestions: { genres: topGenres, reviews: topReviews } };
}
