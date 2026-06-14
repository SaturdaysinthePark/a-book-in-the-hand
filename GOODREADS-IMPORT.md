# Goodreads import — how it works

This is the playbook for syncing your Goodreads reading history into the site.

---

## The workflow (every time)

1. **Export from Goodreads** — go to Goodreads → Account → Import and Export → Export Library. Save the file as `data/goodreads_library_export.csv` (overwrite the previous one).

2. **Run the import script** — close `website-books.xlsx` first, then:
   ```bash
   node scripts/import-goodreads.mjs
   ```
   The script prints exactly what it changed — new reads, books you finished, new currently-reading. If nothing changed it says so and exits.

3. **Fill in your custom columns** — open `book-analysis/website-books.xlsx` and fill in the blank columns for any new books:
   - **Genre A** — `Fiction` or `Non-Fiction`
   - **Genres** — comma-separated subgenres, e.g. `Literary Fiction, Historical Fiction` (see the `genre-reference` sheet for your existing vocabulary)
   - **Gender** — `Male` or `Female`
   - **Country** — author's country of origin

4. **Regenerate the site data** — close the file, then:
   ```bash
   npm run shelf
   ```
   This writes `src/data/shelf.json` and `src/data/currently-reading.json`, which the site builds from.

---

## What the import script detects

| Situation | What it does |
|-----------|-------------|
| Book in CSV as `read`, not in xlsx | Adds a new row |
| Book in CSV as `currently-reading`, not in xlsx | Adds it as currently-reading |
| Book in xlsx as `currently-reading`, now `read` in CSV | Updates its shelf status and fills in Date Read |
| `to-read` books | Ignored |

Matching works by **Goodreads Book Id** first, then falls back to **title** if the ID isn't found. Goodreads occasionally reassigns IDs when merging duplicate entries — the script handles this silently and tells you when it happened.

---

## The spreadsheet structure

`book-analysis/website-books.xlsx` has two sheets:

**`books`** — one row per book. Columns are split into two sections:

| Columns | Source | Description |
|---------|--------|-------------|
| A–W (23 cols) | Goodreads | Locked to the exact Goodreads CSV export order. Never rearrange these. |
| X–AC (6 cols) | You | `Gender`, `Genre A`, `Genres`, `Country`, `Cover URL`, `Cover Source` |

The Goodreads columns (A–W) are: Book Id · Title · Author · Author l-f · Additional Authors · ISBN · ISBN13 · My Rating · Publisher · Binding · Number of Pages · Year Published · Original Publication Year · **Date Read** · Date Added · Bookshelves · Bookshelves with positions · **Exclusive Shelf** · My Review · Spoiler · Private Notes · Read Count · Owned Copies

**`genre-reference`** — a sorted list of every subgenre you've used. Copy/paste from here to keep Genres consistent.

---

## Gotchas

- **Close the xlsx before running any script** — the scripts overwrite the file and will fail or corrupt it if Excel has it locked.
- **`Cover URL` and `Cover Source`** are managed by `npm run shelf` — don't fill them in manually unless you want to override the auto-resolved cover (see `COVERS.md`).
- **Ratings in the xlsx** — the import script copies `My Rating` from Goodreads for new books only. It never overwrites your existing ratings.
- **Re-reads** — Goodreads tracks re-reads as separate `Bookshelves` year entries (e.g. `2014, 2025`). The site deduplicates by Book Id and uses the most recent date.

---

## Command reference

```bash
node scripts/import-goodreads.mjs   # import latest Goodreads export
npm run shelf                        # regenerate shelf.json + currently-reading.json
npm run shelf -- --refresh           # re-resolve ALL covers from scratch (slow)
npm run build                        # full site build
npm run dev                          # local dev server at localhost:4321
```

---

## Script inventory

| Script | Purpose |
|--------|---------|
| `scripts/import-goodreads.mjs` | **Use this one.** Syncs Goodreads CSV → xlsx. |
| `scripts/build-shelf.mjs` | Run via `npm run shelf`. Reads xlsx, resolves covers, writes shelf.json. |
| `scripts/refresh-read-years.mjs` | Utility used internally by build-shelf. |
