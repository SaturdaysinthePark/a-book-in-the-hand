// add-genres.mjs — one-shot: appends missing genres to website-books.xlsx
// Run:  node scripts/add-genres.mjs
// Then: npm run shelf

import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BOOKS_PATH = join(ROOT, 'book-analysis', 'website-books.xlsx');
const BACKUP_PATH = join(ROOT, 'book-analysis', 'website-books.backup.xlsx');
const SHEET = 'books';

const GENRE_ADDITIONS = {
  '48982796': ['metafiction'],              // The Posthumous Memoirs of Brás Cubas
  '4981':     ['metafiction'],              // Slaughterhouse-Five
  '4980':     ['metafiction'],              // Breakfast of Champions (already: absurdism)
  '24733341': ['autofiction', 'metafiction'], // Suite for Barbara Loden
  '119073':   ['metafiction'],              // The Name of the Rose
  '78433':    ['metafiction'],              // The Blind Assassin
  '9809':     ['metafiction'],              // Invisible Cities
  '2794':     ['metafiction'],              // The Crying of Lot 49
  '4953':     ['autofiction', 'metafiction'], // A Heartbreaking Work of Staggering Genius
  '605573':   ['metafiction'],              // Midnight's Children
  '18839':    ['metafiction'],              // Orlando
};

const wb = XLSX.readFile(BOOKS_PATH, { cellDates: true });
const ws = wb.Sheets[SHEET];
if (!ws) { console.error(`Sheet "${SHEET}" not found`); process.exit(1); }

const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });

let changed = 0;
for (const row of rows) {
  const id = String(row['Book Id'] || '').trim();
  const additions = GENRE_ADDITIONS[id];
  if (!additions) continue;

  const existing = String(row['Genres'] || '').split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  const toAdd = additions.filter(g => !existing.includes(g));
  if (!toAdd.length) {
    console.log(`  skip  ${row['Title']} (already has all)`);
    continue;
  }

  row['Genres'] = [...existing, ...toAdd].join(', ');
  console.log(`  +[${toAdd.join(', ')}]  ${row['Title']}`);
  changed++;
}

console.log(`\n${changed} books updated.`);

if (existsSync(BOOKS_PATH)) copyFileSync(BOOKS_PATH, BACKUP_PATH);
const header = Object.keys(rows[0] || {});
const newWs = XLSX.utils.json_to_sheet(rows, { header, cellDates: true });
wb.Sheets[SHEET] = newWs;
XLSX.writeFile(wb, BOOKS_PATH, { cellDates: true });
console.log('✓ Wrote', BOOKS_PATH);
console.log('\nNow run:  npm run shelf');
