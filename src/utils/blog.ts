import type { CollectionEntry } from 'astro:content';
import shelfData from '../data/shelf.json';

export function getBlogUrl(postId: string): string {
  // Post ID is already in the format "2025/01/05/the-midnight-library"
  return `/blog/${postId}/`;
}

/**
 * Minimal inline-markdown → HTML for short author-written strings (list-pick
 * blurbs). Supports paragraphs (blank-line separated), **bold** and *italics*.
 * Plain text passes through as a single <p>, so existing plain blurbs are
 * unaffected. Input is the author's own content; output is used with set:html.
 */
export function mdLite(src?: string | null): string {
  if (!src) return '';
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return src.trim().split(/\n{2,}/).map((para) =>
    '<p>' + esc(para)
      .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      .replace(/\*([^*\n]+)\*/g, '<em>$1</em>')
      .replace(/\n/g, '<br>') + '</p>'
  ).join('');
}

/**
 * Deterministic palette for CSS-drawn book covers (used when a book has no real
 * cover image). The same seed always maps to the same colour, so a given title
 * looks identical everywhere it appears.
 */
export type CoverColor = { bg: string; ink: string };
export const COVER_COLORS: CoverColor[] = [
  { bg: '#2d4a3e', ink: '#d8cdb8' },
  { bg: '#6b2737', ink: '#f3e8d8' },
  { bg: '#1e3a4a', ink: '#d8cdb8' },
  { bg: '#4a3728', ink: '#f3e8d8' },
  { bg: '#3d3a28', ink: '#d8cdb8' },
  { bg: '#2a3d4a', ink: '#f3e8d8' },
  { bg: '#5a2d45', ink: '#f3e8d8' },
  { bg: '#3a4a2d', ink: '#d8cdb8' },
  { bg: '#7d3a28', ink: '#f3e8d8' },
  { bg: '#283a5a', ink: '#d8cdb8' },
];

export function getCoverColor(seed: string): CoverColor {
  let h = 0;
  for (let i = 0; i < seed.length; i++) { h = ((h << 5) - h) + seed.charCodeAt(i); h |= 0; }
  return COVER_COLORS[Math.abs(h) % COVER_COLORS.length];
}

const _shelfByGid = new Map<string, string[]>(
  (shelfData as { goodreadsId: string; subgenres: string[] }[])
    .map(b => [b.goodreadsId, b.subgenres])
);

/**
 * Returns tags for a post: shelf subgenres for review posts (matched by goodreadsId),
 * or filtered frontmatter tags for non-review posts (lists, discussions).
 */
export function tagsForPost(post: CollectionEntry<'blog'>, authorSlugs: Set<string>): string[] {
  const gid = post.data.goodreadsId ? String(post.data.goodreadsId) : '';
  if (gid && _shelfByGid.has(gid)) {
    return _shelfByGid.get(gid)!;
  }
  return (post.data.tags || []).filter((t: string) => !isJunkTag(t, authorSlugs));
}

/**
 * Filters out junk tags: years (e.g. '2022'), author slugs, and 'general'.
 * Pass the post's author name to also exclude that author's slug from tags.
 */
export function filterDisplayTags(tags: string[], authorSlugs?: Set<string>): string[] {
  return tags.filter(tag => {
    if (/^\d{4}$/.test(tag)) return false;
    if (tag.toLowerCase() === 'general') return false;
    if (authorSlugs && authorSlugs.has(tag.toLowerCase())) return false;
    return true;
  });
}

/**
 * Returns true if a tag is a junk tag that shouldn't get its own page.
 */
export function isJunkTag(tag: string, authorSlugs: Set<string>): boolean {
  if (/^\d{4}$/.test(tag)) return true;
  if (tag.toLowerCase() === 'general') return true;
  if (authorSlugs.has(tag.toLowerCase().replace(/\s+/g, '-'))) return true;
  return false;
}