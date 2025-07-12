#!/usr/bin/env python3
import csv
import os
import re
from datetime import datetime
from pathlib import Path
from html import unescape
import html

def clean_html_tags(text):
    """Clean HTML tags from text and convert to markdown-style formatting."""
    if not text or text == "":
        return ""
    
    # Convert HTML entities
    text = unescape(text)
    
    # Convert HTML tags to markdown
    text = re.sub(r'<br\s*/?>', '\n', text)
    text = re.sub(r'<br/>', '\n', text)
    text = re.sub(r'<b>(.*?)</b>', r'**\1**', text)
    text = re.sub(r'<strong>(.*?)</strong>', r'**\1**', text)
    text = re.sub(r'<i>(.*?)</i>', r'*\1*', text)
    text = re.sub(r'<em>(.*?)</em>', r'*\1*', text)
    text = re.sub(r'<blockquote>(.*?)</blockquote>', r'> \1', text, flags=re.DOTALL)
    text = re.sub(r'<p>(.*?)</p>', r'\1\n\n', text, flags=re.DOTALL)
    
    # Remove any remaining HTML tags
    text = re.sub(r'<[^>]+>', '', text)
    
    # Clean up extra whitespace
    text = re.sub(r'\n\s*\n', '\n\n', text)
    text = text.strip()
    
    return text

def create_slug(title):
    """Create a URL-friendly slug from the title."""
    # Remove special characters and convert to lowercase
    slug = re.sub(r'[^\w\s-]', '', title.lower())
    # Replace spaces with hyphens
    slug = re.sub(r'\s+', '-', slug)
    # Remove multiple hyphens
    slug = re.sub(r'-+', '-', slug)
    # Remove leading/trailing hyphens
    slug = slug.strip('-')
    return slug

def estimate_reading_time(text):
    """Estimate reading time based on text length."""
    if not text or text == "":
        return 1
    
    word_count = len(text.split())
    # Assume average reading speed of 200 words per minute
    reading_time = max(1, round(word_count / 200))
    return reading_time

def map_genre(bookshelves, title="", author=""):
    """Map bookshelves to genre or infer from title/author."""
    if not bookshelves:
        bookshelves = ""
    
    bookshelves_lower = bookshelves.lower()
    
    # Genre mapping based on common keywords
    if any(keyword in bookshelves_lower for keyword in ['fiction', 'novel', 'literary']):
        return 'Fiction'
    elif any(keyword in bookshelves_lower for keyword in ['non-fiction', 'biography', 'memoir', 'history']):
        return 'Non-Fiction'
    elif any(keyword in bookshelves_lower for keyword in ['sci-fi', 'science-fiction', 'fantasy']):
        return 'Science Fiction & Fantasy'
    elif any(keyword in bookshelves_lower for keyword in ['mystery', 'thriller', 'crime']):
        return 'Mystery & Thriller'
    elif any(keyword in bookshelves_lower for keyword in ['romance']):
        return 'Romance'
    elif any(keyword in bookshelves_lower for keyword in ['business', 'self-help', 'productivity']):
        return 'Business & Self-Help'
    else:
        return 'General'

def generate_tags(title, author, genre, bookshelves):
    """Generate appropriate tags for the book."""
    tags = []
    
    # Add genre as a tag
    if genre:
        tags.append(genre.lower().replace(' & ', '-').replace(' ', '-'))
    
    # Add author tag
    if author:
        author_tag = author.split(',')[0].strip().lower().replace(' ', '-')
        tags.append(author_tag)
    
    # Extract tags from bookshelves
    if bookshelves:
        shelf_tags = re.findall(r'\b\w+\b', bookshelves.lower())
        for tag in shelf_tags:
            if tag not in ['read', 'currently', 'reading', 'to', 'shelf'] and len(tag) > 2:
                tags.append(tag)
    
    # Limit to 5 tags and remove duplicates
    tags = list(set(tags))[:5]
    
    return tags

def construct_amazon_image_url(isbn13):
    """Construct Amazon image URL from ISBN13."""
    if not isbn13 or isbn13 == "":
        return ""
    
    # Clean ISBN13
    isbn_clean = re.sub(r'[^\d]', '', str(isbn13))
    if len(isbn_clean) == 13:
        return f"https://images-na.ssl-images-amazon.com/images/P/{isbn_clean}.01._SX300_SY300_SCLZZZZZZZ_.jpg"
    return ""

def create_purchase_link(title, isbn13):
    """Create Bookshop.org purchase link."""
    if not isbn13 or isbn13 == "":
        return ""
    
    slug = create_slug(title)
    isbn_clean = re.sub(r'[^\d]', '', str(isbn13))
    return f"https://bookshop.org/books/{slug}/{isbn_clean}"

def parse_date(date_str):
    """Parse date string to datetime object."""
    if not date_str:
        return None
    
    try:
        return datetime.strptime(date_str, '%Y/%m/%d')
    except ValueError:
        return None

def create_markdown_file(book_data, output_dir):
    """Create a markdown file for a book."""
    title = book_data['Title']
    author = book_data['Author']
    date_read = book_data['Date Read']
    rating = book_data['My Rating']
    review = book_data['My Review']
    bookshelves = book_data['Bookshelves']
    isbn13 = book_data['ISBN13']
    isbn = book_data['ISBN']
    year_published = book_data['Year Published']
    book_id = book_data['Book Id']
    
    # Parse date
    date_obj = parse_date(date_read)
    if not date_obj:
        print(f"Skipping {title} - invalid date: {date_read}")
        return False
    
    # Create directory structure
    year = date_obj.year
    month = f"{date_obj.month:02d}"
    day = f"{date_obj.day:02d}"
    
    slug = create_slug(title)
    file_dir = Path(output_dir) / str(year) / month / day
    file_dir.mkdir(parents=True, exist_ok=True)
    
    file_path = file_dir / f"{slug}.md"
    
    # Determine status
    has_review = review and review.strip() != ""
    status = 'live' if has_review else 'draft'
    
    # Generate content
    genre = map_genre(bookshelves, title, author)
    tags = generate_tags(title, author, genre, bookshelves)
    
    # Clean review content
    if has_review:
        clean_review = clean_html_tags(review)
        reading_time = estimate_reading_time(clean_review)
        content = clean_review
    else:
        reading_time = 1
        content = f"Review of **{title}** by {author} coming soon...\n\nI rated this book {rating} stars."
    
    # Create frontmatter
    frontmatter = f"""---
title: 'Review: {title}'
description: 'A thoughtful review of {title} by {author}'
pubDate: {date_obj.strftime('%Y-%m-%d')}
bookTitle: '{title}'
author: '{author}'
genre: '{genre}'
rating: {rating}
readingTime: {reading_time}
purchaseLink: '{create_purchase_link(title, isbn13)}'
goodreadsId: '{book_id}'
isbn: '{isbn}'
publishYear: {year_published}
status: '{status}'
tags: {tags}
postType: 'review'
heroImage: '{construct_amazon_image_url(isbn13)}'
---

{content}"""
    
    # Write file
    with open(file_path, 'w', encoding='utf-8') as f:
        f.write(frontmatter)
    
    print(f"Created: {file_path}")
    return True

def process_csv():
    """Process the CSV file and create markdown files."""
    csv_path = "/Users/sabtain/git/personal-website/goodreads_library_export (1).csv"
    output_dir = "/Users/sabtain/git/personal-website/src/content/blog"
    
    # Read CSV
    books = []
    with open(csv_path, 'r', encoding='utf-8') as f:
        reader = csv.DictReader(f)
        for row in reader:
            books.append(row)
    
    print(f"Total books in CSV: {len(books)}")
    
    # Filter books from January 5, 2019 onwards with "read" shelf
    start_date = datetime(2019, 1, 5)
    filtered_books = []
    
    for book in books:
        date_obj = parse_date(book['Date Read'])
        if date_obj and date_obj >= start_date and book['Exclusive Shelf'] == 'read':
            filtered_books.append(book)
    
    print(f"Books to process (from 2019-01-05, read shelf): {len(filtered_books)}")
    
    # Sort by date
    filtered_books.sort(key=lambda x: parse_date(x['Date Read']))
    
    # Process books with reviews first
    with_reviews = []
    without_reviews = []
    
    for book in filtered_books:
        if book['My Review'] and book['My Review'].strip():
            with_reviews.append(book)
        else:
            without_reviews.append(book)
    
    print(f"Books with reviews: {len(with_reviews)}")
    print(f"Books without reviews: {len(without_reviews)}")
    
    # Create markdown files
    created_count = 0
    
    print("\nProcessing books with reviews...")
    for book in with_reviews:
        if create_markdown_file(book, output_dir):
            created_count += 1
    
    print("\nProcessing books without reviews...")
    for book in without_reviews:
        if create_markdown_file(book, output_dir):
            created_count += 1
    
    print(f"\nTotal files created: {created_count}")

if __name__ == "__main__":
    process_csv()