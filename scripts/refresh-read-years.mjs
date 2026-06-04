// refresh-read-years.mjs — one-time data fix for per-year read accuracy. Run:
//   node scripts/refresh-read-years.mjs
//
// Import the latest Goodreads export into the site's master (website-books.xlsx). The
// export's `Bookshelves` column tags each book with EVERY year it was read
// (e.g. "2014, 2015, … 2020"), which drives the per-year stats. This script:
//   1. Refreshes each master row's `Bookshelves` from the current CSV
//      (join by Book Id, then normalized title+author).
//   2. Imports any export book missing from the master — "read" books onto the shelf,
//      and "currently-reading" books (for the home-page band), copying the fields the
//      export provides. Genre A/B + Gender are left blank for you to fill (reported below).
//   3. Fixes the legacy "Siddharta" → "Siddhartha" title typo.
// It backs up to website-books.backup.xlsx, then rewrites website-books.xlsx. The cover
// columns are left untouched (the next `npm run shelf` reconciles them as usual).
//
// Re-run this whenever you drop in a fresher Goodreads export.

import { existsSync, copyFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CSV_PATH = process.env.SHELF_CSV ||
	join(ROOT, 'goodreads_library_export - goodreads_library_export.csv');
const BOOKS_PATH = process.env.SHELF_BOOKS || join(ROOT, 'book-analysis', 'website-books.xlsx');
const BOOKS_BACKUP_PATH = join(ROOT, 'book-analysis', 'website-books.backup.xlsx');
const BOOKS_SHEET = 'books';

const SHELVES_COL = 'Bookshelves';

// CSV → master columns copied verbatim when importing a new book (shared names).
// Genre A/B/C/D and Gender are intentionally left blank — the export can't supply them.
const COPY_COLS = [
	'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors', 'My Rating',
	'Average Rating', 'Number of Pages', 'Year Published', 'Original Publication Year',
	'Bookshelves', 'Read Count', 'Owned Copies', 'Publisher', 'Binding',
];

// Normalize a title/author for fuzzy join (lowercase, alnum + spaces only).
const norm = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
// Edition-insensitive title key: drop "(…)" suffixes like "(A New Directions Paperback)"
// so a different edition of a book already in the master isn't imported as a duplicate.
// (Series markers like "(Harry Potter, #5)" are still distinguished by the main title.)
const looseKey = (title, author) => `${norm(String(title ?? '').replace(/\([^)]*\)/g, ' '))}|${norm(author)}`;
const hasYear = (s) => /\b(19|20)\d\d\b/.test(String(s ?? ''));

// Goodreads CSV dates arrive as a Date (cellDates), an Excel serial number (xlsx parses
// "2026/05/10" → 46152), or a "YYYY/MM/DD" string. Return a UTC Date (so the xlsx stores a
// real date cell) or '' when absent.
function parseCsvDate(v) {
	if (v instanceof Date) return v;
	if (typeof v === 'number' && isFinite(v)) return new Date(Math.round((v - 25569) * 86400000));
	const m = String(v ?? '').trim().match(/^(\d{4})[/-](\d{2})[/-](\d{2})/);
	return m ? new Date(Date.UTC(+m[1], +m[2] - 1, +m[3])) : '';
}

function readSheet(path, sheet) {
	// Read CSV as a UTF-8 string (XLSX.readFile mis-decodes accented characters like "é");
	// xlsx workbooks are read normally with date cells preserved.
	const wb = path.toLowerCase().endsWith('.csv')
		? XLSX.read(readFileSync(path, 'utf8'), { type: 'string', cellDates: true })
		: XLSX.readFile(path, { cellDates: true });
	const ws = sheet ? wb.Sheets[sheet] : wb.Sheets[wb.SheetNames[0]];
	if (!ws) throw new Error(`Sheet "${sheet}" not found in ${path}`);
	return XLSX.utils.sheet_to_json(ws, { raw: true });
}

function main() {
	if (!existsSync(CSV_PATH)) { console.error(`✗ CSV not found: ${CSV_PATH}`); process.exit(1); }
	if (!existsSync(BOOKS_PATH)) { console.error(`✗ Master not found: ${BOOKS_PATH}`); process.exit(1); }

	const allCsv = readSheet(CSV_PATH);
	const shelfOf = (r) => String(r['Exclusive Shelf'] ?? '').trim();
	const csvRead = allCsv.filter((r) => shelfOf(r) === 'read');
	const csvCurrent = allCsv.filter((r) => shelfOf(r) === 'currently-reading');
	let rows = readSheet(BOOKS_PATH, BOOKS_SHEET);

	// Reconcile the master's currently-reading rows against the export: a book finished
	// since the last import becomes a read row; one removed from the export is dropped.
	// (New currently-reading books are added further below.) Look up by Book Id, then
	// edition-insensitive title+author, preferring a "read" match.
	const expByIdShelf = new Map();
	const expByLooseShelf = new Map();
	for (const r of allCsv) {
		const info = { shelf: shelfOf(r), dateRead: r['Date Read'] };
		const id = String(r['Book Id'] ?? '').trim();
		if (id) expByIdShelf.set(id, info);
		const k = looseKey(r['Title'], r['Author']);
		if (!expByLooseShelf.has(k) || (expByLooseShelf.get(k).shelf !== 'read' && info.shelf === 'read')) {
			expByLooseShelf.set(k, info);
		}
	}
	let transitioned = 0, dropped = 0;
	rows = rows.filter((r) => {
		if (String(r['Exclusive Shelf']).trim() !== 'currently-reading') return true;
		const m = expByIdShelf.get(String(r['Book Id'] ?? '').trim()) ?? expByLooseShelf.get(looseKey(r['Title'], r['Author']));
		if (m && m.shelf === 'currently-reading') return true;          // still reading
		if (m && m.shelf === 'read') {                                   // finished → read
			r['Exclusive Shelf'] = 'read';
			if (!r['Date Read']) r['Date Read'] = parseCsvDate(m.dateRead);
			transitioned++;
			return true;
		}
		dropped++;                                                      // gone from export
		return false;
	});

	// Build lookups from the CSV: Book Id → Bookshelves, and title+author → Bookshelves
	// (preferring values that actually carry a year token over shelves like "favorites").
	// Ratings are tracked the same way so a rating set/changed in Goodreads flows through.
	const byId = new Map();
	const byTA = new Map();
	const ratingById = new Map();
	const ratingByTA = new Map();
	for (const r of allCsv) {
		const shelves = String(r[SHELVES_COL] ?? '').trim();
		const id = String(r['Book Id'] ?? '').trim();
		const rating = Number(r['My Rating']) || 0;
		if (id) { byId.set(id, shelves); if (rating > 0) ratingById.set(id, rating); }
		const key = `${norm(r['Title'])}|${norm(r['Author'])}`;
		if (!byTA.has(key) || (!hasYear(byTA.get(key)) && hasYear(shelves))) byTA.set(key, shelves);
		if (rating > 0 && !ratingByTA.has(key)) ratingByTA.set(key, rating);
	}

	// Refresh Bookshelves + My Rating + fix the Siddharta typo on every master row.
	let refreshed = 0, fixedTypo = 0, ratingsUpdated = 0, unmatched = [];
	for (const r of rows) {
		if (String(r['Title']).trim() === 'Siddharta') { r['Title'] = 'Siddhartha'; fixedTypo++; }
		const id = String(r['Book Id'] ?? '').trim();
		const key = `${norm(r['Title'])}|${norm(r['Author'])}`;
		const shelves = byId.get(id) ?? byTA.get(key);
		if (shelves !== undefined && shelves !== '') {
			if (r[SHELVES_COL] !== shelves) refreshed++;
			r[SHELVES_COL] = shelves;
		} else {
			unmatched.push(`${r['Title']} — ${r['Author']}`);
		}
		const rating = ratingById.get(id) ?? ratingByTA.get(key);
		if (typeof rating === 'number' && rating > 0 && Number(r['My Rating'] || 0) !== rating) {
			r['My Rating'] = rating;
			ratingsUpdated++;
		}
	}

	// Import any export book missing from the master (by Book Id, then title+author).
	const blankKeys = Object.keys(rows[0]);
	const idSet = new Set(rows.map((r) => String(r['Book Id'] ?? '').trim()).filter(Boolean));
	const taSet = new Set(rows.map((r) => `${norm(r['Title'])}|${norm(r['Author'])}`));
	const looseSet = new Set(rows.map((r) => looseKey(r['Title'], r['Author'])));
	const inMaster = (r) =>
		idSet.has(String(r['Book Id'] ?? '').trim()) ||
		taSet.has(`${norm(r['Title'])}|${norm(r['Author'])}`) ||
		looseSet.has(looseKey(r['Title'], r['Author']));

	function importBook(r, shelfVal) {
		const row = Object.fromEntries(blankKeys.map((k) => [k, '']));
		for (const c of COPY_COLS) if (r[c] !== undefined && r[c] !== '') row[c] = r[c];
		row['Date Read'] = parseCsvDate(r['Date Read']);
		row['Date Added'] = parseCsvDate(r['Date Added']);
		row['Exclusive Shelf'] = shelfVal;
		rows.push(row);
		idSet.add(String(r['Book Id'] ?? '').trim());
		taSet.add(`${norm(r['Title'])}|${norm(r['Author'])}`);
		looseSet.add(looseKey(r['Title'], r['Author']));
		return `${r['Title']} — ${r['Author']}`;
	}

	const addedRead = [];
	for (const r of csvRead) if (!inMaster(r)) addedRead.push(importBook(r, 'read'));
	const addedCurrent = [];
	for (const r of csvCurrent) if (!inMaster(r)) addedCurrent.push(importBook(r, 'currently-reading'));

	// Curation gaps: read rows still missing Genre A or Gender (the export can't supply these).
	const needCuration = rows
		.filter((r) => String(r['Exclusive Shelf']).trim() === 'read')
		.filter((r) => !String(r['Genre A'] ?? '').trim() || !String(r['Gender'] ?? '').trim())
		.map((r) => `${r['Title']} — ${r['Author']}`);

	// Write back (backup first), preserving column order + all other owner columns.
	const header = Object.keys(rows[0]);
	if (existsSync(BOOKS_PATH)) copyFileSync(BOOKS_PATH, BOOKS_BACKUP_PATH);
	const ws = XLSX.utils.json_to_sheet(rows, { header });
	const wb = XLSX.utils.book_new();
	XLSX.utils.book_append_sheet(wb, ws, BOOKS_SHEET);
	mkdirSync(dirname(BOOKS_PATH), { recursive: true });
	XLSX.writeFile(wb, BOOKS_PATH);

	console.log(`✓ Refreshed Bookshelves on ${refreshed} rows · updated ${ratingsUpdated} rating(s) · fixed ${fixedTypo} "Siddharta" typo(s)`);
	console.log(`  Imported ${addedRead.length} new read book(s)${addedRead.length ? `: ${addedRead.join('; ')}` : ''}`);
	console.log(`  Currently-reading: ${transitioned} finished → read · ${dropped} dropped · ${addedCurrent.length} newly added${addedCurrent.length ? ` (${addedCurrent.join('; ')})` : ''}`);
	console.log(`  Rows without a year-shelf match (use Date Read year): ${unmatched.length}`);
	if (needCuration.length) {
		console.log(`\n⚠ Fill Genre A/B + Gender for ${needCuration.length} book(s) in website-books.xlsx before \`npm run shelf\`:`);
		for (const t of needCuration) console.log(`    • ${t}`);
	}
	console.log(`\n  Wrote ${BOOKS_PATH} (${rows.length} rows · backup at ${BOOKS_BACKUP_PATH}). Run \`npm run shelf\` next.`);
}

main();
