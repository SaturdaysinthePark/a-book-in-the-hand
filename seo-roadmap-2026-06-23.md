# SEO + AI-Search Roadmap — Saturdays in a Book
*Generated 2026-06-23, against the live site after the "SEO foundation" deploy (commits cb3f785, c52972e).*

## Method note
The `claude-seo` specialist subagents are sandboxed off the network in this environment, so
5 of 6 stalled after falling back to local-repo reading. The **schema** specialist completed a
full report; the technical / content / GEO / SXO / cluster sections below are first-party
analysis (repo + live `WebFetch` verification + measured data). Where a number is measured it's
labelled.

---

## Baseline SEO Health Score: **~80 / 100 — "Good"**

| Category | Weight | Score | Why |
|---|---|---|---|
| Technical SEO | 22% | 88 | Static Astro, sitemap+lastmod, robots, canonicals, clean URLs, HTTPS. Minor gaps only. |
| Content Quality | 23% | 72 | Original voice + strong About/E-E-A-T, but 32% of reviews are thin and none lead with a verdict passage. |
| On-Page SEO | 20% | 82 | Good titles/descriptions + per-page OG; author/tag hubs have generic meta + no body copy. |
| Schema | 10% | 82 | WebSite/Person/Review/Breadcrumb all valid; enrichment gaps (author @id, Book fields, ItemList). |
| Performance (CWV) | 10% | 85 | Fast static pages; render-blocking Google Fonts; hotlinked cover images. |
| AI Search Readiness | 10% | 80 | `llms.txt` live, robots open to AI crawlers, Person entity, schema — limited only by review depth/citability. |
| Images | 5% | 70 | Covers hotlinked from Amazon/Goodreads (breakage risk, not optimized). |

**Headline:** No critical/indexing blockers. The ceiling is **content depth + turning ~half
your URLs (author/tag hubs) into real pages**, then schema enrichment. This is a strong base to
build on.

---

## Measured data (live, built pages only)
- **109 live reviews**, 2 lists, 282 unpublished shelf stubs (correctly not built/indexed).
- Review length: **median 251 words, mean 305**. Distribution: <100w **6%** (7 reviews), 100–199w 26% (28), 200–399w 46% (50), 400+w 22% (24). Longest: 1611w.
- **Thin (<200 words): 32% (35 reviews)** — the priority queue, led by the 7 sub-100-word ones.
- 109 review pages now emit valid `Review` JSON-LD (was literal `{JSON.stringify}` text before today's fix).

---

## Action plan

### 🔴 Critical — none
No indexing blockers, no penalties, no broken canonical/robots. Good place to be.

### 🟠 High

**H1 — Expand thin reviews, verdict-first** *(backlog #5 + #8; biggest lever)*
- Target the 35 reviews under 200 words, starting with the 7 under 100w **and** any high-search-demand titles (1984, Educated, Where the Crawdads Sing, Klara and the Sun, Three-Body Problem, popular Sanderson). Demand > completeness — don't pad obscure titles.
- Open every review with a 1–2 sentence self-contained verdict: *book + what it is + your take + rating*. This is what AI Overviews / featured snippets extract and what makes a short review rankable.
- Verify: GSC "Crawled — currently not indexed" count drops over 4–8 weeks; reviews start appearing for `<title> review` queries.

**H2 — Schema enrichment** *(backlog #4, now that the block actually renders)* — from the schema specialist:
- `Review.author` → reference `{"@id": ".../#person"}` instead of an anonymous Person, so the reviewer unifies with the About entity (W1).
- Enrich `itemReviewed` Book with `isbn`, `datePublished` (from `publishYear`), and `sameAs` Goodreads URL (from `goodreadsId`) — all already in frontmatter, currently dropped (I1).
- Add `ItemList` JSON-LD to list posts (the `picks` array) — supported rich result, currently absent (I2).
- Add `Review.name` (use the post `title`) — recommended property (W3).
- Fix breadcrumb level-2 trailing slash: `/book-reviews` → `/book-reviews/`, `/my-lists` → `/my-lists/` (W2).
- Verify: Rich Results Test on a review URL shows Review + Breadcrumb with no warnings; list URL shows ItemList.

**H3 — Make author & tag hubs real pages** *(backlog #9; ~half your URLs)*
- `authors/[author].astro` and `tags/[tag].astro` currently ship generic meta ("All books by X") and a bare list. Add a unique meta description + a short intro paragraph (count of books, a sentence of context) and, ideally, order/section the list.
- Why: these ~129 hub pages are your best shot at ranking for `<author> books` and `best <genre> books` — high-intent queries — but right now they're thin.
- Verify: hub pages start getting impressions in GSC for author/genre queries.

### 🟡 Medium

**M1 — Genre pillar pages + hub-and-spoke linking** *(cluster strategy)*
- Build a handful of pillar pages from your strongest existing tags — e.g. "Best Science Fiction Books I've Read", "Literary Fiction Recommendations", "Best Fantasy Books" — each a curated, opinionated guide that links down to individual reviews (spokes) and up from them.
- Map: pillar (genre hub) ⇄ reviews ⇄ author pages ⇄ year-end lists. Reuse the existing `picks`/list rendering.
- This is the structure Google and AI engines reward for topical authority.

**M2 — Internal linking: "related reviews"**
- Add a related-reviews module to each review (same genre/tag or same author). Today reviews link out to author/tag pages but not to sibling reviews — adding this deepens crawl paths and dwell time.

**M3 — Cover images** *(Images score is the weakest)*
- Covers are hotlinked from `images-na.ssl-images-amazon.com` / Goodreads CDNs — fragile (can 404/hotlink-block) and unoptimized. Consider downloading into `public/book-covers/` (or proxying through Astro's image pipeline) with explicit width/height + `loading="lazy"`. Confirm `alt` text on `BookCover`.

**M4 — GEO depth**
- Keep `/llms.txt`. Once reviews have verdict-first openings (H1), citability jumps. Optionally add `/llms-full.txt` with full review text for AI ingestion.

**M5 — Performance polish**
- Google Fonts is render-blocking. Self-host the subset you use (Newsreader + Geist + Cormorant) or preload, to shave LCP. Static pages are already fast, so this is incremental.

### 🟢 Low / backlog
- **L1** Drop obsolete `<meta keywords>` in `BaseHead.astro:48` (#10).
- **L2** Build a real `/search?q=` results page → unlocks a valid `WebSite` `SearchAction` sitelinks box (currently search is client-side only, so the markup would be invalid — left out on purpose).
- **L3** Add more `Person.sameAs` profiles (StoryGraph/Literal/social) + an `AboutPage` node linking WebSite → Person to close the entity graph (schema I4/I5).
- **L4** Add Bing Webmaster Tools (import from GSC) — Bing feeds Microsoft Copilot.

---

## Suggested sequence
1. **Now:** H2 (schema enrichment — small, code-only, compounds with everything) + L1.
2. **Next 2–4 weeks:** H1 (thin-review expansion, ~10 highest-demand titles first) + H3 (hub pages).
3. **Then:** M1/M2 (pillars + internal linking), M3 (covers), M5 (fonts).
4. **Ongoing:** watch GSC Performance + Pages (indexing); each expanded review + new hub is a leading indicator.

## What to monitor (without re-auditing)
- GSC **Pages**: "Crawled — not indexed" should shrink as H1/H3 land.
- GSC **Enhancements**: Review + Breadcrumb reports appear once Google re-crawls; watch for errors after H2.
- GSC **Performance**: impressions for `<author> books` / `best <genre> books` validate H3; `<title> review` validates H1.
