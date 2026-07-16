/** Slugify a page title into a URL-safe + uniqueness-enforced slug.

 Matches the slug convention used in PLAN.md §3 (`pages.slug`).
 Normalizes case, trims, and joins non-alphanumeric runs with `-`.
 Local-language / non-Latin titles fall back to a timestamp suffix to keep uniqueness
 without butchering the script; the page is still reachable by title lookup.
*/
export function slugify(title: string): string {
  const trimmed = title.trim().toLowerCase()
  const slug = trimmed
    .replace(/[\s_]+/g, '-')
    .replace(/[^\p{L}\p{N}-]/gu, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
  if (!slug) return `page-${Date.now().toString(36)}`
  return slug
}
