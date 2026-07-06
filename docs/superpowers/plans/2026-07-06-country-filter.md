# Country Filter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let readers filter `/book-reviews` by the author's country, and make the "Top 16 countries" flag cards on `/stats` link straight into that country's books.

**Architecture:** Wire the existing `country` field (already on every book in `src/data/shelf.json`) through two Astro pages. On the shelf, add a `data-country` attribute per card and a "Country" combobox that reuses the existing client-side filter machinery (the same `setupCombo()` + `applyFilters()` used for Author/Genre), plus a `?country=` URL param mirroring the existing `?author=` deep-link. On stats, turn the flag `<div>`s into `<a>` links and fix their mobile layout.

**Tech Stack:** Astro v5.11 (TypeScript strict), vanilla client-side JS in page `<script>` blocks, plain CSS. No test framework — verification is `npm run build` (type-checks + bundles) plus manual checks in `npm run dev` (localhost:4321).

## Global Constraints

- Astro v5.11, TypeScript strict mode — all code must type-check under `npm run build`.
- No new font families (site is Newsreader + Geist only); use existing CSS vars (`--paper`, `--rule`, `--viz-primary`, etc.).
- No em dashes or AI buzzwords in any user-facing copy.
- Do NOT modify `src/data/shelf.json`, `scripts/build-shelf.mjs`, or `src/utils/stats.ts`.
- Country matching mirrors the existing Author pattern: `data-country` is stored lowercased and compared against the active value lowercased.

---

### Task 1: Propagate `country` through the data layer and onto shelf cards

**Files:**
- Modify: `src/utils/shelf.ts` (`ShelfCard` interface + `buildShelf()`)
- Modify: `src/pages/book-reviews/index.astro` (build-time country list + `data-country` on grid and list cards)

**Interfaces:**
- Consumes: `ShelfBook.country?: string` (already on the interface, already populated from `shelf.json`).
- Produces: `ShelfCard.country: string`; a build-time `countries: string[]` (sorted, de-duped, Title Case) in the shelf page; every card element carries `data-country="<lowercased country>"`.

- [ ] **Step 1: Add `country` to the `ShelfCard` interface**

In `src/utils/shelf.ts`, in the `ShelfCard` interface, add the field after `classic`:

```ts
	category: 'fiction' | 'nonfiction' | ''; // from xlsx Genre A
	subgenres: string[]; // from xlsx Genre B + C, e.g. ['fantasy', 'mythology']
	classic: boolean; // from xlsx Classics? column
	country: string; // author's country of origin ('' if unknown)
}
```

- [ ] **Step 2: Populate `country` in both `buildShelf()` card paths**

In `src/utils/shelf.ts`, in the first `cards.push({ ... })` (the "every read book from the shelf" path), add after `classic: !!b.classic,`:

```ts
			category: (b.category === 'fiction' || b.category === 'nonfiction') ? b.category : '',
			subgenres: b.subgenres || [],
			classic: !!b.classic,
			country: b.country || '',
		});
```

In the second `cards.push({ ... })` (the "live reviews not on the read shelf" path), add after `classic: false,`:

```ts
			category: '',
			subgenres: [],
			classic: false,
			country: '',
		});
```

- [ ] **Step 3: Build the country list in the shelf page frontmatter**

In `src/pages/book-reviews/index.astro`, in the frontmatter after the `allSubgenres` line:

```ts
	// Subgenre list from shelf data, sorted alphabetically
	const subgenreSet = new Set<string>();
	cards.forEach(c => c.subgenres.forEach(s => subgenreSet.add(s)));
	const allSubgenres = [...subgenreSet].sort();

	// Country list for the filter combobox (whole shelf, reviewed or not)
	const countrySet = new Set<string>();
	cards.forEach(c => { if (c.country) countrySet.add(c.country); });
	const countries = [...countrySet].sort();
```

- [ ] **Step 4: Add `data-country` to the grid card element**

In `src/pages/book-reviews/index.astro`, in the **grid view** `<Tag>` opening tag, add `data-country` right after `data-author`:

```astro
											data-author={card.author.toLowerCase()}
											data-country={card.country.toLowerCase()}
											data-tags={card.tags.join('|').toLowerCase()}
```

- [ ] **Step 5: Add `data-country` to the list-view row element**

In `src/pages/book-reviews/index.astro`, in the **list view** `<Tag>` opening tag, add the same attribute after `data-author`:

```astro
											data-author={card.author.toLowerCase()}
											data-country={card.country.toLowerCase()}
											data-tags={card.tags.join('|').toLowerCase()}
```

- [ ] **Step 6: Build and verify the attribute renders**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

Then confirm cards carry the attribute in the built output:

Run: `grep -o 'data-country="[a-z ]*"' dist/book-reviews/index.html | sort | uniq -c | sort -rn | head`
Expected: multiple lines, e.g. `data-country="united states"`, `data-country="united kingdom"`, `data-country="japan"`, etc. (at least the top countries appear; total distinct ~46).

- [ ] **Step 7: Commit**

```bash
git add src/utils/shelf.ts src/pages/book-reviews/index.astro
git commit -m "feat: carry country onto shelf cards as data-country

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HmbiAAYYLqrgwexhWaLTBe"
```

---

### Task 2: Add the Country filter to the shelf (combobox, filter logic, badge, reset, URL param)

**Files:**
- Modify: `src/pages/book-reviews/index.astro` (combobox markup in `#fb-controls`; page `<script>`: `setupCombo` generalization, `activeCountry` state, `applyFilters`, `updateSheetBadge`, country combo wiring, `sheetReset`, URL-param preselect)

**Interfaces:**
- Consumes: `countries: string[]` and `data-country` from Task 1; the existing `setupCombo(...)` helper (returns `{ select: (v: string) => void }`), `applyFilters()`, `updateSheetBadge()`, `forceShelf()`.
- Produces: a working Country combobox with id `country-combo` (and `-btn`/`-pop`/`-list`/`-value`); `activeCountry` filter state; `?country=<name>` deep-link that also flips to Entire Shelf.

- [ ] **Step 1: Add the Country combobox markup after the Author combobox**

In `src/pages/book-reviews/index.astro`, immediately after the closing `</div>` of `#author-combo` (the author combobox block) and before the `<div class="fb-sheet-foot">` block, insert:

```astro
									<div class="fb-divider"></div>

									<div class="fb-combo" id="country-combo">
										<button class="fb-combo-btn" id="country-combo-btn" aria-haspopup="listbox" aria-expanded="false">
											<span class="fb-combo-pill">Country</span>
											<span class="fb-combo-value" id="country-combo-value">Any</span>
											<span class="fb-combo-x" aria-label="Clear country filter">×</span>
											<svg class="fb-combo-caret" width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.4">
												<path d="M2.5 4.5l3.5 3.5 3.5-3.5" stroke-linecap="round" stroke-linejoin="round"/>
											</svg>
										</button>
										<div class="fb-combo-pop" id="country-combo-pop" style="display:none" role="listbox">
											<div class="fb-combo-search-wrap">
												<svg width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.3"><circle cx="5.5" cy="5.5" r="3.5"/><line x1="8.2" y1="8.2" x2="11" y2="11" stroke-linecap="round"/></svg>
												<input class="fb-combo-search" type="text" placeholder="Search countries…" autocomplete="off" />
											</div>
											<div class="fb-combo-list" id="country-combo-list">
												{countries.map(c => (
													<button class="fb-combo-opt" role="option" data-country={c}>
														{c}
														<svg class="fb-combo-check" style="display:none" width="13" height="13" viewBox="0 0 13 13" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M2.5 6.5l3 3 5-5" stroke-linecap="round" stroke-linejoin="round"/></svg>
													</button>
												))}
											</div>
										</div>
									</div>
```

- [ ] **Step 2: Generalize `setupCombo()` to recognize country options**

In `src/pages/book-reviews/index.astro`'s `<script>`, inside `setupCombo()`'s `select()` function, extend the `isOn` line to include country:

```ts
				const isOn = opt.dataset.author === val || opt.dataset.tag === val || opt.dataset.subgenre === val || opt.dataset.country === val;
```

And in the same `setupCombo()`, inside the `listEl.addEventListener('click', ...)` handler, extend the value resolution:

```ts
				const val = opt.dataset.author || opt.dataset.tag || opt.dataset.subgenre || opt.dataset.country || '';
```

- [ ] **Step 3: Add `activeCountry` to the filter state**

In the `<script>`, in the filter-state block, add `activeCountry`:

```ts
		let activeGenre    = 'all';
		let activeStatus   = 'reviewed';
		let activeAuthor   = '';
		let activeSubgenre = '';
		let activeCountry  = '';
		let activeRating   = '';
		let currentView    = 'grid';
```

- [ ] **Step 4: Apply the country filter in `applyFilters()`**

In `applyFilters()`, add a country check immediately after the `activeAuthor` check:

```ts
				if (show && activeAuthor) {
					show = author === activeAuthor.toLowerCase();
				}

				if (show && activeCountry) {
					show = (item.dataset.country || '') === activeCountry.toLowerCase();
				}
```

- [ ] **Step 5: Count the country filter in `updateSheetBadge()`**

In `updateSheetBadge()`, add a line so an active country increments the badge:

```ts
			if (activeGenre !== 'all')      n++;
			if (activeSubgenre !== '')      n++;
			if (activeStatus !== 'reviewed') n++;
			if (activeAuthor !== '')        n++;
			if (activeCountry !== '')       n++;
```

- [ ] **Step 6: Wire up the country combobox**

In the `<script>`, immediately after the Subgenre combobox setup block (the `if (subgenreCombo) { ... }` block), add:

```ts
		// Country combobox
		const countryCombo  = document.getElementById('country-combo') as HTMLElement;
		const countryBtn    = document.getElementById('country-combo-btn') as HTMLButtonElement;
		const countryPop    = document.getElementById('country-combo-pop') as HTMLElement;
		const countryList   = document.getElementById('country-combo-list') as HTMLElement;
		const countryVal    = document.getElementById('country-combo-value') as HTMLElement;
		const countrySearch = countryPop?.querySelector<HTMLInputElement>('.fb-combo-search')!;
		let countryApi: { select: (v: string) => void } | null = null;
		if (countryCombo) {
			countryApi = setupCombo(countryCombo, countryBtn, countryPop, countryList, countryVal, countrySearch, val => {
				activeCountry = val;
				applyFilters();
			}, 'country');
		}
```

- [ ] **Step 7: Clear the country combo on Reset**

In the `sheetReset?.addEventListener('click', ...)` handler, add `countryApi?.select('')`:

```ts
		sheetReset?.addEventListener('click', () => {
			subgenreApi?.select('');
			authorApi?.select('');
			countryApi?.select('');
			document.querySelector<HTMLButtonElement>('#genre-seg .fb-seg-btn[data-genre="all"]')?.click();
			document.querySelector<HTMLButtonElement>('#status-seg .fb-seg-btn[data-status="reviewed"]')?.click();
			applyFilters();
		});
```

- [ ] **Step 8: Add the `?country=` URL-param preselect**

In the URL-param block, after the `paramSubgenre` handling line, add:

```ts
		if (paramSubgenre && subgenreApi) { subgenreApi.select(paramSubgenre.toLowerCase()); forceShelf(); }
		const paramCountry = params.get('country');
		if (paramCountry && countryApi) { countryApi.select(paramCountry); forceShelf(); }
```

- [ ] **Step 9: Build and verify types**

Run: `npm run build`
Expected: build succeeds (no TypeScript errors).

- [ ] **Step 10: Manual verification in the dev server**

Run: `npm run dev` (serves localhost:4321).

Verify each of these:
1. Open `http://localhost:4321/book-reviews`. Open the Filters, then the **Country** combo. Confirm it lists ~46 countries and the search box filters the list as you type.
2. Pick **Japan**. Confirm the grid narrows to Japan books and the "Viewing X / Y" count drops. Confirm the filter badge on the Filters button shows a count including country.
3. Click **Reset**. Confirm the country clears back to "Any" and the grid returns to the default reviewed set.
4. Open `http://localhost:4321/book-reviews?country=India`. Confirm it loads with the status flipped to **Entire Shelf**, the Country combo showing **India**, and only India books visible (reviewed and coming-soon).
5. On a narrow window (or devtools mobile emulation ≤720px), open the Filters bottom sheet and confirm the Country combo appears and works there too.

Expected: all five pass.

- [ ] **Step 11: Commit**

```bash
git add src/pages/book-reviews/index.astro
git commit -m "feat: add country filter + ?country= deep-link to the shelf

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HmbiAAYYLqrgwexhWaLTBe"
```

---

### Task 3: Make the stats flag cards clickable and fix their mobile layout

**Files:**
- Modify: `src/pages/stats.astro` (flag card `<div>` → `<a>`; `.flag-card` link styles + hover; `≤540px` mobile layout)

**Interfaces:**
- Consumes: `?country=` deep-link support from Task 2; `top16Countries` (already `{ country, books, isoCode }`), `toFlag()` (already defined in the frontmatter).
- Produces: each flag card is an `<a>` linking to `/book-reviews?country=<encoded>&status=all`, with hover affordance and a two-row centered mobile layout.

- [ ] **Step 1: Turn the flag cards into links**

In `src/pages/stats.astro`, in the "Top 16 countries" section, change the flag card element from a `<div>` to an `<a>`:

```astro
							<div class="flag-grid">
								{top16Countries.map(c => (
									<a class="flag-card" href={`/book-reviews?country=${encodeURIComponent(c.country)}&status=all`}>
										<span class="flag-emoji">{toFlag(c.isoCode)}</span>
										<span class="flag-name">{c.country}</span>
										<span class="flag-count">{c.books}</span>
									</a>
								))}
							</div>
```

- [ ] **Step 2: Add link reset + hover styles to `.flag-card`**

In `src/pages/stats.astro`'s `<style>`, replace the existing `.flag-card { ... }` rule (the base one, `display: flex; flex-direction: column; ...`) with this version and add the hover/reduced-motion rules right after it:

```css
.flag-card {
	display: flex;
	flex-direction: column;
	align-items: center;
	gap: 4px;
	padding: clamp(10px, 1.4vw, 16px) 8px;
	background: var(--paper);
	border: 1px solid var(--rule);
	border-radius: 4px;
	text-align: center;
	text-decoration: none;
	color: inherit;
	cursor: pointer;
	transition: border-color 160ms ease, transform 160ms ease, box-shadow 160ms ease;
}
.flag-card:hover {
	border-color: var(--viz-primary);
	transform: translateY(-2px);
	box-shadow: 0 8px 20px -14px rgba(0, 0, 0, 0.4);
}
@media (prefers-reduced-motion: reduce) {
	.flag-card { transition: none; }
	.flag-card:hover { transform: none; }
}
```

- [ ] **Step 3: Replace the `≤540px` mobile layout**

In `src/pages/stats.astro`'s `<style>`, replace the existing `@media (max-width: 540px) { ... }` block that styles `.flag-grid`/`.flag-card`/`.flag-emoji`/`.flag-name`/`.flag-count` with:

```css
@media (max-width: 540px) {
	/* Two-row card: flag + count centered on row 1, country name centered on row 2. */
	.flag-grid { grid-template-columns: repeat(2, 1fr); gap: 8px; }
	.flag-card { flex-direction: row; flex-wrap: wrap; justify-content: center; align-items: center; gap: 4px 10px; padding: 12px 10px; text-align: center; }
	.flag-emoji { order: 1; font-size: 22px; }
	.flag-count { order: 2; font-size: 16px; }
	.flag-name { order: 3; flex-basis: 100%; text-align: center; font-size: 11px; }
}
```

- [ ] **Step 4: Build and verify types**

Run: `npm run build`
Expected: build succeeds.

Then confirm the links rendered:

Run: `grep -o 'href="/book-reviews?country=[^"]*"' dist/stats/index.html | head`
Expected: lines like `href="/book-reviews?country=United%20States&amp;status=all"`, `href="/book-reviews?country=Japan&amp;status=all"`, etc. (Astro HTML-escapes the `&` as `&amp;` in the attribute — this is correct and the link works normally in the browser.)

- [ ] **Step 5: Manual verification in the dev server**

Run: `npm run dev` (if not already running).

Verify:
1. Open `http://localhost:4321/stats`, scroll to "Top 16 countries". Hover a card and confirm it shows the hover affordance (border/lift) and a link cursor.
2. Click **Japan**. Confirm it navigates to `/book-reviews?country=Japan&status=all` and lands on the shelf filtered to Japan (Entire Shelf, Country = Japan).
3. Narrow the window to ≤540px (or devtools mobile). Confirm each flag card shows the flag and count centered on the top row and the country name centered on the second row (matching the agreed layout).

Expected: all three pass.

- [ ] **Step 6: Commit**

```bash
git add src/pages/stats.astro
git commit -m "feat: link stats flag cards to country-filtered shelf, fix mobile layout

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01HmbiAAYYLqrgwexhWaLTBe"
```

---

## Notes for the implementer

- **Case handling:** `data-country` is lowercased (Task 1) and compared lowercased (Task 2, Step 4), mirroring the existing Author filter. Combo option `data-country` values and the `?country=` param stay Title Case for display/matching in `select()`; the stats links emit exact Title Case via `encodeURIComponent(c.country)`, so option-highlighting and filtering both line up.
- **Why the status flip:** most books from a given country are "coming soon", so a country deep-link calls `forceShelf()` (flips Reviewed → Entire Shelf) to show every book read from that country. Manually picking a country in the combo does NOT flip status — same as the Author combo — so it respects whatever the reader has toggled.
- **The one country-less book** and rare "live review not on the read shelf" cards have `data-country=""` and simply never match a country filter. No special handling needed.
