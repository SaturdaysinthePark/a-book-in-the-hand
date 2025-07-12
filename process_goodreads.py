#!/usr/bin/env python3
import pandas as pd
import os
import re
from datetime import datetime
from pathlib import Path
from html import unescape
import html

def clean_html_tags(text):
    """Clean HTML tags from text and convert to markdown-style formatting."""
    if pd.isna(text) or text == "":
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
    if pd.isna(text) or text == "":
        return 1
    
    word_count = len(text.split())
    # Assume average reading speed of 200 words per minute
    reading_time = max(1, round(word_count / 200))
    return reading_time

def map_genre(bookshelves, title="", author=""):
    """Map bookshelves to genre or infer from title/author."""
    if pd.isna(bookshelves):
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
    if pd.notna(author):
        author_tag = author.split(',')[0].strip().lower().replace(' ', '-')
        tags.append(author_tag)
    
    # Extract tags from bookshelves
    if pd.notna(bookshelves):
        shelf_tags = re.findall(r'\b\w+\b', bookshelves.lower())
        for tag in shelf_tags:
            if tag not in ['read', 'currently', 'reading', 'to', 'shelf'] and len(tag) > 2:
                tags.append(tag)
    
    # Limit to 5 tags and remove duplicates
    tags = list(set(tags))[:5]
    
    return tags

def construct_amazon_image_url(isbn13):
    """Construct Amazon image URL from ISBN13."""
    if pd.isna(isbn13) or isbn13 == "":
        return ""
    
    # Clean ISBN13
    isbn_clean = re.sub(r'[^\d]', '', str(isbn13))
    if len(isbn_clean) == 13:
        return f"https://images-na.ssl-images-amazon.com/images/P/{isbn_clean}.01._SX300_SY300_SCLZZZZZZZ_.jpg"
    return ""

def create_purchase_link(title, isbn13):
    """Create Bookshop.org purchase link."""
    if pd.isna(isbn13) or isbn13 == "":
        return ""
    
    slug = create_slug(title)
    isbn_clean = re.sub(r'[^\d]', '', str(isbn13))
    return f"https://bookshop.org/books/{slug}/{isbn_clean}"

def process_goodreads_csv():
    """Process the Goodreads CSV and create markdown files."""
    # Read the CSV file
    csv_path = "/Users/sabtain/git/personal-website/goodreads_library_export (1).csv"
    df = pd.read_csv(csv_path)
    
    print(f"Total books in CSV: {len(df)}")
    
    # Filter books from January 5, 2019 onwards with "read" shelf
    df['Date Read'] = pd.to_datetime(df['Date Read'], errors='coerce')
    start_date = datetime(2019, 1, 5)
    
    filtered_df = df[
        (df['Date Read'] >= start_date) & 
        (df['Exclusive Shelf'] == 'read')
    ].copy()
    
    print(f"Books to process (from 2019-01-05, read shelf): {len(filtered_df)}")
    
    # Sort by date read
    filtered_df = filtered_df.sort_values('Date Read')
    
    # Process each book
    books_with_reviews = []
    books_without_reviews = []
    
    for _, row in filtered_df.iterrows():
        has_review = pd.notna(row['My Review']) and row['My Review'].strip() != ""
        
        if has_review:
            books_with_reviews.append(row)
        else:
            books_without_reviews.append(row)
    
    print(f"Books with reviews: {len(books_with_reviews)}")
    print(f"Books without reviews: {len(books_without_reviews)}")
    
    return books_with_reviews, books_without_reviews, filtered_df

# Run the analysis
books_with_reviews, books_without_reviews, all_books = process_goodreads_csv()

# Show some sample data
print("\nSample book with review:")
if books_with_reviews:
    sample = books_with_reviews[0]
    print(f"Title: {sample['Title']}")
    print(f"Author: {sample['Author']}")
    print(f"Date Read: {sample['Date Read']}")
    print(f"Rating: {sample['My Rating']}")
    print(f"Review length: {len(str(sample['My Review']))}")
    print(f"Bookshelves: {sample['Bookshelves']}")