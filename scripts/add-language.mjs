// add-language.mjs — fills the Language column in website-books.xlsx with the
// original language each book was written in.
//
// Methodology: author → primary writing language. Default for any unmapped
// author: 'English'. Run with --force to overwrite existing values.
//
// Usage:  node scripts/add-language.mjs [--force]
// After:  npm run shelf

import { existsSync, copyFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const BOOKS_PATH = join(ROOT, 'book-analysis', 'website-books.xlsx');
const BOOKS_BACKUP_PATH = join(ROOT, 'book-analysis', 'website-books.backup.xlsx');
const BOOKS_SHEET = 'books';
const FORCE = process.argv.includes('--force');

// Author → language they primarily wrote in (for all books on this shelf).
// Omitted authors default to 'English'.
const LANGUAGES = {
  // Japanese
  'Banana Yoshimoto': 'Japanese',
  'Genzaburo Yoshino': 'Japanese',
  'Haruki Murakami': 'Japanese',
  'Hiroko Oyamada': 'Japanese',
  'Ichiro Kishimi': 'Japanese',
  'Mieko Kawakami': 'Japanese',
  'Mizuki Tsujimura': 'Japanese',
  'Murasaki Shikibu': 'Japanese',
  'Osamu Dazai': 'Japanese',
  'Ryūnosuke Akutagawa': 'Japanese',
  'Seishi Yokomizo': 'Japanese',
  'Yōko Ogawa': 'Japanese',
  'Yū Miri': 'Japanese',
  'Yukio Mishima': 'Japanese',
  'Ō no Yasumaro': 'Japanese',

  // Russian
  'Arkady Strugatsky': 'Russian',
  'Fyodor Dostoyevsky': 'Russian',
  'Leo Tolstoy': 'Russian',
  'Mikhail Bulgakov': 'Russian',
  'Mikhail Lermontov': 'Russian',
  'Nikolai Gogol': 'Russian',
  'Vladimir Nabokov': 'Russian',

  // French
  'Albert Camus': 'French',
  'Alexandre Dumas': 'French',
  'Colette': 'French',
  'Gustave Flaubert': 'French',
  'Honoré de Balzac': 'French',
  'Marcel Proust': 'French',
  'Nathalie Léger': 'French',
  'Antoine de Saint-Exup√©ry': 'French',
  'Antoine de Saint-Exupéry': 'French',
  'Georges Perec': 'French',
  'Henry Dunant': 'French',
  'Voltaire': 'French',
  'Émile Zola': 'French',

  // Spanish
  'Andrzej Sapkowski': 'Polish', // moved to Polish below
  'Carlos Ruiz Zaf√≥n': 'Spanish',
  'Carlos Ruiz Zafón': 'Spanish',
  'Daniel Saldaña París': 'Spanish',
  'Ernesto Che Guevara': 'Spanish',
  'Gabriel García Márquez': 'Spanish',
  'Gabriel Garc√≠a M√°rquez': 'Spanish',
  'Isabel Allende': 'Spanish',
  'Jorge Luis Borges': 'Spanish',
  'Miguel Ángel Asturias': 'Spanish',
  'Mar√≠a Due√±as': 'Spanish',
  'María Dueñas': 'Spanish',
  'Roberto Bolaño': 'Spanish',
  'The Shadow of the Wind': 'Spanish', // not an author but safety

  // German
  'Franz Kafka': 'German',
  'Hermann Hesse': 'German',
  'Patrick S√ºskind': 'German',
  'Patrick Süskind': 'German',
  'Stefan Zweig': 'German',
  'Thomas Bernhard': 'German',

  // Italian
  'Dante Alighieri': 'Italian',
  'Dino Buzzati': 'Italian',
  'Elena Ferrante': 'Italian',
  'Italo Calvino': 'Italian',
  'Natalia Ginzburg': 'Italian',
  'Umberto Eco': 'Italian',

  // Polish
  'Jerzy Kosiński': 'Polish',
  'Olga Tokarczuk': 'Polish',

  // Ancient Greek
  'Apollonius of Rhodes': 'Ancient Greek',
  'Herodotus': 'Ancient Greek',
  'Homer': 'Ancient Greek',
  'Lucian of Samosata': 'Ancient Greek',
  'Nonnus of Panopolis': 'Ancient Greek',
  'Plato': 'Ancient Greek',
  'Quintus Smyrnaeus': 'Ancient Greek',
  'Thucydides': 'Ancient Greek',

  // Latin
  'Marcus Aurelius': 'Latin',
  'Ovid': 'Latin',
  'Virgil': 'Latin',

  // Arabic
  'Ghassan Kanafani': 'Arabic',
  'Naguib Mahfouz': 'Arabic',
  'Abu Hamid al-Ghazali': 'Arabic',

  // Persian
  'Attar of Nishapur': 'Persian',

  // Portuguese
  'Clarice Lispector': 'Portuguese',
  'Machado de Assis': 'Portuguese',
  'Paulo Coelho': 'Portuguese',

  // Swedish
  'Fredrik Backman': 'Swedish',
  'Niklas Natt och Dag': 'Swedish',
  'Stieg Larsson': 'Swedish',

  // Chinese / Mandarin
  'Liu Cixin': 'Chinese',
  'Yan Ge': 'Chinese',
  'Yáng Shuāng-zǐ': 'Chinese',

  // Korean
  'Han Kang': 'Korean',

  // Hungarian
  'László Krasznahorkai': 'Hungarian',

  // Bosnian/Serbo-Croatian
  'Meša Selimović': 'Bosnian',

  // Turkish
  'Elif Shafak': 'Turkish',
  'Orhan Pamuk': 'Turkish',

  // Norwegian (none yet, placeholder)

  // Romanian (none yet)
};

// Correct Sapkowski after the accidental placement above
LANGUAGES['Andrzej Sapkowski'] = 'Polish';

function main() {
  if (!existsSync(BOOKS_PATH)) {
    console.error(`✗ Not found: ${BOOKS_PATH}`);
    process.exit(1);
  }

  const wb = XLSX.readFile(BOOKS_PATH, { cellDates: true });
  const ws = wb.Sheets[BOOKS_SHEET];
  if (!ws) {
    console.error(`✗ Sheet "${BOOKS_SHEET}" not found`);
    process.exit(1);
  }
  const rows = XLSX.utils.sheet_to_json(ws, { raw: true, defval: '' });
  console.log(`Read ${rows.length} rows${FORCE ? ' (force mode)' : ''}`);

  let filled = 0;
  let skipped = 0;

  for (const row of rows) {
    const existing = String(row['Language'] || '').trim();
    if (existing && !FORCE) { skipped++; continue; }

    const author = String(row['Author'] || '').trim();
    if (!author) continue;

    const lang = LANGUAGES[author] ?? 'English';
    if (!existing || existing !== lang) {
      row['Language'] = lang;
      filled++;
    } else {
      skipped++;
    }
  }

  console.log(`Filled: ${filled}  Already set: ${skipped}`);

  copyFileSync(BOOKS_PATH, BOOKS_BACKUP_PATH);

  const header = Object.keys(rows[0] || {});
  const newWs = XLSX.utils.json_to_sheet(rows, { header, cellDates: true });
  wb.Sheets[BOOKS_SHEET] = newWs;
  XLSX.writeFile(wb, BOOKS_PATH, { cellDates: true });
  console.log(`✓ Written to ${BOOKS_PATH}`);
  console.log('Next: npm run shelf');
}

main();
