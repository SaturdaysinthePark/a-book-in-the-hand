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

// Map: Book Id → genres to ADD (will not duplicate existing ones)
const GENRE_ADDITIONS = {
  // Metafiction
  '21527802': ['metafiction'],  // Pale Fire — Nabokov
  '426504':   ['metafiction'],  // Ficciones — Borges
  '374233':   ['metafiction'],  // If on a Winter's Night a Traveler — Calvino
  '5787':     ['metafiction'],  // The Aleph and Other Stories — Borges

  // Picaresque
  '48982796': ['picaresque'],   // The Posthumous Memoirs of Brás Cubas — Machado de Assis

  // Coming-of-age
  '231804':   ['coming-of-age'], // The Outsiders — Hinton
  '5148':     ['coming-of-age'], // A Separate Peace — Knowles
  '22628':    ['coming-of-age'], // The Perks of Being a Wallflower — Chbosky
  '57899793': ['coming-of-age'], // All My Rage — Tahir
  '5107':     ['coming-of-age'], // The Catcher in the Rye — Salinger
  '99561':    ['coming-of-age'], // Looking for Alaska — Green
  '35504431': ['coming-of-age'], // Turtles All the Way Down — Green
  '54438984': ['coming-of-age'], // How Do You Live? — Yoshino
  '50144':    ['coming-of-age'], // Kitchen — Yoshimoto

  // Cosmic horror
  '17934530': ['cosmic horror'], // Annihilation — VanderMeer

  // Absurdism
  '441870':   ['absurdism'],    // The Plague — Camus
  '49552':    ['absurdism'],    // The Stranger — Camus
  '4980':     ['absurdism'],    // Breakfast of Champions — Vonnegut
  '135479':   ['absurdism'],    // Cat's Cradle — Vonnegut
  '485894':   ['absurdism'],    // The Metamorphosis — Kafka
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
    console.log(`  skip  ${row['Title']} (already has: ${additions.join(', ')})`);
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
console.log(`✓ Wrote ${BOOKS_PATH}`);
console.log(`\nNow run:  npm run shelf`);
