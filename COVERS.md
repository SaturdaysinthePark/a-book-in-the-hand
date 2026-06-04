# Bookshelf covers & data — how it works

The `/book-reviews` page shows **every book you've read** (not just the ones with written
reviews). Its data and book covers come from one spreadsheet you control. This doc is the
playbook for updating covers without scrambling.

## TL;DR — routine cover update

1. Open **`book-analysis/website-books.xlsx`** (sheet `books`).
2. Paste an image URL into the **`Cover URL`** cell of any book you want to set/change.
   (You don't need to touch `Cover Source` — the script figures that out.)
3. **Save and close** the file.
4. Run:
   ```bash
   npm run shelf      # reads the sheet, resolves covers, writes data
   npm run build      # rebuilds the site
   ```
   The shelf step prints a summary like `Cover sources → Review: 90 · Claude: 3 · Mine: 556 · None: 0`.

That's it. Close the file before step 4 — the script rewrites it.

## The two cover columns

The script manages exactly two columns in the sheet; everything else is yours.

| Column | Who fills it | Meaning |
| --- | --- | --- |
| **`Cover URL`** | you (or the script) | the cover image URL actually used |
| **`Cover Source`** | the script | where that URL came from (below) |

`Cover Source` values:

- **`Mine`** — you pasted/edited the URL in the sheet. Wins for non-reviewed books. Sticky until you blank the cell.
- **`Review`** — the book has a published review; the cover is the review's `.md` `heroImage`. **Edit the `.md` to change it** (see below) — edits to these rows in the sheet are reverted on the next run.
- **`Claude`** — auto-resolved from OpenLibrary (by ISBN, then a title+author search).
- **`None`** — nothing found; the book shows a procedural colored tile. Fill in a `Cover URL` to fix.

You don't have to type `Mine` yourself — the script detects that you changed a `Cover URL`
cell and labels it `Mine` automatically.

## Where to get a cover URL

Open the book on Amazon / Goodreads / Wikipedia / the publisher, right-click the cover
image → **Copy Image Address**, paste into `Cover URL`. (Most of the current covers are
`m.media-amazon.com` links.)

## Changing a cover for a **reviewed** book

Reviewed books show their cover in two places — the shelf card *and* the review page — and
the review page reads it from the markdown. So change it at the source:

1. Find the review file under `src/content/blog/YYYY/MM/DD/<slug>.md`.
2. Edit the `heroImage:` line in its frontmatter to the new URL.
3. `npm run shelf` && `npm run build`. The sheet's `Cover URL`/`Cover Source` update to match.

## Adding new books / pulling in analysis-workbook changes

The site reads **only** `website-books.xlsx`, never your big analysis workbook directly. When
you've added or edited books in `book-analysis/Sabtain 2015-20XX analysis of books read.xlsx`
(the `modified export` sheet) and want them on the site:

```bash
npm run shelf -- --reseed
```

This rebuilds `website-books.xlsx` from the analysis workbook **while preserving your `Mine`
covers** (matched by Book Id). Then `npm run build`.

## Files involved

| Path | What it is |
| --- | --- |
| `book-analysis/website-books.xlsx` | **Source of truth.** You edit `Cover URL` here. |
| `book-analysis/website-books.backup.xlsx` | Auto-backup written before each run. |
| `book-analysis/.covers-state.json` | Hidden: lets the script tell your edits from its own + caches OpenLibrary lookups. Don't edit. |
| `book-analysis/Sabtain 2015-20XX analysis of books read.xlsx` | Your analysis workbook. Read **only** on first run / `--reseed`. |
| `scripts/build-shelf.mjs` | The generator (`npm run shelf`). |
| `src/data/shelf.json` | Committed output the site builds from. |
| `src/utils/shelf.ts`, `src/pages/book-reviews/index.astro` | Page that renders the shelf. |

## Command reference

```bash
npm run shelf              # normal: read sheet, resolve missing covers, write shelf.json + sheet
npm run shelf -- --reseed  # rebuild the sheet from the analysis workbook (keeps your Mine covers)
npm run shelf -- --refresh # ignore the cache and re-resolve every auto cover from scratch (slow)
npm run build              # rebuild the site
```

## Gotchas

- **Close the spreadsheet before `npm run shelf`** — it overwrites the file each run.
- **Keep the sheet as plain data** — the rewrite strips cell formatting (colors, etc.).
- **`✗ xlsx not found`**: the analysis workbook filename carries a year range that gets bumped
  over time (e.g. `2015-2025` → `2015-2026`). Update `ANALYSIS_PATH` near the top of
  `scripts/build-shelf.mjs` to the new filename.
- **A cover looks wrong / want to redo all auto covers**: `npm run shelf -- --refresh`.
- **Re-reads** (e.g. Harry Potter ×7) are one book/one card; set the cover on any of its rows.
