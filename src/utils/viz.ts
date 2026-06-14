// Data-viz colour pairs — single source of truth for the split charts and the
// timeline legend, shared by the stats page server frontmatter and its client
// <script>. Values are CSS custom properties (resolved where the SVG renders),
// so they follow the design tokens in global.css. See STATS-COLOR-BRIEF.md.
export const CAT_COLORS = ['var(--viz-cat-1)', 'var(--viz-cat-2)']; // fiction (rust), non-fiction (forest)
export const GENDER_COLORS = ['var(--viz-primary)', 'var(--ink-2)']; // women (rust), men (espresso)
