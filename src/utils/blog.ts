export function getBlogUrl(postId: string): string {
  // Post ID is already in the format "2025/01/05/the-midnight-library"
  return `/blog/${postId}/`;
}