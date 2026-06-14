# Design Brief — Stats page color & data-viz system

## Context

The `/stats` page (`src/pages/stats.astro`) renders ~13 custom SVG charts (bars,
horizontal bars, a rating curve, two split bars, a year timeline, and a world-map
choropleth) plus headline number cards. The rest of the site runs on a tightly
controlled, paper-inspired token system in `src/styles/global.css` (`--bg`, `--ink`,
`--accent`, etc.) consumed via CSS custom properties and Tailwind v4.

The stats page is the one place that **breaks that system**. Its chart colors are
hardcoded hex literals that aren't in the token palette, don't use CSS variables, and
carry an internal comment that no longer matches the actual values. This brief documents
the problems and proposes a coherent data-visualization color layer that extends — rather
than fights — the existing earthy aesthetic.

**Deliverable:** this design brief only (no code changes this pass). The recommended
implementation is captured at the end so a later pass can execute it directly.

---

## Audit findings

Current hardcoded chart colors (from `src/pages/stats.astro:18-19, 42-82, 340-454` and the
duplicate client block at `:486-488`):

| Color | Where used | Issue |
|-------|-----------|-------|
| `#b8553a` rust | ~10 charts (genres, authors, languages, eras, longest, length dist, rating curve, timeline) + `.stat-num` / `.flag-count` | Repeated literal ~12×; not a token; not `var()`-driven |
| `#6b7a5e` sage | avg-rating-by-genre, avg-pages-by-year **and** male in gender split | **Semantic collision** — means "average" *and* "male" on the same page |
| `#5c3a42` / `#c8ba9a` | fiction / non-fiction split | Sand `#c8ba9a` is so light the split bar reads as "filled vs empty" rather than two categories |
| `#C66C77` / `#6b7a5e` | female / male split | Pink/“the-other” coding; reuses sage |
| `#6b7a5e` + `#d4cfc6` | world map choropleth (hardcoded, interpolated on client) | Hardcoded accent again collides with "average" sage |

**Five core problems:**

1. **Off the token system.** Chart hexes live as literals, so they ignore the
   `global.css` palette. The map already proves `var(--token)` works inside the SVGs
   (`--map-land`/`--map-border`), so charts *can* be token-driven — they just aren't.
2. **Stated convention ≠ reality.** Code comment at `stats.astro:40` says "counts use
   `--accent`, averages use `--accent-2`," but the charts actually use `#b8553a` /
   `#6b7a5e`, which are *not* `--accent` (`#8b5a2b`) or `--accent-2` (`#a8472a`).
3. **Semantic collision.** Sage carries two unrelated meanings (average vs. male).
4. **Duplication / drift risk.** `CAT_COLORS` and `GENDER_COLORS` are declared twice and
   must be hand-synced; the rust literal is copy-pasted a dozen times.
5. **No real categorical scale.** Pairs are ad hoc. There's no defined, color-blind-safe
   scale to draw from if a future chart needs 3+ categories.

---

## Goals & principles

- **One source of truth.** Every chart color is a CSS token in `:root`, consumed as
  `var(--viz-…)` inside the SVG strings. Theme changes propagate automatically.
- **Stay in the paper world.** Muted, warm, low-chroma — these read as aged book spines,
  not a dashboard. Olive sage is the only cool-leaning hue; no blue/teal or mustard.
- **Meaning maps to color, 1:1.** "Magnitude/count" and "average/quality" each own a color
  and never share it with a category.
- **Color-blind safe & WCAG 1.4.11.** Adjacent categories differ in *hue and lightness*;
  graphical fills target ≥3:1 against the cream background.

---

## Palette (implemented)

### Roles

| Token | Hex | Role |
|-------|-----|------|
| `--viz-primary` | `#9c4a2a` (rust) | Counts / main series — genres, authors, languages, eras, longest, length dist, rating curve, timeline; also `.stat-num`, `.flag-count`, and the map ramp |
| `--viz-secondary` | `#3f5a4a` (forest) | Ratings / quality — avg rating by genre, avg pages by year |
| `--viz-amber` | `#c9a96e` | Tertiary / annotations (defined per spec; currently unused) |
| `--viz-gray` | `#8a7a6a` | De-emphasis — pre-1960 publication-era bars |
| `--viz-cat-1` | `#9c4a2a` | = primary (fiction) |
| `--viz-cat-2` | `#3f5a4a` | = secondary (non-fiction) |

Reused existing tokens: `--ink` (`#1a1614`, "ink" ≈ spec `#161310`) for the rank-#1 accent;
`--ink-2` (`#3a322a`, espresso) for the male gender segment.

### Split bars (`src/utils/viz.ts`)

| Chart | Segment A | Segment B |
|-------|-----------|-----------|
| Fiction vs non-fiction | `--viz-primary` rust | `--viz-secondary` forest |
| Author gender | `--viz-primary` rust (women) | `--ink-2` espresso (men) |

### Per-bar accents (`hBarsSVG` `colors[]`)

- **Most-read authors** & **Longest books**: rank-#1 bar in `--ink`, the rest rust.
- **Books by era of publication**: pre-1960 buckets in `--viz-gray`, 1960→present in rust —
  the color encodes temporal recency.

### World-map choropleth (stepped)

Discrete rust-opacity buckets (not a continuous ramp), driven by tokens:

```
ocean / no-data : var(--bg) #f3ece0      (.world-map background)
0 books         : --map-land   #e4ddd1
1–3             : rgba(rust, 0.15)
4–8             : rgba(rust, 0.40)
9–15            : rgba(rust, 0.70)
16+             : rust solid  (--map-accent = --viz-primary)
borders         : --map-border rgba(22,19,16,0.15) @ 0.5px
```

---

## Accessibility notes

- **White % labels on split segments** clear 4.5:1 on all three fills: rust ~4.8:1,
  forest ~7:1, espresso ~9:1 against white.
- Single-series count/average bars (rust/forest) clear the 3:1 graphical-object threshold
  against the cream `--bg`.
- Rust vs forest separate by hue *and* lightness; the rank-#1 ink bar and the gray pre-1960
  era bars add a lightness cue, so charts hold up under deuteranopia/protanopia. Confirm with
  a CB simulator.

---

## Where it lives (implemented)

- **Tokens:** `:root` viz block + `.world-map` map tokens in `src/styles/global.css` /
  `src/pages/stats.astro`.
- **Split/legend pairs:** `src/utils/viz.ts` (`CAT_COLORS`, `GENDER_COLORS`), imported by both
  the stats frontmatter and its client `<script>` (single source).
- **Per-bar accents:** `hBarsSVG` `colors[]` (`src/utils/charts.ts`), threaded through
  `ChartSpec.colors` (`src/utils/stats-charts.ts`); the arrays are built in the stats
  frontmatter (`rankColors`, `eraColors`).
- **Stepped map:** `renderWorldMap()` `bucketFill()` in `src/pages/stats.astro`.

### Verification

- `npm run build`; `grep -oE "var\(--viz-[a-z0-9-]+\)" dist/stats/index.html | sort | uniq -c`
  to confirm tokens render (heavy `--viz-primary`, `--viz-secondary` on the two average charts,
  `--ink` on the rank-#1 bars, `--viz-gray` on pre-1960 era bars).
- `npm run dev`, open `/stats`; resize to mobile to confirm the client re-render keeps the
  per-bar colors (shared `renderSpec`).

---

## Open question for later

Do you want a matching **dark variant** of the viz tokens? The site has a `.band--ink`
dark treatment; if stats ever gets a dark section, rust/forest need slightly lifted lightness
to hold contrast on charcoal. Out of scope — noted for the future.
