# Filter the shelf by country

## Goal

Let readers browse the bookshelf by the author's country, and let a click on a
country in `/stats` jump straight into that country's books on `/book-reviews`.

Two connected additions:

1. A **Country filter** on `/book-reviews` — a searchable combobox like the
   existing Author/Genre ones, plus a `?country=` URL param like the existing
   `?author=` / `?subgenre=` params.
2. **Clickable flag cards** on `/stats` — the "Top 16 countries" cards become
   links into the country-filtered shelf, and get a mobile layout fix.

## Context — what already exists

- `country` is present on **668 of 669** books in `src/data/shelf.json` (46
  distinct countries: United States 343 … down to single-book countries). The
  one book without a country simply won't participate in any country view.
- `src/utils/stats.ts` already produces `countryStats` as
  `{ country, books, isoCode }[]`; `/stats` renders the top 16 as a flag grid
  and a world-map choropleth. Neither is interactive today.
- `src/pages/book-reviews/index.astro` already has a mature client-side filter
  system: cards carry `data-*` attributes, `applyFilters()` toggles `is-hidden`,
  and URL params (`?author=`, `?subgenre=`, `?category=`, `?rating=`, `?status=`)
  pre-apply filters on load. Deep-links to author/genre call `forceShelf()`,
  which flips the Reviewed/Entire-Shelf toggle to "Entire Shelf" so coming-soon
  books also show.
- `country` is **not** currently on `ShelfCard`, not rendered as a
  `data-country` attribute, and not a filter control.

So this feature is wiring `country` through the two pages. No data-pipeline
changes.

## Scope decisions (agreed)

- **Stats entry point: flag cards only.** The 16 top-country cards become links.
  The long tail (30 smaller countries) stays reachable via the new Country combo
  on the shelf. The world map is **not** made clickable.
- **Mobile flag-card layout: flag + count on row 1, name on row 2, centered.**

## Part 1 — Country filter on the shelf

### `src/utils/shelf.ts`

- Add `country: string` to the `ShelfCard` interface.
- In `buildShelf()`, populate it:
  - Path 1 (every read book from the shelf): `country: b.country || ''`.
  - Path 2 (live review not on the read shelf, rare): `country: ''` — no country
    data is available there; these cards never match a country filter. Acceptable
    given how rare path-2 cards are.

### `src/pages/book-reviews/index.astro` — build-time

- Build the country list for the combobox:
  `const countries = [...new Set(cards.map(c => c.country).filter(Boolean))].sort();`
  (~46 entries, alphabetical).
- Render `data-country={card.country}` on both the grid card element and the
  list-view row element, alongside the existing `data-author` etc.
- Add a **Country combobox** in `#fb-controls`, cloning the Author combobox
  markup exactly (button pill + searchable popover listbox), placed immediately
  after the Author combo (both are "who/where" filters). Option markup:
  `<button class="fb-combo-opt" role="option" data-country={c}>…</button>`.
  Give the combo/pop/list/value the ids `country-combo`, `country-combo-btn`,
  `country-combo-pop`, `country-combo-list`, `country-combo-value`.

### `src/pages/book-reviews/index.astro` — page script

- Add `let activeCountry = '';` to the filter state.
- Generalize `setupCombo()` to recognize country options. Two spots resolve an
  option's value today via `opt.dataset.author || opt.dataset.tag || opt.dataset.subgenre`
  (inside `select()`'s option-matching loop, and inside the list click handler).
  Add `|| opt.dataset.country` in both.
- Wire the country combobox through `setupCombo()` (same as author/subgenre),
  with `onSelect(val => { activeCountry = val; applyFilters(); })` and track type
  `'country'`. Keep the returned `select` api as `countryApi`.
- Extend `applyFilters()` with, after the author check:
  ```js
  if (show && activeCountry) show = (item.dataset.country || '') === activeCountry;
  ```
- Extend `updateSheetBadge()` to increment `n` when `activeCountry !== ''`.
- Extend the URL-param preselect block:
  ```js
  const paramCountry = params.get('country');
  if (paramCountry && countryApi) { countryApi.select(paramCountry); forceShelf(); }
  ```
  `params.get('country')` auto-decodes, so `?country=United%20States` arrives as
  `"United States"` and matches `data-country="United States"` exactly.
- Extend `sheetReset` to call `countryApi?.select('')`.

### Combobox value/case handling

Country values are Title Case with spaces ("United States", "South Korea"),
exactly like author names, which the existing combo already handles. The combo's
display uses `val.charAt(0).toUpperCase() + val.slice(1)` (re-capitalizes an
already-capital first letter — harmless), and `select()` matches
`opt.dataset.country === val` exactly. No special-casing needed.

### Behavior note

Picking a country manually in the combo **respects the current
Reviewed/Entire-Shelf toggle** — identical to how the Author combo behaves today.
Only the **stats deep-link** auto-flips to Entire Shelf (via `forceShelf()`), so
"click India in stats" reliably shows every India book read, reviewed or not.

## Part 2 — Clickable flag cards on stats

### `src/pages/stats.astro` — markup

- Change each `.flag-card` from a `<div>` to:
  ```astro
  <a class="flag-card" href={`/book-reviews?country=${encodeURIComponent(c.country)}&status=all`}>
  ```
  Content (flag emoji, name, count) is unchanged.

### `src/pages/stats.astro` — link styling

- Add to `.flag-card`: `text-decoration: none; color: inherit; cursor: pointer;`
  and a subtle hover affordance (e.g. border-color shift / slight lift) so the
  card reads as tappable. Match the site's understated aesthetic; no new colors
  or fonts (site is Newsreader + Geist only).

### `src/pages/stats.astro` — mobile layout fix (≤540px)

Replace the current row layout (flag left / name / count right) with flag + count
centered on row one, name centered on row two, via flex ordering only — no DOM
change (DOM order stays flag-emoji, flag-name, flag-count):

```css
@media (max-width: 540px) {
  .flag-grid  { grid-template-columns: repeat(2, 1fr); gap: 8px; }
  .flag-card  { flex-direction: row; flex-wrap: wrap; justify-content: center;
                align-items: center; gap: 4px 8px; padding: 10px; text-align: center; }
  .flag-emoji { order: 1; font-size: 22px; }
  .flag-count { order: 2; font-size: 16px; }
  .flag-name  { order: 3; flex-basis: 100%; text-align: center; font-size: 11px; }
}
```

(Exact sizes/padding to be tuned during implementation; the ordering + `flex-basis: 100%`
on `.flag-name` is the mechanism that produces the two-row centered layout.)

## Files touched

- `src/utils/shelf.ts` — `ShelfCard.country` field + populate in `buildShelf()`.
- `src/pages/book-reviews/index.astro` — country combobox markup, `data-country`
  on cards, JS filter state + combo wiring + param preselect + reset + badge, and
  the `setupCombo()` generalization.
- `src/pages/stats.astro` — flag cards → links, link hover styles, mobile
  flag-card CSS.

No changes to `src/data/shelf.json`, `scripts/build-shelf.mjs`, or
`src/utils/stats.ts`.

## Edge cases

- The one book with no country → `data-country=""`, never matches a country
  filter, and isn't in any flag card. Correct.
- Coming-soon cards carry country from `shelf.json` (path 1), so they appear when
  a country deep-link flips to Entire Shelf. Correct — matches "books I read from
  that country."
- Path-2 cards (live review not on the read shelf) have `country=''` and are
  excluded from country filters. Acceptable given rarity.
- Long-tail countries (not in top 16) are unreachable from stats but reachable
  via the shelf combo — the agreed "flag cards only" tradeoff.

## Verification

- `npm run build` passes (TypeScript strict).
- `/book-reviews?country=India&status=all` shows India books (reviewed +
  coming-soon).
- The Country combo lists ~46 countries, filters the grid, counts toward the
  filter badge, and clears on Reset.
- On mobile the Country combo appears in the filter bottom sheet.
- `/stats` flag cards are links to the correct URLs and navigate through.
- On mobile (≤540px) the flag cards show flag + count on row one and the country
  name centered on row two.

## Out of scope

- Making the world-map choropleth clickable.
- Any change to how `country` is sourced or normalized in the data pipeline.
- Analytics for flag-card link clicks (may be added later as polish).
