// @ts-check
import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';

import tailwindcss from '@tailwindcss/vite';

// https://astro.build/config
export default defineConfig({
  site: 'https://a-book-in-the-hand.netlify.app',
  integrations: [mdx(), sitemap()],
  
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