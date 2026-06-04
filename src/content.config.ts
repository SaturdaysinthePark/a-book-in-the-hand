import { glob } from 'astro/loaders';
import { defineCollection, z } from 'astro:content';

const blog = defineCollection({
	// Load Markdown and MDX files in the `src/content/blog/` directory.
	loader: glob({ base: './src/content/blog', pattern: '**/*.{md,mdx}' }),
	// Type-check frontmatter using a schema
	schema: ({ image }) => z.object({
		title: z.string(),
		description: z.string(),
		// Transform string to Date object
		pubDate: z.coerce.date(),
		updatedDate: z.coerce.date().optional(),
		heroImage: z.string().optional(),
		// Book-specific fields
		bookTitle: z.string().optional(),
		author: z.string().optional(),
		genre: z.string().optional(),
		rating: z.number().min(1).max(5).optional(),
		readingTime: z.number().optional(), // in minutes
		purchaseLink: z.string().optional(),
		// Additional metadata
		goodreadsId: z.string().optional(),
		isbn: z.string().optional(),
		publishYear: z.number().optional(),
		// Status and taxonomy
		status: z.enum(['draft', 'live']).default('live'),
		tags: z.array(z.string()).optional(),
		postType: z.enum(['review', 'list', 'discussion']).default('review'),
		// Structured list entries (optional). When present on a `list` post,
		// they render as the numbered editorial layout; the markdown body still
		// renders below for freeform sections (stats, commentary, etc.).
		picks: z.array(z.object({
			bookTitle: z.string(),
			author: z.string().optional(),
			cover: z.string().optional(),        // image URL; falls back to a colored cover
			blurb: z.string().optional(),
			pull: z.string().optional(),         // short pull-quote
			reviewUrl: z.string().optional(),
			rating: z.number().min(1).max(5).optional(),
		})).optional(),
	}),
});

export const collections = { blog };
