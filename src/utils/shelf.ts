// shelf.ts — joins the Goodreads "read" shelf (src/data/shelf.json, generated
// by `npm run shelf`) with the site's live markdown reviews to produce the
// unified card list for /book-reviews.
//
// A book is "reviewed" (clickable) when its goodreadsId matches a review with
// status: 'live'. Everything else read is "coming soon" (dimmed, non-clickable).
// Publishing a draft review auto-flips its card — no other change needed.

import type { CollectionEntry } from 'astro:content';
import { getBlogUrl, filterDisplayTags } from './blog';
import shelfData from '../data/shelf.json';

export interface ShelfBook {
	goodreadsId: string;
	title: string;
	author: string;
	isbn13: string | null;
	rating: number | null;
	dateRead: string; // ISO YYYY-MM-DD (most-recent read)
	readCount: number;
	readYears: number[]; // every year the book was read (from Goodreads year shelves)
	pages: number; // Number of Pages (0 if unknown)
	coverUrl: string | null;
	category: string; // 'fiction' | 'nonfiction' | ''
	subgenres: string[]; // e.g. ['fantasy', 'mythology']
	gender: string; // author gender: 'male' | 'female' | ''
	classic: boolean;
}

export interface ShelfCard {
	key: string;
	title: string;
	author: string;
	rating: number | null;
	dateRead: string; // ISO YYYY-MM-DD (drives interleave + default sort)
	year: number;
	readCount: number;
	cover: string | null; // resolved URL, or null → render procedural cover
	reviewed: boolean;
	url?: string; // present only when reviewed
	blurb?: string; // review description, reviewed only
	genre: string; // '' for coming-soon (not in Goodreads export)
	tags: string[]; // [] for coming-soon
	category: 'fiction' | 'nonfiction' | ''; // from xlsx Genre A
	subgenres: string[]; // from xlsx Genre B + C, e.g. ['fantasy', 'mythology']
	classic: boolean; // from xlsx Classics? column
}

type Review = CollectionEntry<'blog'>;

const shelf = shelfData as ShelfBook[];

function yearOf(iso: string): number {
	const y = parseInt((iso || '').slice(0, 4), 10);
	return Number.isFinite(y) ? y : 0;
}

/**
 * Build the unified, newest-read-first card list plus summary counts.
 * @param reviews live review entries (postType 'review', status 'live')
 */
export function buildShelf(reviews: Review[]) {
	// Author slugs across all reviews — lets filterDisplayTags drop author tags.
	const authorSlugs = new Set(
		reviews.map((r) => (r.data.author || '').toLowerCase().replace(/\s+/g, '-')).filter(Boolean)
	);

	// Index live reviews by goodreadsId.
	const reviewByGid = new Map<string, Review>();
	for (const r of reviews) {
		const gid = r.data.goodreadsId ? String(r.data.goodreadsId) : '';
		if (gid) reviewByGid.set(gid, r);
	}

	const cards: ShelfCard[] = [];

	// 1) Every read book from the shelf.
	for (const b of shelf) {
		const review = reviewByGid.get(b.goodreadsId);
		const reviewed = !!review;
		// Manual covers (xlsx `Cover` column) are already baked into b.coverUrl by
		// the shelf build; a live review's heroImage still takes precedence.
		const cover =
			(reviewed && review!.data.heroImage) ||
			b.coverUrl ||
			null;

		cards.push({
			key: b.goodreadsId,
			title: reviewed ? review!.data.bookTitle || review!.data.title : b.title,
			author: reviewed ? review!.data.author || b.author : b.author,
			rating: reviewed ? (review!.data.rating ?? b.rating) : b.rating,
			dateRead: b.dateRead,
			year: yearOf(b.dateRead),
			readCount: Math.max(b.readCount || 1, b.readYears?.length || 0),
			cover,
			reviewed,
			url: reviewed ? getBlogUrl(review!.id) : undefined,
			blurb: reviewed ? review!.data.description : undefined,
			genre: reviewed ? review!.data.genre || '' : '',
			tags: reviewed ? filterDisplayTags(review!.data.tags || [], authorSlugs) : [],
			category: (b.category === 'fiction' || b.category === 'nonfiction') ? b.category : '',
			subgenres: b.subgenres || [],
			classic: !!b.classic,
		});
	}

	// 2) Live reviews of books not on the Goodreads "read" shelf (rare — e.g. an
	//    edition shelved differently). Keep them visible so no review is lost.
	const shelfGids = new Set(shelf.map((b) => b.goodreadsId));
	for (const r of reviews) {
		const gid = r.data.goodreadsId ? String(r.data.goodreadsId) : '';
		if (gid && shelfGids.has(gid)) continue;
		const iso = r.data.pubDate.toISOString().slice(0, 10);
		cards.push({
			key: gid || r.id,
			title: r.data.bookTitle || r.data.title,
			author: r.data.author || '',
			rating: r.data.rating ?? null,
			dateRead: iso,
			year: yearOf(iso),
			readCount: 1,
			cover: r.data.heroImage || null,
			reviewed: true,
			url: getBlogUrl(r.id),
			blurb: r.data.description,
			genre: r.data.genre || '',
			tags: filterDisplayTags(r.data.tags || [], authorSlugs),
			category: '',
			subgenres: [],
			classic: false,
		});
	}

	// Newest read first (the page can re-sort client-side).
	cards.sort((a, b) => b.dateRead.localeCompare(a.dateRead));

	const reviewedCount = cards.filter((c) => c.reviewed).length;
	return { cards, total: cards.length, reviewedCount };
}
