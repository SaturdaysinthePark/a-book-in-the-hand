# Analytics

This site uses **Google Analytics 4** (GA4). This doc covers where it's wired up, every
event we send, and the one-time GA4 UI setup needed to actually *see* that data.

## Where it's configured

- **Measurement ID** — `GA_MEASUREMENT_ID` in [`src/consts.ts`](./src/consts.ts).
  Defaults to the prod stream `G-JNR91EN6Y4`; override per-environment with `PUBLIC_GA_ID`.
- **The tag** — injected in [`src/components/BaseHead.astro`](./src/components/BaseHead.astro),
  **production only** (`import.meta.env.PROD`). This is why `npm run dev` on `localhost`
  sends nothing — by design. Review pages get the tag via `BaseHead` in `BlogPost.astro`.
- **Event helper** — [`src/utils/analytics.ts`](./src/utils/analytics.ts). `track(name, params)`
  is a thin wrapper around `gtag` that **no-ops when GA isn't loaded**, so it's safe to call
  from any client script (including in dev).

## Event catalog

`page_view` is automatic (from `gtag('config')`) on every page. On top of that we send these
custom events:

| Event | Fires when | Params | Where |
|---|---|---|---|
| `search` | A search term settles (≥2 chars, ~700ms after typing) | `search_term` | `Header.astro` |
| `select_search_result` | A search result is chosen | `search_term`, `result_type`, `link_url` | `Header.astro` |
| `select_content` | An internal content link is clicked (review/list/author/tag) | `content_type`, `item_id`, `link_text`, `source_path` | `analytics.ts` (delegated) |
| `outbound_click` | A link to another host is clicked | `link_url`, `link_domain`, `link_text` | `analytics.ts` (delegated) |
| `filter_reviews` | A filter/toggle on `/book-reviews` is used | `filter_type`, `filter_value` | `book-reviews/index.astro` |
| `stats_control` | A control on `/stats` is changed | `control`, `value` | `stats.astro` |

`select_content` is the *click intent* (which item, from which page) layered on top of the
automatic `page_view` of the destination. Search-result rows are `<div>`s, not `<a>`s, so they
don't double-count under `select_content` — they're covered by `select_search_result`.

## One-time GA4 setup (do this in the GA4 UI)

### 1. Register custom dimensions (so event params are visible)

Params are *collected* but won't appear in reports/Explorations until registered.
**Admin → Custom definitions → Create custom dimension** — all **event-scoped**:

| Dimension name | Event parameter |
|---|---|
| Search term | `search_term` |
| Search result type | `result_type` |
| Link URL | `link_url` |
| Content type | `content_type` |
| Item ID | `item_id` |
| Source path | `source_path` |
| Link text | `link_text` |
| Filter type / Filter value | `filter_type`, `filter_value` |
| Stats control / Stats value | `control`, `value` |

Values populate **going forward only** (not retroactively).

### 2. Exclude your own traffic

The prod gate stops `localhost`, but it does **not** stop *you* browsing the live site.
**Admin → Data Streams → Configure tag settings → Define internal traffic** (add your IP),
then activate the **Internal Traffic** filter under **Admin → Data Filters**.

## Reading the data (gotchas)

- **Use Realtime for "did it just track?"** — Realtime overview / Realtime pages show within
  ~60s. The standard **Reports → Engagement → Pages and screens** is processed and lags; it is
  *not* the place to confirm a click you just made.
- **Filter out old test noise** — before the prod gate (2026-06-23), GA fired on `localhost`
  during `npm run dev`. To exclude that historical noise, filter any report by
  **`Hostname` exactly matches `saturdaysinabook.com`** (or set the date range to start
  2026-06-23). No data deletion needed.

## GA undercounts — and that's expected

A real, meaningful fraction of visits **never reach GA** because the visitor's device blocks it:
iOS Safari content blockers, privacy browsers (Brave/Firefox Focus/DuckDuckGo), and blocking DNS
(NextDNS, AdGuard DNS, Pi-hole) all silently drop `googletagmanager.com`. This is often
10–30%+ of traffic, higher among technical and iOS users. The tag is in the page either way —
**no client-side code can recover a blocked visitor** (the custom events above are dropped too).
So a single friend's visit not showing up is normal GA behavior, not a bug.
