// build-shelf.mjs — generate the "every book I've read" shelf data. Run:  npm run shelf
//
// Source of truth: book-analysis/website-books.xlsx (sheet "books"). The owner
// maintains the book rows; the script manages two cover columns there:
//   `Cover URL`    — every book's cover (review heroImage / auto / owner override)
//   `Cover Source` — Review / Claude / Mine / None
// The analysis workbook is only ever read on bootstrap/--reseed.
//
// What it does:
//   1. Reads website-books.xlsx. If it's missing (first run) or --reseed is given,
//      it's (re)built from the analysis workbook's "modified export" sheet, carrying
//      over the owner's `Mine` overrides by Book Id.
//   2. Keeps "read" rows, deduplicates re-reads by Book Id (most-recent date).
//   3. Resolves each cover: a live review's heroImage (Review) → owner edit of the
//      Cover URL cell (Mine) → OpenLibrary by ISBN then author-verified title search
//      (Claude) → none. Owner edits are auto-detected via a hidden state file
//      (.covers-state.json), which also caches OpenLibrary results (--refresh redoes).
//   4. Writes src/data/shelf.json (committed; the Astro build reads this offline).
//   5. Writes website-books.xlsx back with refreshed `Cover URL` + `Cover Source`,
//      preserving all other owner columns. Backs up to website-books.backup.xlsx.
//
// To set/replace a non-review cover: edit its `Cover URL` cell (source auto-flips to
// Mine), save, close, re-run `npm run shelf`. To change a review's cover, edit the .md.

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync, statSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
// Website source of truth (the script reads + writes this) and its sheet.
const BOOKS_PATH = process.env.SHELF_BOOKS || join(ROOT, 'book-analysis', 'website-books.xlsx');
const BOOKS_BACKUP_PATH = join(ROOT, 'book-analysis', 'website-books.backup.xlsx');
const BOOKS_SHEET = 'books';
// Analysis workbook — read-only, and ONLY on bootstrap/--reseed.
const ANALYSIS_PATH = process.env.SHELF_XLSX || join(ROOT, 'book-analysis', 'Sabtain 2015-2026 analysis of books read.xlsx');
const ANALYSIS_SHEET = 'modified export';
const SHELF_PATH = join(ROOT, 'src', 'data', 'shelf.json');
// Currently-reading books (Exclusive Shelf = currently-reading) for the home-page band.
const CURRENT_PATH = join(ROOT, 'src', 'data', 'currently-reading.json');
const CONTENT_DIR = join(ROOT, 'src', 'content', 'blog');
// Hidden per-book state (owner-edit detection + OpenLibrary cache). Not a column.
const STATE_PATH = join(ROOT, 'book-analysis', '.covers-state.json');

const REFRESH = process.argv.includes('--refresh');
const RESEED = process.argv.includes('--reseed');

// Cover columns in website-books.xlsx: two we manage, plus legacy ones we retire.
const COVER_COL = 'Cover URL';
const SOURCE_COL = 'Cover Source';
const LEGACY_COVER_COLS = ['Cover', 'Auto Cover', 'Suggestion'];

// ── Normalise values from the xlsx ────────────────────────────────────────────
// ISBN13 may be an empty string or a proper 13-digit string; trim and guard.
const cleanIsbn = (s) => (s || '').toString().replace(/[^0-9Xx]/g, '').toUpperCase() || null;

// Dates come as JS Date objects (cellDates: true). Format as YYYY-MM-DD.
function toIso(val) {
	if (!val) return '';
	if (val instanceof Date) return val.toISOString().slice(0, 10);
	// Fallback: string like "2016-04-30" or "4/30/16"
	const s = String(val).trim();
	if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
	// MM/DD/YY → YYYY-MM-DD
	const [m, d, y] = s.split('/');
	if (m && d && y) {
		const yr = y.length === 2 ? (parseInt(y, 10) > 50 ? `19${y}` : `20${y}`) : y;
		return `${yr}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
	}
	return '';
}

// Goodreads `Bookshelves` tags each book with every year it was read ("2014, 2015…").
// Pull those 4-digit year tokens; used to count each read in its own year.
function parseReadYears(val) {
	return [...new Set(String(val ?? '').match(/\b(?:19|20)\d\d\b/g) || [])].map(Number);
}

// Genre A: 'Fiction' → 'fiction', 'Non-Fiction'/'non-Fiction' → 'nonfiction'
function normaliseCategory(g) {
	const s = (g || '').trim().toLowerCase();
	if (s === 'fiction') return 'fiction';
	if (s.includes('non') || s.includes('nonfiction')) return 'nonfiction';
	return '';
}

// Build subgenres array from Genre B + Genre C (Genre D ignored — rarely used, max 2 subgenres).
function normaliseSubgenres(b, c) {
	const clean = (v) => (v || '').toString().trim();
	const result = [clean(b), clean(c)].filter(Boolean).map(s => s.toLowerCase());
	return [...new Set(result)]; // deduplicate
}

// Author Gender: 'Male' → 'male', 'Female' → 'female', anything else → '' (unknown).
function normaliseGender(g) {
	const s = (g || '').trim().toLowerCase();
	if (s === 'male' || s === 'm') return 'male';
	if (s === 'female' || s === 'f') return 'female';
	return '';
}

// ── Scan markdown for LIVE reviews that have a heroImage → Map<gid, heroImageUrl>.
// These covers are authored in the .md, so they show as `Review` in the sheet. ──
function liveReviewCovers() {
	const byGid = new Map();
	function walk(dir) {
		for (const name of readdirSync(dir)) {
			const p = join(dir, name);
			if (statSync(p).isDirectory()) walk(p);
			else if (/\.(md|mdx)$/.test(name)) {
				const head = readFileSync(p, 'utf8').slice(0, 1500);
				const gid = head.match(/goodreadsId:\s*['"]?(\d+)/);
				const hero = head.match(/heroImage:\s*['"]?([^'"\n]+?)['"]?\s*(?:\n|$)/);
				const status = head.match(/status:\s*['"]?(\w+)/);
				const live = !status || status[1] === 'live';
				if (gid && live && hero && hero[1].trim()) byGid.set(gid[1], hero[1].trim());
			}
		}
	}
	if (existsSync(CONTENT_DIR)) walk(CONTENT_DIR);
	return byGid;
}

// ── OpenLibrary cover probe ────────────────────────────────────────────────
async function probeCover(isbn) {
	if (!isbn) return null;
	const url = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg?default=false`;
	try {
		const res = await fetch(url, { method: 'HEAD' });
		return res.ok ? url : null;
	} catch {
		return null;
	}
}

// ── OpenLibrary search fallback ─────────────────────────────────────────────
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const coverIdUrl = (id) => `https://covers.openlibrary.org/b/id/${id}-L.jpg`;
const normAuthor = (s) => (s || '').toLowerCase().replace(/[^a-z]/g, '');
const cleanTitle = (t) => (t || '').replace(/\([^)]*\)/g, '').replace(/:.*$/, '').trim();

async function olSearch(params) {
	const qs = new URLSearchParams({ limit: '3', fields: 'cover_i,author_name', ...params });
	try {
		const res = await fetch(`https://openlibrary.org/search.json?${qs}`, {
			headers: { 'User-Agent': 'a-book-in-the-hand shelf cover-fill (personal site)' },
		});
		if (!res.ok) return [];
		return (await res.json()).docs || [];
	} catch {
		return [];
	}
}

async function searchCover(title, author) {
	const ct = cleanTitle(title);
	const an = normAuthor(author);
	if (!ct) return null;
	for (const params of [{ title: ct, author }, { q: `${ct} ${author}` }]) {
		for (const d of await olSearch(params)) {
			if (!d.cover_i) continue;
			const authors = normAuthor((d.author_name || []).join(' '));
			const match = !!an && (authors.includes(an.slice(0, 8)) || an.includes(authors.slice(0, 8)));
			return { url: coverIdUrl(d.cover_i), confidence: match ? 'author-match' : 'weak' };
		}
	}
	for (const d of await olSearch({ title: ct })) {
		if (d.cover_i) return { url: coverIdUrl(d.cover_i), confidence: 'title-only' };
	}
	return null;
}

async function mapWithConcurrency(items, limit, fn) {
	const results = new Array(items.length);
	let next = 0;
	async function worker() {
		while (next < items.length) {
			const i = next++;
			results[i] = await fn(items[i], i);
		}
	}
	await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
	return results;
}

// ── xlsx row IO ──────────────────────────────────────────────────────────────
function readSheetRows(path, sheet) {
	if (!existsSync(path)) return null;
	const wb = XLSX.readFile(path, { cellDates: true });
	const ws = wb.Sheets[sheet];
	if (!ws) return null;
	return XLSX.utils.sheet_to_json(ws, { raw: true });
}

// Write website-books.xlsx: the owner's rows, with exactly two managed cover
// columns — `Cover URL` + `Cover Source` — set per row by Book Id. Legacy cover
// columns are dropped; all other owner columns pass through. Backs up first.
function writeBooksFile(rows, byId) {
	for (const r of rows) {
		const b = byId.get(String(r['Book Id'] || '').trim());
		for (const c of LEGACY_COVER_COLS) delete r[c];
		r[COVER_COL] = b ? (b.coverUrl || '') : '';
		r[SOURCE_COL] = b ? b.source : '';
	}
	const base = Object.keys(rows[0] || {}).filter((h) => h !== COVER_COL && h !== SOURCE_COL);
	const header = [...base, COVER_COL, SOURCE_COL];

	if (existsSync(BOOKS_PATH)) copyFileSync(BOOKS_PATH, BOOKS_BACKUP_PATH);
	const ws = XLSX.utils.json_to_sheet(rows, { header });
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, BOOKS_SHEET);
	mkdirSync(dirname(BOOKS_PATH), { recursive: true });
	XLSX.writeFile(wb, BOOKS_PATH);
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main() {
	// 1) Source rows: website-books.xlsx (source of truth), or (re)build from the
	//    analysis workbook on first run / --reseed (the only time it's read).
	let rows;
	if (RESEED || !existsSync(BOOKS_PATH)) {
		const analysisRows = readSheetRows(ANALYSIS_PATH, ANALYSIS_SHEET);
		if (!analysisRows) {
			console.error(`✗ Can't ${RESEED ? 'reseed' : 'bootstrap'}: sheet "${ANALYSIS_SHEET}" not found at ${ANALYSIS_PATH}`);
			process.exit(1);
		}
		// Carry over the owner's `Mine` overrides (by Book Id) so they survive a resync.
		// (Review/Claude covers are recomputed; legacy `Cover` is migrated as a Mine seed.)
		const carried = {};
		const existing = readSheetRows(BOOKS_PATH, BOOKS_SHEET);
		if (existing) for (const r of existing) {
			const id = String(r['Book Id'] || '').trim();
			const url = String(r[COVER_COL] || '').trim();
			const src = String(r[SOURCE_COL] || '').trim();
			const legacy = String(r['Cover'] || '').trim();
			if (id && src === 'Mine' && url) carried[id] = url;
			else if (id && legacy) carried[id] = legacy;
		}
		rows = analysisRows
			.filter((r) => r['Exclusive Shelf'] === 'read')
			.map((r) => ({ ...r, [COVER_COL]: carried[String(r['Book Id'] || '').trim()] || '' }));
		console.log(`${RESEED ? 'Reseeded' : 'Bootstrapped'} website-books.xlsx from analysis workbook (${rows.length} read rows)`);
	} else {
		rows = readSheetRows(BOOKS_PATH, BOOKS_SHEET);
		if (!rows) {
			console.error(`✗ Sheet "${BOOKS_SHEET}" not found in ${BOOKS_PATH}`);
			process.exit(1);
		}
	}
	const readRows = rows.filter((r) => r['Exclusive Shelf'] === 'read');
	console.log(`Read rows: ${readRows.length}`);

	// 2) Deduplicate re-reads by Book Id (most-recent date). Covers resolve separately.
	//    Read-years are aggregated across all of a book's rows so each read still counts
	//    in its own year (the shelf card itself stays one-per-book).
	const yearsById = new Map();
	for (const r of readRows) {
		const id = String(r['Book Id'] || '').trim();
		if (!id) continue;
		const set = yearsById.get(id) || new Set();
		for (const y of parseReadYears(r['Bookshelves'])) set.add(y);
		yearsById.set(id, set);
	}
	const byId = new Map();
	for (const r of readRows) {
		const id = String(r['Book Id'] || '').trim();
		if (!id) continue;
		const date = toIso(r['Date Read'] || r['Date Added']);
		const prev = byId.get(id);
		if (!prev || date > prev.dateRead) {
			byId.set(id, {
				goodreadsId: id,
				title: String(r['Title'] || '').trim(),
				author: String(r['Author'] || '').trim(),
				isbn13: cleanIsbn(r['ISBN13']) || cleanIsbn(r['ISBN']) || null,
				rating: parseInt(String(r['My Rating'] || '0'), 10) || null,
				dateRead: date,
				readCount: parseInt(String(r['Read Count'] || '1'), 10) || 1,
				readYears: (() => {
					const ys = [...(yearsById.get(id) || [])].sort();
					return ys.length ? ys : (date ? [parseInt(date.slice(0, 4), 10)] : []);
				})(),
				pages: parseInt(String(r['Number of Pages'] || '0'), 10) || 0,
				category: normaliseCategory(r['Genre A']),
				subgenres: normaliseSubgenres(r['Genre B'], r['Genre C']),
				gender: normaliseGender(r['Gender']),
				classic: !!(r['Classics?'] && String(r['Classics?']).trim()),
			});
		}
	}
	const books = Array.from(byId.values());
	console.log(`Unique books: ${books.length}`);

	// 2b) Currently-reading books (for the home page). One per Book Id, newest-added first.
	//     They share the read books' cover resolution but stay out of shelf.json + stats.
	const currentById = new Map();
	for (const r of rows.filter((r) => r['Exclusive Shelf'] === 'currently-reading')) {
		const id = String(r['Book Id'] || '').trim();
		if (!id || currentById.has(id)) continue;
		currentById.set(id, {
			goodreadsId: id,
			title: String(r['Title'] || '').trim(),
			author: String(r['Author'] || '').trim(),
			isbn13: cleanIsbn(r['ISBN13']) || cleanIsbn(r['ISBN']) || null,
			dateAdded: toIso(r['Date Added']),
			currentlyReading: true,
		});
	}
	const currentBooks = Array.from(currentById.values());
	// All books that need a cover resolved + written back (read shelf + currently-reading).
	const coverBooks = [...books, ...currentBooks];
	if (currentBooks.length) console.log(`Currently reading: ${currentBooks.length}`);

	// 3) Resolve covers into one `Cover URL` + provenance per book.
	//    Inputs by Book Id: review heroImage (from .md), the sheet's current Cover URL
	//    cell, and hidden state (.covers-state.json) = what the script last wrote +
	//    the OpenLibrary cache. This lets an owner edit just the URL cell and have it
	//    auto-detected as `Mine` without a separate column.
	const reviewCovers = liveReviewCovers();
	const state = (!REFRESH && existsSync(STATE_PATH)) ? JSON.parse(readFileSync(STATE_PATH, 'utf8')) : {};

	// Current sheet URL per book ('Cover URL', or legacy 'Cover' on first migration);
	// legacy 'Auto Cover' seeds the cache so the migration run doesn't re-probe.
	const sheetUrlById = {}, autoSeed = {};
	for (const r of rows) {
		const id = String(r['Book Id'] || '').trim(); if (!id) continue;
		const cur = String(r[COVER_COL] ?? r['Cover'] ?? '').trim();
		if (cur && !(id in sheetUrlById)) sheetUrlById[id] = cur;
		const ac = String(r['Auto Cover'] || '').trim();
		if (ac && !(id in autoSeed)) autoSeed[id] = ac;
	}

	for (const b of coverBooks) {
		const id = b.goodreadsId;
		b.reviewed = reviewCovers.has(id);
		b.heroImage = b.reviewed ? reviewCovers.get(id) : null;
		b.sheetUrl = sheetUrlById[id] || '';
		b.st = state[id] || null;
		b.auto = (b.st && b.st.auto) || autoSeed[id] || null;
		// A confident owner override needs no auto lookup.
		b.confidentMine = !b.reviewed && !!b.st && b.st.source === 'Mine' && !!b.sheetUrl;
	}

	// Probe OpenLibrary only for non-reviewed books with no cached auto and not a known override.
	const toProbe = coverBooks.filter((b) => !b.reviewed && !b.confidentMine && !b.auto);
	console.log(`Reviews: ${books.filter((b) => b.reviewed).length} · cached auto: ${books.filter((b) => !b.reviewed && b.auto).length} · resolving ${toProbe.length}…`);
	let done = 0;
	await mapWithConcurrency(toProbe, 4, async (b) => {
		let url = await probeCover(b.isbn13);
		if (!url) {
			const s = await searchCover(b.title, b.author);
			if (s && s.confidence === 'author-match') url = s.url;
			await sleep(120);
		}
		b.auto = url || null;
		if (++done % 50 === 0) console.log(`  …${done}/${toProbe.length}`);
	});

	// Finalize: effective cover URL + source, and the next hidden state.
	const nextState = {};
	for (const b of coverBooks) {
		const scriptUrl = b.reviewed ? b.heroImage : (b.auto || null);
		const scriptSource = b.reviewed ? 'Review' : (b.auto ? 'Claude' : 'None');
		// Owner override detection (non-reviewed only): the URL cell differs from what
		// the script last wrote, or was already claimed as Mine. Robust to a lost state
		// file: with no record, a URL that isn't our script value is treated as theirs.
		let isMine = false;
		if (!b.reviewed && b.sheetUrl) {
			isMine = b.st ? (b.sheetUrl !== b.st.written || b.st.source === 'Mine') : (b.sheetUrl !== scriptUrl);
		}
		b.coverUrl = isMine ? b.sheetUrl : (scriptUrl || null);
		b.source = isMine ? 'Mine' : scriptSource;
		nextState[b.goodreadsId] = { written: b.coverUrl || '', source: b.source, auto: b.auto || (b.st && b.st.auto) || '' };
	}
	const n = books.reduce((a, b) => ((a[b.source] = (a[b.source] || 0) + 1), a), {});
	console.log(`Cover sources → Review: ${n.Review || 0} · Claude: ${n.Claude || 0} · Mine: ${n.Mine || 0} · None: ${n.None || 0}`);

	// 4) Write shelf.json (public fields only), newest-read first.
	books.sort((a, b) => (b.dateRead || '').localeCompare(a.dateRead || ''));
	const output = books.map((b) => ({
		goodreadsId: b.goodreadsId, title: b.title, author: b.author, isbn13: b.isbn13,
		rating: b.rating, dateRead: b.dateRead, readCount: b.readCount, readYears: b.readYears, pages: b.pages,
		category: b.category, subgenres: b.subgenres, gender: b.gender, classic: b.classic,
		coverUrl: b.coverUrl,
	}));
	mkdirSync(dirname(SHELF_PATH), { recursive: true });
	writeFileSync(SHELF_PATH, JSON.stringify(output, null, '\t') + '\n');
	console.log(`✓ Wrote ${SHELF_PATH} (${output.length} books)`);

	// 4b) Write currently-reading.json (newest-added first) for the home page band.
	currentBooks.sort((a, b) => (b.dateAdded || '').localeCompare(a.dateAdded || ''));
	const currentOut = currentBooks.map((b) => ({
		goodreadsId: b.goodreadsId, title: b.title, author: b.author, coverUrl: b.coverUrl,
	}));
	writeFileSync(CURRENT_PATH, JSON.stringify(currentOut, null, '\t') + '\n');
	console.log(`✓ Wrote ${CURRENT_PATH} (${currentOut.length} currently-reading)`);

	// 5) Persist hidden state (edit-detection + auto cache).
	writeFileSync(STATE_PATH, JSON.stringify(nextState, null, '\t') + '\n');

	// 6) Write website-books.xlsx back with the two managed cover columns. All rows are
	//    preserved (read shelf + currently-reading); covers come from every resolved book.
	const coverById = new Map(coverBooks.map((b) => [b.goodreadsId, b]));
	writeBooksFile(rows, coverById);
	console.log(`✓ Wrote ${BOOKS_PATH} (${rows.length} rows · backup at ${BOOKS_BACKUP_PATH})`);
}

main();
