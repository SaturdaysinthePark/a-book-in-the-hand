#!/usr/bin/env python3
import re
import os

def clean_goodreads_artifacts(file_path):
    """Clean Goodreads artifacts from a markdown file."""
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()
        
        original_content = content
        
        # Replace book references: [b:BookTitle|ID|BookTitle|Author|ImageURL|ID2] -> *BookTitle* by Author
        content = re.sub(r'\[b:[^|]*\|[^|]*\|([^|]+)\|([^|]+)\|[^]]*\]', r'*\1* by \2', content)
        
        # Replace author references: [a:AuthorName|ID|AuthorName|ImageURL] -> AuthorName
        content = re.sub(r'\[a:[^|]*\|[^|]*\|([^|]+)\|[^]]*\]', r'\1', content)
        
        if content != original_content:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            return True
        return False
    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        return False

# Process the three remaining files
files_to_clean = [
    '/Users/sabtain/git/personal-website/src/content/blog/2019/04/07/deaths-end-remembrance-of-earths-past-3.md',
    '/Users/sabtain/git/personal-website/src/content/blog/2019/04/01/the-dark-forest-remembrance-of-earths-past-2.md',
    '/Users/sabtain/git/personal-website/src/content/blog/2019/03/26/the-three-body-problem-remembrance-of-earths-past-1.md'
]

for file_path in files_to_clean:
    if os.path.exists(file_path):
        if clean_goodreads_artifacts(file_path):
            print(f"✓ Cleaned: {os.path.basename(file_path)}")
        else:
            print(f"- No changes: {os.path.basename(file_path)}")
    else:
        print(f"✗ Not found: {file_path}")