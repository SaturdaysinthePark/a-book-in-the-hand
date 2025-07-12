# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a personal book review website called "A Book in the Hand" built with **Astro v5.11.0**. The site focuses on literary content with book reviews, curated lists, and literary discussions.

## Development Commands

```bash
# Start development server (localhost:4321)
npm run dev

# Build for production (outputs to ./dist/)
npm run build

# Preview production build locally
npm run preview
```

## Architecture

### Tech Stack
- **Framework:** Astro with TypeScript (strict mode)
- **Styling:** Tailwind CSS v4.1.11 + custom CSS
- **Content:** Astro Content Collections with MDX support
- **Integrations:** RSS feed, sitemap generation, Sharp image optimization

### Content Management
Uses **Astro Content Collections** defined in `src/content.config.ts`:

**Content Schema:**
- Standard blog fields: title, description, pubDate, updatedDate, heroImage
- Book-specific fields: bookTitle, author, genre, rating (1-5), readingTime, purchaseLink
- Taxonomy: tags array, postType enum ('review', 'list', 'discussion')

**Content Organization:**
- Path structure: `src/content/blog/YYYY/MM/DD/post-slug.md`
- Book covers: `public/book-covers/`
- Template: `book-review-template.md` at project root

### Key Components

**Layouts:**
- `BlogPost.astro` - Flexible layout supporting both book reviews and lists
  - Book reviews: Sidebar with cover image, rating, tags
  - Lists: Header with hero image and tags

**Core Components:**
- `BaseHead.astro` - Meta tags, SEO, OpenGraph
- `Header.astro` - Navigation with expandable search and mobile menu
- `Footer.astro` - Site footer

### Page Structure

**Core Pages:**
- `index.astro` - Homepage with recent reviews and lists
- `blog/[...slug].astro` - Dynamic blog post rendering
- `book-reviews/index.astro` - Book review archive
- `my-lists/index.astro` - Curated book lists
- `authors/[author].astro` - Author-specific pages
- `tags/[tag].astro` - Tag-based filtering

### Design System

**Color Palette** (defined in `src/styles/global.css`):
- Primary: Dark charcoal (#2C2C2C)
- Accent: Warm brown (#8B7355)
- Background: Papyrus white (#FEFCF9)

**Typography:**
- Primary: Open Sans (Google Fonts)
- Headers: Poppins for site title
- Local fonts: Atkinson (custom font files)

## Content Types

1. **Book Reviews** - Full reviews with ratings, covers, author links
2. **Book Lists** - Curated lists (e.g., "Top Mystery Novels")
3. **Discussion Posts** - General literary discussions

## Key Configuration Files

- `astro.config.mjs` - Main Astro configuration with MDX, sitemap, and Tailwind
- `src/content.config.ts` - Content collections schema
- `src/consts.ts` - Global constants (site title, description)
- `tsconfig.json` - TypeScript configuration with strict settings

## Development Patterns

### Creating New Content
1. Use the `book-review-template.md` as a starting point
2. Follow the date-based directory structure: `YYYY/MM/DD/`
3. Include rich frontmatter with book-specific fields
4. Add book covers to `public/book-covers/`

### Component Development
- Components are in `src/components/`
- Use Astro component syntax (.astro files)
- Follow the existing responsive design patterns
- Maintain the paper-inspired aesthetic

### Utility Functions
- Blog utilities in `src/utils/blog.ts`
- URL generation helpers for consistent routing