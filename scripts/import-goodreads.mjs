// import-goodreads.mjs — sync a Goodreads CSV export into website-books.xlsx.
//
// Run whenever you have a new export:
//   node scripts/import-goodreads.mjs
//
// Input:  data/goodreads_library_export.csv   (place here before running)
// Output: book-analysis/website-books.xlsx    (patched in place, backup written first)
//
// After running, open website-books.xlsx and fill in Genre A, Genres, Gender,
// Country for any new rows, then close the file and run:  npm run shelf

import { copyFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BOOKS_PATH = join(ROOT, 'book-analysis', 'website-books.xlsx');
const BACKUP_PATH = join(ROOT, 'book-analysis', 'website-books.backup.xlsx');
const CSV_PATH = join(ROOT, 'data', 'goodreads_library_export.csv');

// Goodreads columns A–W (locked order) + custom columns.
const COL_ORDER = [
	'Book Id', 'Title', 'Author', 'Author l-f', 'Additional Authors',
	'ISBN', 'ISBN13', 'My Rating', 'Publisher', 'Binding',
	'Number of Pages', 'Year Published', 'Original Publication Year',
	'Date Read', 'Date Added',
	'Bookshelves', 'Bookshelves with positions', 'Exclusive Shelf',
	'My Review', 'Spoiler', 'Private Notes', 'Read Count', 'Owned Copies',
	'Gender', 'Genre A', 'Genres', 'Country', 'Cover URL', 'Cover Source',
];

// Convert any date value from the CSV to a JS Date (for Excel storage).
function toExcelDate(val) {
	if (!val) return '';
	if (val instanceof Date) return isNaN(val) ? '' : val;
	if (typeof val === 'number') {
		const d = new Date(Math.round((val - 25569) * 86400 * 1000));
		return isNaN(d) ? '' : d;
	}
	const s = String(val).trim().replace(/\//g, '-');
	if (!s) return '';
	const d = new Date(s);
	return isNaN(d) ? '' : d;
}

function toIso(val) {
	const d = toExcelDate(val);
	if (!d) return '';
	return d.toISOString().slice(0, 10);
}

// Build a new xlsx row from a CSV row, leaving custom columns blank.
function csvToRow(csvRow) {
	const row = {};
	for (const col of COL_ORDER) {
		switch (col) {
			case 'Date Read':
				row[col] = toExcelDate(csvRow['Date Read']);
				break;
			case 'Date Added':
				row[col] = toExcelDate(csvRow['Date Added']);
				break;
			case 'Gender':
			case 'Genre A':
			case 'Genres':
			case 'Country':
			case 'Cover URL':
			case 'Cover Source':
				row[col] = '';
				break;
			default:
				row[col] = csvRow[col] ?? '';
		}
	}
	return row;
}

// ── Guards ─────────────────────────────────────────────────────────────────────
if (!existsSync(CSV_PATH)) {
	console.error(`✗ CSV not found: ${CSV_PATH}`);
	console.error('  Place your Goodreads export there and re-run.');
	process.exit(1);
}
if (!existsSync(BOOKS_PATH)) {
	console.error(`✗ xlsx not found: ${BOOKS_PATH}`);
	process.exit(1);
}

// ── Read xlsx ─────────────────────────────────────────────────────────────────
const wb = XLSX.readFile(BOOKS_PATH, { cellDates: true });
const rows = XLSX.utils.sheet_to_json(wb.Sheets['books'], { raw: true, defval: '' });
console.log(`  xlsx: ${rows.length} rows`);

// Strip parenthetical edition suffixes for fuzzy title matching.
// "Siddhartha (A New Directions Paperback)" → "siddhartha"
function baseTitle(t) {
	return String(t || '').toLowerCase().trim().replace(/\s*\([^)]*\)\s*$/, '').trim();
}

// Build indexes for the xlsx.
const xlsxById = new Map();      // Book Id → row index
const xlsxByTitle = new Map();   // lowercase title → row index
const xlsxByBase = new Map();    // stripped base title → row index (edition fallback)
rows.forEach((r, i) => {
	const id = String(r['Book Id'] || '').trim();
	const title = String(r['Title'] || '').toLowerCase().trim();
	const base = baseTitle(r['Title']);
	if (id) xlsxById.set(id, i);
	if (title && !xlsxByTitle.has(title)) xlsxByTitle.set(title, i);
	if (base && !xlsxByBase.has(base)) xlsxByBase.set(base, i);
});

// ── Read CSV ──────────────────────────────────────────────────────────────────
const csvWb = XLSX.readFile(CSV_PATH, { cellDates: true });
const csvRows = XLSX.utils.sheet_to_json(csvWb.Sheets[csvWb.SheetNames[0]], { defval: '' });
console.log(`  csv: ${csvRows.length} rows`);

// Only care about read + currently-reading.
const relevant = csvRows.filter(r => {
	const shelf = String(r['Exclusive Shelf'] || '');
	return shelf === 'read' || shelf === 'currently-reading';
});

// ── Detect changes ────────────────────────────────────────────────────────────
const newReads = [];
const newCurrent = [];
const finishedBooks = []; // currently-reading in xlsx → now read in CSV
const titleFallbacks = []; // books matched by title instead of ID

for (const csvRow of relevant) {
	const id = String(csvRow['Book Id'] || '').trim();
	const title = String(csvRow['Title'] || '').toLowerCase().trim();
	const shelf = String(csvRow['Exclusive Shelf'] || '');

	// Find existing row in xlsx: ID → exact title → base title (strips edition notes).
	let idx = xlsxById.has(id) ? xlsxById.get(id) : null;
	let usedTitleFallback = false;
	if (idx === null && xlsxByTitle.has(title)) {
		idx = xlsxByTitle.get(title);
		usedTitleFallback = true;
	}
	if (idx === null) {
		const base = baseTitle(csvRow['Title']);
		if (xlsxByBase.has(base)) {
			idx = xlsxByBase.get(base);
			usedTitleFallback = true;
		}
	}

	if (idx === null) {
		// New book — not in xlsx at all.
		if (shelf === 'read') newReads.push(csvRow);
		else if (shelf === 'currently-reading') newCurrent.push(csvRow);
	} else {
		// Existing book — check for shelf transition.
		const xlsxShelf = String(rows[idx]['Exclusive Shelf'] || '');
		if (xlsxShelf === 'currently-reading' && shelf === 'read') {
			finishedBooks.push({ csvRow, idx });
		}
		if (usedTitleFallback) {
			titleFallbacks.push(String(csvRow['Title'] || ''));
		}
	}
}

// ── Apply changes ─────────────────────────────────────────────────────────────
if (newReads.length === 0 && newCurrent.length === 0 && finishedBooks.length === 0) {
	console.log('\nNothing to import — xlsx is already up to date.');
	process.exit(0);
}

// Backup before any writes.
copyFileSync(BOOKS_PATH, BACKUP_PATH);
console.log(`\n✓ Backed up → ${BACKUP_PATH}`);

// Update finished books (currently-reading → read).
for (const { csvRow, idx } of finishedBooks) {
	rows[idx]['Exclusive Shelf'] = 'read';
	const dateRead = toExcelDate(csvRow['Date Read']);
	if (dateRead) rows[idx]['Date Read'] = dateRead;
}

// Append new rows.
for (const csvRow of newReads) rows.push(csvToRow(csvRow));
for (const csvRow of newCurrent) rows.push(csvToRow(csvRow));

// ── Write xlsx (preserve non-books sheets) ────────────────────────────────────
const newWs = XLSX.utils.json_to_sheet(rows, { cellDates: true, header: COL_ORDER });
wb.Sheets['books'] = newWs;
XLSX.writeFile(wb, BOOKS_PATH, { cellDates: true });

// ── Summary ───────────────────────────────────────────────────────────────────
console.log('');
if (finishedBooks.length) {
	console.log(`✓ Finished (now read):`);
	finishedBooks.forEach(({ csvRow }) => {
		const date = toIso(csvRow['Date Read']);
		console.log(`    ${csvRow['Title']}${date ? ` — ${date}` : ''}`);
	});
}
if (newReads.length) {
	console.log(`✓ New reads added:`);
	newReads.forEach(r => {
		const date = toIso(r['Date Read']);
		console.log(`    ${r['Title']} (${r['Author']})${date ? ` — ${date}` : ''}`);
	});
}
if (newCurrent.length) {
	console.log(`✓ Now reading:`);
	newCurrent.forEach(r => console.log(`    ${r['Title']} (${r['Author']})`));
}
if (titleFallbacks.length) {
	console.log(`\nℹ Matched by title (Goodreads reassigned their IDs):`);
	titleFallbacks.forEach(t => console.log(`    ${t}`));
}

console.log(`\n→ Open book-analysis/website-books.xlsx and fill in Genre A, Genres,`);
console.log(`  Gender, Country for any new rows, then close the file and run:`);
console.log(`  npm run shelf`);
