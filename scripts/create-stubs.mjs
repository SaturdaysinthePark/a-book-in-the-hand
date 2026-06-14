/**
 * create-stubs.mjs
 * Creates draft stub blog posts for 2025/2026 books that don't have a post yet.
 * Run once: node scripts/create-stubs.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

// ── Collect existing goodreadsIds from blog posts ────────────────────────────
const existingGids = new Set();

function scanDir(dir) {
	if (!existsSync(dir)) return;
	for (const f of readdirSync(dir)) {
		const full = join(dir, f);
		if (statSync(full).isDirectory()) scanDir(full);
		else if (f.endsWith('.md') || f.endsWith('.mdx')) {
			const content = readFileSync(full, 'utf-8');
			const m = content.match(/goodreadsId:\s*['"]?(\d+)['"]?/);
			if (m) existingGids.add(m[1]);
		}
	}
}
scanDir(join(root, 'src/content/blog'));

// ── Shelf data ───────────────────────────────────────────────────────────────
const shelf = JSON.parse(readFileSync(join(root, 'src/data/shelf.json'), 'utf-8'));

// ── Helpers ──────────────────────────────────────────────────────────────────
function toSlug(title) {
	return title
		.replace(/\s*\([^)]*\)/g, '') // strip "(Series, #N)"
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/^-+|-+$/g, '');
}

function cleanTitle(title) {
	return title.replace(/\s*\([^)]*\)/g, '').trim();
}

function toTitleCase(s) {
	return s.replace(/\b\w/g, c => c.toUpperCase());
}

function toTagSlug(s) {
	return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

function escape(s) {
	return s.replace(/'/g, "\\'");
}

// ── Generate stubs ───────────────────────────────────────────────────────────
let created = 0;
let skipped = 0;

for (const book of shelf) {
	const year = new Date(book.dateRead).getFullYear();
	if (year !== 2025 && year !== 2026) continue;
	if (existingGids.has(book.goodreadsId)) {
		skipped++;
		continue;
	}

	const [yyyy, mm, dd] = book.dateRead.split('-');
	const slug = toSlug(book.title);
	const dir = join(root, 'src/content/blog', yyyy, mm, dd);
	const filePath = join(dir, `${slug}.md`);

	if (existsSync(filePath)) {
		console.log(`  skip (file exists): ${filePath}`);
		skipped++;
		continue;
	}

	const shortTitle = cleanTitle(book.title);
	const genre = book.subgenres?.[0] ? toTitleCase(book.subgenres[0]) : (book.category === 'nonfiction' ? 'Nonfiction' : 'Fiction');
	const tags = [
		...(book.subgenres || []).map(toTagSlug),
		String(yyyy),
	].filter(Boolean);

	const ratingLine = book.rating != null ? `rating: ${book.rating}\n` : '';
	const heroLine = book.coverUrl ? `heroImage: '${escape(book.coverUrl)}'\n` : '';

	const frontmatter = [
		`---`,
		`title: 'Review: ${escape(shortTitle)}'`,
		`description: 'My review of ${escape(shortTitle)} by ${escape(book.author)}.'`,
		`pubDate: ${book.dateRead}`,
		`bookTitle: '${escape(shortTitle)}'`,
		`author: '${escape(book.author)}'`,
		`genre: '${escape(genre)}'`,
		ratingLine.trimEnd(),
		`goodreadsId: '${book.goodreadsId}'`,
		heroLine.trimEnd(),
		`status: 'draft'`,
		`tags: [${tags.map(t => `'${t}'`).join(', ')}]`,
		`postType: 'review'`,
		`---`,
	].filter(l => l !== '').join('\n');

	const body = `\n*Review coming soon.*\n`;

	mkdirSync(dir, { recursive: true });
	writeFileSync(filePath, frontmatter + body, 'utf-8');
	console.log(`  created: src/content/blog/${yyyy}/${mm}/${dd}/${slug}.md`);
	created++;
}

console.log(`\nDone. Created ${created} stubs, skipped ${skipped} (already have posts).`);
