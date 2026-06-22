export const SITE_TITLE = 'Saturdays in a Book';
export const SITE_DESCRIPTION = 'A reading log from Brooklyn — reviews, lists, and recommendations.';
// Homepage-only description: drives the link-preview gray strip + the homepage <meta
// description>. Kept separate from SITE_DESCRIPTION so the RSS feed and blog archive keep
// the neutral line (this one ends in a call-to-action).
export const HOME_DESCRIPTION = 'A reading log with book reviews and recommendations. Open to see my latest review and more!';

// Editorial notes for the home-page "Currently reading" band. The book itself (title,
// author, cover) is auto-synced from the Goodreads export into src/data/currently-reading.json
// — set the cover by pasting a `Cover URL` on that book's row in website-books.xlsx. Only the
// hand-written bits live here, keyed by Goodreads Book Id. Goodreads has no progress field, so
// `progress` is manual (e.g. 'p. 140' or '40%'). All fields optional; the band falls back to a
// neutral cover and no blurb when an id isn't listed.
export const CURRENTLY_READING_NOTES: Record<
  string,
  { blurb?: string; progress?: string; coverBg?: string; coverInk?: string; url?: string }
> = {
  // The Sword of the Lictor (The Book of the New Sun, #3) — Gene Wolfe
  '729728': {
    blurb: '',
    progress: '',
    coverBg: '#1e2d3a',
    coverInk: '#d8cdb8',
  },
};
