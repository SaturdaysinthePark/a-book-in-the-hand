// stats.ts — build-time aggregation of the read shelf (src/data/shelf.json) into
// the figures + series rendered on /stats. Pure and deterministic: it reads the
// committed shelf data and returns a single typed object, recomputed on every build.
//
// Re-read policy: shelf.json keeps one row per book, plus `readYears` — every year
// the book was read (from the Goodreads year shelves). Read-sensitive figures
// ("Books read", pages, the yearly time series) count a book once per year in
// `readYears`, so a re-read lands in each year it happened and the headline totals
// reconcile to the sum of the yearly bars. The MONTHLY series is the one exception:
// the export gives no month for prior reads, so it places each book once, at its
// most-recent read month. Distributions (ratings, genres, authors) count unique books.

import shelfData from '../data/shelf.json';
import type { ShelfBook } from './shelf';
import { ISO_ALPHA2 } from './iso-countries';

const shelf = shelfData as ShelfBook[];

export type Bars = { label: string; value: number }[];
export interface Stacked {
	keys: string[]; // segment keys, bottom→top (e.g. ['fiction','nonfiction'])
	rows: { label: string; values: number[] }[]; // values align to keys
}

/** One granularity (month or year) of the reading-over-time data. */
export interface Granular {
	books: Bars; // count of books per period
	pages: Bars; // pages per period
	pagesPerDay: Bars; // pages ÷ calendar days in period
	byCategory: Stacked; // books split fiction / nonfiction
	byGender: Stacked; // books split female / male (author gender)
}

export interface Stats {
	booksRead: number; // Σ readCount (re-reads counted)
	uniqueBooks: number; // distinct shelf rows
	uniqueAuthors: number;
	pagesRead: number; // Σ pages × readCount (re-reads counted)
	reReads: number; // Σ (readCount − 1)
	avgPagesPerDay: number; // pagesRead ÷ days across the whole reading span
	firstYear: number;
	lastYear: number;
	yearsReading: number;
	timeline: { month: Granular; year: Granular };
	ratings: Bars; // '1'..'5' → count
	category: Bars; // Fiction / Non-fiction → count
	gender: Bars; // Female / Male → count
	genres: Bars; // subgenre → book count, sorted desc (title-cased)
	topAuthors: Bars; // author → distinct books, top 25
	longestBooks: Bars; // top 10 books by page count (label = title)
	lengthDistribution: Bars; // page-count buckets → book count
	avgPagesByYear: Bars; // year → mean pages per book read that year
	avgRatingByGenre: Bars; // subgenre → mean rating, genres with ≥8 books, top 12
	pubEra: Bars; // era of original publication → book count
	countryStats: { country: string; books: number; isoCode: string }[]; // all countries, sorted desc
	topCountries: Bars; // top 10 countries → book count (ready for hBarsSVG)
	languageStats: { language: string; books: number }[]; // all languages, sorted desc
	topLanguages: Bars; // top 12 languages → book count
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})/;
const daysInMonth = (y: number, m: number) => new Date(y, m, 0).getDate(); // m: 1-12
const daysInYear = (y: number) => ((y % 4 === 0 && y % 100 !== 0) || y % 400 === 0 ? 366 : 365);
const titleCase = (s: string) => s.replace(/\b\w/g, (c) => c.toUpperCase());

function daysBetween(aIso: string, bIso: string): number {
	const a = new Date(aIso + 'T00:00:00Z').getTime();
	const b = new Date(bIso + 'T00:00:00Z').getTime();
	return Math.max(1, Math.round((b - a) / 86400000) + 1);
}

const todayIso = new Date().toISOString().slice(0, 10);

// Full period length, but capped at days elapsed for an in-progress period, so the
// current month/year reflects the real reading pace instead of being divided by days
// that haven't happened yet. Completed (or future) periods use their full length.
const monthDenom = (y: number, m: number): number => {
	const full = daysInMonth(y, m);
	const start = `${y}-${String(m).padStart(2, '0')}-01`;
	const end = `${y}-${String(m).padStart(2, '0')}-${String(full).padStart(2, '0')}`;
	if (todayIso < start || todayIso >= end) return full;
	return daysBetween(start, todayIso);
};

const yearDenom = (y: number): number => {
	if (todayIso < `${y}-01-01` || todayIso >= `${y}-12-31`) return daysInYear(y);
	return daysBetween(`${y}-01-01`, todayIso);
};

export function computeStats(): Stats {
	const books = shelf.filter((b) => ISO.test(b.dateRead || ''));

	// ── Scalars ────────────────────────────────────────────────────────────────
	// A book's read total is the number of years it was read (its year shelves),
	// falling back to readCount/1 when no year shelves exist. This keeps the headline
	// figures equal to the sum of the yearly bars.
	const reads = (b: ShelfBook) => (b.readYears && b.readYears.length) ? b.readYears.length : (b.readCount || 1);
	const uniqueBooks = books.length;
	const booksRead = books.reduce((a, b) => a + reads(b), 0);
	const reReads = books.reduce((a, b) => a + Math.max(0, reads(b) - 1), 0);
	const pagesRead = books.reduce((a, b) => a + (b.pages || 0) * reads(b), 0);
	const uniqueAuthors = new Set(books.map((b) => b.author).filter(Boolean)).size;

	const sortedDates = books.map((b) => b.dateRead.slice(0, 10)).sort();
	const firstDate = sortedDates[0];
	const lastDate = sortedDates[sortedDates.length - 1];
	const firstYear = parseInt(firstDate.slice(0, 4), 10);
	const lastYear = parseInt(lastDate.slice(0, 4), 10);
	const avgPagesPerDay = Math.round(pagesRead / daysBetween(firstDate, lastDate));

	// ── Monthly buckets (filled across the whole range) ──────────────────────────
	type Bucket = { count: number; pages: number; fiction: number; nonfiction: number; female: number; male: number };
	const blank = (): Bucket => ({ count: 0, pages: 0, fiction: 0, nonfiction: 0, female: 0, male: 0 });
	const monthMap = new Map<string, Bucket>();
	for (const b of books) {
		const key = b.dateRead.slice(0, 7); // YYYY-MM
		const bk = monthMap.get(key) || blank();
		bk.count += 1;
		bk.pages += b.pages || 0;
		if (b.category === 'fiction') bk.fiction += 1;
		else if (b.category === 'nonfiction') bk.nonfiction += 1;
		if (b.gender === 'female') bk.female += 1;
		else if (b.gender === 'male') bk.male += 1;
		monthMap.set(key, bk);
	}

	const monthKeys: string[] = [];
	for (let y = firstYear; y <= lastYear; y++) {
		for (let m = 1; m <= 12; m++) {
			const key = `${y}-${String(m).padStart(2, '0')}`;
			if (y === firstYear && m < parseInt(firstDate.slice(5, 7), 10)) continue;
			if (y === lastYear && m > parseInt(lastDate.slice(5, 7), 10)) continue;
			monthKeys.push(key);
		}
	}

	const month: Granular = {
		books: [],
		pages: [],
		pagesPerDay: [],
		byCategory: { keys: ['fiction', 'nonfiction'], rows: [] },
		byGender: { keys: ['female', 'male'], rows: [] },
	};
	for (const key of monthKeys) {
		const bk = monthMap.get(key) || blank();
		const [y, m] = key.split('-').map(Number);
		month.books.push({ label: key, value: bk.count });
		month.pages.push({ label: key, value: bk.pages });
		month.pagesPerDay.push({ label: key, value: Math.round(bk.pages / monthDenom(y, m)) });
		month.byCategory.rows.push({ label: key, values: [bk.fiction, bk.nonfiction] });
		month.byGender.rows.push({ label: key, values: [bk.female, bk.male] });
	}

	// ── Yearly buckets ───────────────────────────────────────────────────────────
	// Unlike the monthly view (which can only place a book at its single most-recent
	// read date), each book carries `readYears` — every year it was read, from the
	// Goodreads year shelves. So a re-read counts once in EACH year it was read.
	const yearMap = new Map<number, Bucket>();
	for (const b of books) {
		const years = b.readYears && b.readYears.length ? b.readYears : [parseInt(b.dateRead.slice(0, 4), 10)];
		for (const y of years) {
			const yb = yearMap.get(y) || blank();
			yb.count += 1;
			yb.pages += b.pages || 0;
			if (b.category === 'fiction') yb.fiction += 1;
			else if (b.category === 'nonfiction') yb.nonfiction += 1;
			if (b.gender === 'female') yb.female += 1;
			else if (b.gender === 'male') yb.male += 1;
			yearMap.set(y, yb);
		}
	}

	const year: Granular = {
		books: [],
		pages: [],
		pagesPerDay: [],
		byCategory: { keys: ['fiction', 'nonfiction'], rows: [] },
		byGender: { keys: ['female', 'male'], rows: [] },
	};
	const yearKeys = [...yearMap.keys()];
	const firstChartYear = Math.min(firstYear, ...yearKeys);
	const lastChartYear = Math.max(lastYear, ...yearKeys);
	for (let y = firstChartYear; y <= lastChartYear; y++) {
		const yb = yearMap.get(y) || blank();
		const label = String(y);
		year.books.push({ label, value: yb.count });
		year.pages.push({ label, value: yb.pages });
		year.pagesPerDay.push({ label, value: Math.round(yb.pages / yearDenom(y)) });
		year.byCategory.rows.push({ label, values: [yb.fiction, yb.nonfiction] });
		year.byGender.rows.push({ label, values: [yb.female, yb.male] });
	}

	// ── Distributions ────────────────────────────────────────────────────────────
	const ratingCount = [0, 0, 0, 0, 0]; // index 0 → 1★ … index 4 → 5★
	for (const b of books) {
		if (b.rating && b.rating >= 1 && b.rating <= 5) ratingCount[b.rating - 1] += 1;
	}
	const ratings: Bars = ratingCount.map((value, i) => ({ label: String(i + 1), value }));

	const fiction = books.filter((b) => b.category === 'fiction').length;
	const nonfiction = books.filter((b) => b.category === 'nonfiction').length;
	const category: Bars = [
		{ label: 'Fiction', value: fiction },
		{ label: 'Non-fiction', value: nonfiction },
	];

	const female = books.filter((b) => b.gender === 'female').length;
	const male = books.filter((b) => b.gender === 'male').length;
	const gender: Bars = [
		{ label: 'Female', value: female },
		{ label: 'Male', value: male },
	];

	const genreMap = new Map<string, number>();
	const genreRating = new Map<string, { sum: number; n: number }>(); // for avg rating by genre
	for (const b of books) {
		for (const g of b.subgenres || []) {
			if (!g) continue;
			genreMap.set(g, (genreMap.get(g) || 0) + 1);
			if (b.rating && b.rating >= 1 && b.rating <= 5) {
				const gr = genreRating.get(g) || { sum: 0, n: 0 };
				gr.sum += b.rating;
				gr.n += 1;
				genreRating.set(g, gr);
			}
		}
	}
	const genres: Bars = [...genreMap.entries()]
		.map(([label, value]) => ({ label: titleCase(label), value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));

	// Mean rating per genre, restricted to genres with a meaningful sample (≥8 rated
	// books), sorted by rating desc, top 12.
	const avgRatingByGenre: Bars = [...genreRating.entries()]
		.filter(([, gr]) => gr.n >= 8)
		.map(([label, gr]) => ({ label: titleCase(label), value: Math.round((gr.sum / gr.n) * 10) / 10 }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
		.slice(0, 12);

	const authorMap = new Map<string, number>();
	for (const b of books) {
		if (!b.author) continue;
		authorMap.set(b.author, (authorMap.get(b.author) || 0) + 1);
	}
	const topAuthors: Bars = [...authorMap.entries()]
		.map(([label, value]) => ({ label, value }))
		.sort((a, b) => b.value - a.value || a.label.localeCompare(b.label))
		.slice(0, 25);

	// ── Length & era ─────────────────────────────────────────────────────────────
	// Top 10 longest books by page count (unique books). Titles are longer than the
	// genre/author labels, so truncate for the ranking chart.
	const topLongest = (pred: (b: (typeof books)[number]) => boolean): Bars =>
		books
			.filter((b) => b.pages > 0 && pred(b))
			.sort((a, b) => b.pages - a.pages || a.title.localeCompare(b.title))
			.slice(0, 10)
			.map((b) => ({ label: b.title, value: b.pages }));
	const longestBooks = topLongest(() => true);
	const longestBooksByCategory = {
		all: longestBooks,
		fiction: topLongest((b) => b.category === 'fiction'),
		nonfiction: topLongest((b) => b.category === 'nonfiction'),
	};

	// Page-count distribution across buckets.
	const lengthBuckets: { label: string; test: (p: number) => boolean }[] = [
		{ label: '<200', test: (p) => p < 200 },
		{ label: '200–299', test: (p) => p >= 200 && p < 300 },
		{ label: '300–399', test: (p) => p >= 300 && p < 400 },
		{ label: '400–599', test: (p) => p >= 400 && p < 600 },
		{ label: '600–799', test: (p) => p >= 600 && p < 800 },
		{ label: '800+', test: (p) => p >= 800 },
	];
	const lengthDistribution: Bars = lengthBuckets.map((bucket) => ({
		label: bucket.label,
		value: books.filter((b) => b.pages > 0 && bucket.test(b.pages)).length,
	}));

	// Mean pages per book read each year — reuses the yearMap buckets (count + pages).
	const avgPagesByYear: Bars = [];
	for (let y = firstChartYear; y <= lastChartYear; y++) {
		const yb = yearMap.get(y) || blank();
		avgPagesByYear.push({ label: String(y), value: yb.count ? Math.round(yb.pages / yb.count) : 0 });
	}

	// Era of original publication: coarse bins for antiquity, finer toward the present.
	const eraBuckets: { label: string; test: (y: number) => boolean }[] = [
		{ label: 'BCE', test: (y) => y < 0 },
		{ label: '0–500', test: (y) => y >= 0 && y < 500 },
		{ label: '500–1000', test: (y) => y >= 500 && y < 1000 },
		{ label: '1000–1500', test: (y) => y >= 1000 && y < 1500 },
		{ label: '1500–1700', test: (y) => y >= 1500 && y < 1700 },
		{ label: '1700–1900', test: (y) => y >= 1700 && y < 1900 },
		{ label: '1900–29', test: (y) => y >= 1900 && y < 1930 },
		{ label: '1930–59', test: (y) => y >= 1930 && y < 1960 },
		{ label: '1960–89', test: (y) => y >= 1960 && y < 1990 },
		{ label: '1990–2009', test: (y) => y >= 1990 && y < 2010 },
		{ label: '2010–19', test: (y) => y >= 2010 && y < 2020 },
		{ label: '2020+', test: (y) => y >= 2020 },
	];
	const pubEra: Bars = eraBuckets.map((bucket) => ({
		label: bucket.label,
		value: books.filter((b) => b.originalPubYear != null && bucket.test(b.originalPubYear)).length,
	}));

	// ── Country distribution ───────────────────────────────────────────────────
	const countryMap = new Map<string, number>();
	for (const b of books) {
		if (b.country) countryMap.set(b.country, (countryMap.get(b.country) ?? 0) + 1);
	}
	const countryStats = [...countryMap.entries()]
		.map(([country, cnt]) => ({ country, books: cnt, isoCode: ISO_ALPHA2[country] ?? '' }))
		.sort((a, b) => b.books - a.books || a.country.localeCompare(b.country));
	const topCountries: Bars = countryStats.slice(0, 16).map(({ country, books: cnt }) => ({ label: country, value: cnt }));

	// ── Language distribution ──────────────────────────────────────────────────
	const langMap = new Map<string, number>();
	for (const b of books) {
		const lang = (b as ShelfBook & { language?: string }).language;
		if (lang) langMap.set(lang, (langMap.get(lang) ?? 0) + 1);
	}
	const languageStats = [...langMap.entries()]
		.map(([language, cnt]) => ({ language, books: cnt }))
		.sort((a, b) => b.books - a.books || a.language.localeCompare(b.language));
	const topLanguages: Bars = languageStats.slice(0, 12).map(({ language, books: cnt }) => ({ label: language, value: cnt }));

	return {
		booksRead,
		uniqueBooks,
		uniqueAuthors,
		pagesRead,
		reReads,
		avgPagesPerDay,
		firstYear,
		lastYear,
		yearsReading: lastYear - firstYear + 1,
		timeline: { month, year },
		ratings,
		category,
		gender,
		genres,
		topAuthors,
		longestBooks,
		longestBooksByCategory,
		lengthDistribution,
		avgPagesByYear,
		avgRatingByGenre,
		pubEra,
		countryStats,
		topCountries,
		languageStats,
		topLanguages,
	};
}
