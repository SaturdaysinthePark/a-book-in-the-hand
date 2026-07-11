// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import { readFileSync } from 'node:fs';
import { globSync } from 'tinyglobby';

import tailwindcss from '@tailwindcss/vite';

// Build a map of blog post pathname -> last-modified date (W3C yyyy-mm-dd) by reading
// frontmatter at config load. @astrojs/sitemap's serialize() runs in Node and can't reach
// astro:content, so we glob the source files directly. Prefer updatedDate, fall back to
// pubDate. The blog route maps `params.slug = post.id` (file path minus extension), so the
// URL is always /blog/<slug>/.
const postDates = new Map();
for (const file of globSync('src/content/blog/**/*.{md,mdx}')) {
  const src = readFileSync(file, 'utf8');
  const match =
    src.match(/^updatedDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m) ??
    src.match(/^pubDate:\s*['"]?(\d{4}-\d{2}-\d{2})/m);
  if (!match) continue;
  const slug = file.replace(/^src\/content\/blog\//, '').replace(/\.(md|mdx)$/, '');
  postDates.set(`/blog/${slug}/`, match[1]);
}

// https://astro.build/config
export default defineConfig({
  site: 'https://saturdaysinabook.com',
  integrations: [
    mdx(),
    sitemap({
      // /drafts is a dev-only preview (noindex + redirects to /404 in prod); keep it out
      // of the sitemap entirely.
      filter: (page) =>
        !page.includes('/drafts') &&
        !page.includes('/authors/') && // redirect stubs → filtered shelf
        !page.includes('/tags/') && // dormant, unlinked tag pages
        !/\/newsletter\/\d+\.html$/.test(page), // archived issues are noindex/point-to only
      serialize(item) {
        let pathname;
        try {
          pathname = decodeURIComponent(new URL(item.url).pathname);
        } catch {
          pathname = new URL(item.url).pathname;
        }
        const lastmod = postDates.get(pathname);
        if (lastmod) item.lastmod = lastmod;
        return item;
      },
    }),
  ],

  markdown: {
    remarkPlugins: [],
    rehypePlugins: [],
    shikiConfig: {
      theme: 'github-light',
      wrap: true
    },
    // Ensure markdown parsing is strict and follows CommonMark
    gfm: true,
    smartypants: true
  },

  vite: {
    plugins: [tailwindcss()],
  },
});
