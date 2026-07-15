import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const PAGE_ID_PREFIX = "page:";

export type WikiReference = {
  target: string;
  label?: string;
};

/** Parse and de-duplicate wiki references by their target identity. */
export function parseWikiReferences(content: string): WikiReference[] {
  const references: WikiReference[] = [];
  const seen = new Set<string>();
  for (const match of content.matchAll(WIKI_LINK_RE)) {
    const target = match[1].trim();
    const label = match[2]?.trim();
    if (!target) continue;
    const key = target.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    references.push({ target, label: label || undefined });
  }
  return references;
}

/** Resolve either a canonical `page:<id>` target or a legacy page title. */
export async function findWikiPage(
  ctx: MutationCtx | QueryCtx,
  familyId: Id<"families">,
  target: string,
): Promise<Doc<"pages"> | null> {
  const trimmed = target.trim();
  if (trimmed.toLowerCase().startsWith(PAGE_ID_PREFIX)) {
    const pageId = ctx.db.normalizeId("pages", trimmed.slice(PAGE_ID_PREFIX.length));
    if (!pageId) return null;
    const page = await ctx.db.get(pageId);
    return page?.familyId === familyId ? page : null;
  }

  const exact = await ctx.db
    .query("pages")
    .withIndex("title", (q) =>
      q.eq("familyId", familyId).eq("title", trimmed),
    )
    .unique();
  if (exact) return exact;

  const pages = await ctx.db
    .query("pages")
    .withIndex("slug", (q) => q.eq("familyId", familyId))
    .take(500);
  return pages.find((page) =>
    page.title.toLowerCase() === trimmed.toLowerCase()
  ) ?? null;
}

/**
 * Resolve human-authored `[[Page Title]]` tokens at write time.
 *
 * Stored form: `[[page:<stable-id>|Display label]]`. Broken references are
 * intentionally left untouched so the existing create-page flow still works.
 */
export async function canonicalizeWikiReferences(
  ctx: MutationCtx,
  familyId: Id<"families">,
  content: string,
): Promise<string> {
  const references = parseWikiReferences(content);
  if (references.length === 0) return content;

  const resolved = new Map<string, Doc<"pages">>();
  for (const reference of references) {
    const page = await findWikiPage(ctx, familyId, reference.target);
    if (page) resolved.set(reference.target.toLowerCase(), page);
  }

  return content.replace(WIKI_LINK_RE, (original, rawTarget, rawLabel) => {
    const target = String(rawTarget).trim();
    const page = resolved.get(target.toLowerCase());
    if (!page) return original;
    const label = String(rawLabel || page.title).trim() || page.title;
    return `[[${PAGE_ID_PREFIX}${page._id}|${label}]]`;
  });
}
