// goodreads-review-queue.mjs — build a paste-ready queue of reviews not yet posted
// to Goodreads. Run:
//   node scripts/goodreads-review-queue.mjs            # every unposted review
//   node scripts/goodreads-review-queue.mjs suspicion  # filter by title/goodreadsId
//
// Input:  data/goodreads_library_export.csv  (same export import-goodreads.mjs reads)
//         src/content/blog/**/*.md(x)        (live reviews)
// Output: book-analysis/goodreads-review-queue.md (gitignored, regenerated each run)
//
// A book qualifies when it's a live review (status: live, postType: review) with a
// goodreadsId whose Goodreads CSV row has an empty "My Review" field. This script
// never writes to the CSV or xlsx — it's read-only against site content + the export.
//
// Body markdown is converted to Goodreads' supported HTML subset (bold/italic,
// blockquote, links, paragraphs) rather than stripped to plain text — see
// https://www.goodreads.com help text: <b> <i> <u> <s> <p> <pre> <blockquote> <a href>
// <img> <spoiler> are all supported, and bare URLs auto-link.

import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const XLSX = require('xlsx');

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const CONTENT_DIR = join(ROOT, 'src', 'content', 'blog');
const CSV_PATH = join(ROOT, 'data', 'goodreads_library_export.csv');
const OUT_PATH = join(ROOT, 'book-analysis', 'goodreads-review-queue.md');

const SITE_URL = 'https://saturdaysinabook.com';
const footerHtml = (postUrl) =>
	`<p><a href="${postUrl}">Originally posted on Saturdays in a Book</a> · <a href="${SITE_URL}/book-reviews/">all my reviews</a></p>`;

const filterArg = (process.argv[2] || '').trim().toLowerCase();

// ── Guards ───────────────────────────────────────────────────────────────────
if (!existsSync(CSV_PATH)) {
	console.error(`✗ CSV not found: ${CSV_PATH}`);
	console.error('  Place your Goodreads export there and re-run.');
	process.exit(1);
}

// ── Load Goodreads CSV → Map<Book Id, row> ──────────────────────────────────
const csvWb = XLSX.readFile(CSV_PATH, { cellDates: true });
const csvRows = XLSX.utils.sheet_to_json(csvWb.Sheets[csvWb.SheetNames[0]], { defval: '' });
const csvById = new Map(csvRows.map((r) => [String(r['Book Id'] || '').trim(), r]));

// ── Scan live reviews ────────────────────────────────────────────────────────
function walk(dir, out = []) {
	for (const name of readdirSync(dir)) {
		const p = join(dir, name);
		if (statSync(p).isDirectory()) walk(p, out);
		else if (/\.(md|mdx)$/.test(name)) out.push(p);
	}
	return out;
}

function parsePost(path) {
	const text = readFileSync(path, 'utf8');
	const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
	if (!m) return null;
	const fm = m[1];
	const body = m[2] || '';
	const field = (name) => {
		const r = fm.match(new RegExp(`^${name}:\\s*['"]?(.*?)['"]?\\s*$`, 'm'));
		return r ? r[1].trim() : '';
	};
	const status = field('status') || 'live';
	const postType = field('postType');
	const goodreadsId = field('goodreadsId');
	if (status !== 'live' || postType !== 'review' || !goodreadsId) return null;
	return {
		path,
		goodreadsId,
		title: field('bookTitle') || field('title'),
		author: field('author'),
		rating: parseInt(field('rating'), 10) || null,
		pubDate: field('pubDate'),
		body,
	};
}

const posts = existsSync(CONTENT_DIR) ? walk(CONTENT_DIR).map(parsePost).filter(Boolean) : [];

// ── Build the queue: live reviews with an empty "My Review" on Goodreads ───────
let queue = posts.filter((p) => {
	const row = csvById.get(p.goodreadsId);
	return row && !String(row['My Review'] || '').trim();
});

if (filterArg) {
	queue = queue.filter(
		(p) => p.title.toLowerCase().includes(filterArg) || p.goodreadsId === filterArg
	);
}

queue.sort((a, b) => a.pubDate.localeCompare(b.pubDate));

// ── Markdown body → Goodreads HTML subset ───────────────────────────────────
function escapeHtml(s) {
	return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function resolveUrl(url) {
	return url.startsWith('/') ? `${SITE_URL}${url}` : url;
}

function inlineFormat(escaped) {
	return escaped
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_, text, url) => `<a href="${resolveUrl(url)}">${text}</a>`)
		.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
		.replace(/__([^_]+)__/g, '<b>$1</b>')
		.replace(/\*([^*\n]+)\*/g, '<i>$1</i>')
		.replace(/(?<!\w)_([^_\n]+)_(?!\w)/g, '<i>$1</i>');
}

function formatLine(text) {
	return inlineFormat(escapeHtml(text));
}

// Goodreads has no <h1-6>/<ul>/<li> support, so each line is classified and
// re-rendered as its own <p>: headers become bold lines, bullet/numbered list
// items become their own line (bulleted with •, or number kept as typed). A
// block can mix prose with a header or list under it (no blank line between an
// intro sentence and what follows), so this groups consecutive lines of the
// same kind rather than judging the whole block at once.
function classifyLine(line) {
	if (/^#{1,6}\s+\S/.test(line)) return { kind: 'header', text: line.replace(/^#{1,6}\s+/, '') };
	if (/^[-*]\s+\S/.test(line)) return { kind: 'bullet', text: line.replace(/^[-*]\s+/, '') };
	if (/^\d+\.\s+\S/.test(line)) return { kind: 'numbered', text: line };
	return { kind: 'prose', text: line };
}

function blockToParagraphs(lines) {
	const paragraphs = [];
	let run = [];
	let runKind = null;
	const flush = () => {
		if (!run.length) return;
		if (runKind === 'header') {
			for (const text of run) paragraphs.push(`<p><b>${formatLine(text)}</b></p>`);
		} else if (runKind === 'bullet') {
			for (const text of run) paragraphs.push(`<p>• ${formatLine(text)}</p>`);
		} else if (runKind === 'numbered') {
			for (const text of run) paragraphs.push(`<p>${formatLine(text)}</p>`);
		} else {
			paragraphs.push(`<p>${formatLine(run.join(' '))}</p>`);
		}
		run = [];
	};
	for (const line of lines) {
		const { kind, text } = classifyLine(line);
		if (kind !== runKind) {
			flush();
			runKind = kind;
		}
		run.push(text);
	}
	flush();
	return paragraphs;
}

function postUrlFor(path) {
	const rel = path.slice(CONTENT_DIR.length + 1).replace(/\.(md|mdx)$/, '');
	return `${SITE_URL}/blog/${rel}/`;
}

function bodyToHtml(body, postUrl) {
	const blocks = body.trim().split(/\n{2,}/).filter(Boolean);
	const html = blocks.flatMap((block) => {
		const lines = block.split('\n').map((l) => l.trim()).filter(Boolean);
		const isBlockquote = lines.every((l) => l.startsWith('>'));
		if (isBlockquote) {
			const inner = formatLine(lines.map((l) => l.replace(/^>\s?/, '')).join(' '));
			return [`<blockquote>${inner}</blockquote>`];
		}
		return blockToParagraphs(lines);
	});
	html.push(footerHtml(postUrl));
	// Join with NO newlines: Goodreads converts raw newlines to <br> on top of
	// rendering the tags, which doubles the spacing between paragraphs.
	return html.join('');
}

// ── Write output ─────────────────────────────────────────────────────────────
const sections = queue.map((p) => {
	const stars = p.rating ? `${p.rating}★` : 'unrated';
	return [
		`## ${p.title} — ${p.author} (rating ${stars})`,
		`Goodreads: https://www.goodreads.com/book/show/${p.goodreadsId}`,
		'',
		bodyToHtml(p.body, postUrlFor(p.path)),
		'',
		'---',
	].join('\n');
});

const header = `<!-- Regenerated each run by \`node scripts/goodreads-review-queue.mjs\`. Not committed. -->\n<!-- ${queue.length} review(s) queued. Paste each HTML block into that book's Goodreads review box. -->\n\n`;

writeFileSync(OUT_PATH, header + sections.join('\n\n') + '\n', 'utf8');

console.log(`✓ ${queue.length} review(s) queued → book-analysis/goodreads-review-queue.md`);
if (filterArg && queue.length === 0) {
	console.log(`  No unposted review matched "${filterArg}".`);
}
