import type { CollectionEntry } from 'astro:content';
import shelfData from '../data/shelf.json';

export function getBlogUrl(postId: string): string {
  // Post ID is already in the format "2025/01/05/the-midnight-library"
  return `/blog/${postId}/`;
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