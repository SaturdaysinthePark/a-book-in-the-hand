import { readFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { globSync } from 'tinyglobby';

// Source of truth for the newsletter archive. Issues are the same standalone email HTML
// documents we paste into Plunk, saved at newsletter/issues/YYYY-MM.html. The web archive
// (the "Past issues" list on /newsletter + each /newsletter/NN.html page) is derived from
// them at build time, so adding a new issue file is the only step — the number, list row,
// and page all follow automatically. Numbers are assigned by date order (01 = oldest).

const ISSUES_DIR = fileURLToPath(new URL('../../newsletter/issues/', import.meta.url));

export interface Newsletter {
	/** Zero-padded sequence by date order, e.g. "01". Drives the URL. */
	num: string;
	/** Filename stem, e.g. "2026-07". */
	id: string;
	date: Date;
	/** Human month + year, e.g. "July 2026". */
	label: string;
	/** The issue's <h1> headline. */
	title: string;
	/** The hidden preheader line. */
	description: string;
	/** Permalink, e.g. "/newsletter/01.html". */
	href: string;
}

// Decode the handful of entities our issue templates actually use + drop tags/whitespace.
function clean(html: string): string {
	return html
		.replace(/<[^>]+>/g, '')
		.replace(/&zwnj;|&nbsp;/g, ' ')
		.replace(/&amp;/g, '&')
		.replace(/&#8217;|&rsquo;/g, '’')
		.replace(/&#8230;|&hellip;/g, '…')
		.replace(/\s+/g, ' ')
		.trim();
}

function extract(raw: string): { title: string; description: string } {
	const h1 = raw.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i);
	const pre = raw.match(/<span[^>]*display:\s*none[\s\S]*?>([\s\S]*?)<\/span>/i);
	return {
		title: h1 ? clean(h1[1]) : '',
		// The preheader is padded with invisible &zwnj; spacers; keep only the real text.
		description: pre ? clean(pre[1].split('&zwnj;')[0]) : '',
	};
}

let cache: Newsletter[] | null = null;

// Chronological (oldest → newest); this is what fixes each issue's number.
function build(): Newsletter[] {
	if (cache) return cache;
	const files = globSync('*.html', { cwd: ISSUES_DIR, absolute: true }).sort();
	cache = files.map((file, i) => {
		const id = basename(file, '.html');
		const { title, description } = extract(readFileSync(file, 'utf8'));
		const date = new Date(`${id}-01T00:00:00Z`);
		const label = Number.isNaN(date.valueOf())
			? id
			: date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
		const num = String(i + 1).padStart(2, '0');
		return { num, id, date, label, title, description, href: `/newsletter/${num}.html` };
	});
	return cache;
}

/** All issues, newest first — for the "Past issues" list. */
export function getNewsletters(): Newsletter[] {
	return build().slice().reverse();
}

/** All issues in the order their numbers are assigned — for getStaticPaths. */
export function getNewslettersChrono(): Newsletter[] {
	return build();
}

/** Raw HTML for a given issue number, e.g. "01". */
export function readNewsletterRawByNum(num: string): string {
	const match = build().find((n) => n.num === num);
	if (!match) throw new Error(`No newsletter issue #${num}`);
	return readFileSync(join(ISSUES_DIR, `${match.id}.html`), 'utf8');
}
