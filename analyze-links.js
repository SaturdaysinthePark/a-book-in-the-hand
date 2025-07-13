const fs = require('fs');
const path = require('path');

// Function to parse frontmatter
function parseFrontmatter(content) {
    const frontmatterMatch = content.match(/^---\n([\s\S]*?)\n---/);
    if (!frontmatterMatch) return {};
    
    const frontmatter = {};
    const lines = frontmatterMatch[1].split('\n');
    
    for (const line of lines) {
        const match = line.match(/^(\w+):\s*(.*)$/);
        if (match) {
            let value = match[2].trim();
            // Remove quotes
            if (value.startsWith("'") && value.endsWith("'")) {
                value = value.slice(1, -1);
            }
            if (value.startsWith('"') && value.endsWith('"')) {
                value = value.slice(1, -1);
            }
            frontmatter[match[1]] = value;
        }
    }
    return frontmatter;
}

// Function to get URL slug from file path
function getSlugFromPath(filePath) {
    const relativePath = filePath.replace('/Users/sabtain/git/personal-website/src/content/blog/', '');
    const parts = relativePath.split('/');
    if (parts.length >= 4) {
        const year = parts[0];
        const month = parts[1];
        const day = parts[2];
        const filename = parts[3].replace('.md', '');
        return `/blog/${year}/${month}/${day}/${filename}/`;
    }
    return null;
}

// Function to extract book references from content
function extractBookReferences(content) {
    // Remove frontmatter first
    const contentWithoutFrontmatter = content.replace(/^---\n[\s\S]*?\n---\n/, '');
    
    // Find text in italics that might be book titles
    const italicMatches = contentWithoutFrontmatter.match(/\*([^*]+)\*/g) || [];
    const bookReferences = italicMatches.map(match => match.replace(/\*/g, '').trim());
    
    return bookReferences;
}

// Function to convert string to kebab-case
function toKebabCase(str) {
    return str.toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '') // Remove special characters
        .replace(/\s+/g, '-') // Replace spaces with hyphens
        .replace(/-+/g, '-') // Replace multiple hyphens with single
        .replace(/^-|-$/g, ''); // Remove leading/trailing hyphens
}

// Function to scan all blog posts
function scanBlogPosts() {
    const blogDir = '/Users/sabtain/git/personal-website/src/content/blog';
    const posts = [];
    const bookTitleMap = new Map();
    const authorMap = new Map();
    
    function scanDirectory(dir) {
        const items = fs.readdirSync(dir);
        for (const item of items) {
            const fullPath = path.join(dir, item);
            const stat = fs.statSync(fullPath);
            
            if (stat.isDirectory()) {
                scanDirectory(fullPath);
            } else if (item.endsWith('.md')) {
                try {
                    const content = fs.readFileSync(fullPath, 'utf-8');
                    const frontmatter = parseFrontmatter(content);
                    const slug = getSlugFromPath(fullPath);
                    const bookReferences = extractBookReferences(content);
                    
                    const post = {
                        filePath: fullPath,
                        slug,
                        title: frontmatter.title || '',
                        bookTitle: frontmatter.bookTitle || '',
                        author: frontmatter.author || '',
                        postType: frontmatter.postType || 'review',
                        bookReferences,
                        content
                    };
                    
                    posts.push(post);
                    
                    // Build book title mapping
                    if (frontmatter.bookTitle && slug) {
                        bookTitleMap.set(frontmatter.bookTitle.toLowerCase(), {
                            title: frontmatter.bookTitle,
                            url: slug,
                            author: frontmatter.author || ''
                        });
                    }
                    
                    // Build author mapping
                    if (frontmatter.author && slug) {
                        const authorKey = frontmatter.author.toLowerCase();
                        if (!authorMap.has(authorKey)) {
                            authorMap.set(authorKey, {
                                name: frontmatter.author,
                                kebabCase: toKebabCase(frontmatter.author),
                                posts: []
                            });
                        }
                        authorMap.get(authorKey).posts.push({
                            title: frontmatter.bookTitle || frontmatter.title,
                            url: slug
                        });
                    }
                    
                } catch (error) {
                    console.error(`Error processing ${fullPath}:`, error.message);
                }
            }
        }
    }
    
    scanDirectory(blogDir);
    
    return {
        posts,
        bookTitleMap,
        authorMap
    };
}

// Main analysis
const { posts, bookTitleMap, authorMap } = scanBlogPosts();

console.log('\n=== BOOK TITLE MAPPING ===');
for (const [key, value] of bookTitleMap) {
    console.log(`"${value.title}" -> ${value.url}`);
}

console.log('\n=== AUTHOR MAPPING ===');
for (const [key, value] of authorMap) {
    console.log(`"${value.name}" -> /authors/${value.kebabCase}/`);
}

console.log('\n=== POSTS WITH BOOK REFERENCES ===');
posts.forEach(post => {
    if (post.bookReferences.length > 0) {
        console.log(`\n${post.title} (${post.slug}):`);
        post.bookReferences.forEach(ref => {
            console.log(`  - *${ref}*`);
            // Check if this reference matches a known book
            const match = bookTitleMap.get(ref.toLowerCase());
            if (match) {
                console.log(`    → LINKABLE to ${match.url}`);
            }
        });
    }
});

console.log(`\n=== SUMMARY ===`);
console.log(`Total posts: ${posts.length}`);
console.log(`Unique books: ${bookTitleMap.size}`);
console.log(`Unique authors: ${authorMap.size}`);
console.log(`Posts with book references: ${posts.filter(p => p.bookReferences.length > 0).length}`);