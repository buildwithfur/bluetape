import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";

const WIKI_LINK_RE = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
const PAGE_ID_PREFIX = "page:";
const RECIPE_ID_PREFIX = "recipe:";

type WikiTarget =
  | { kind: "page"; record: Doc<"pages"> }
  | { kind: "recipe"; record: Doc<"recipes"> };

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

async function findWikiRecipe(
  ctx: MutationCtx | QueryCtx,
  familyId: Id<"families">,
  target: string,
): Promise<Doc<"recipes"> | null> {
  const trimmed = target.trim();
  if (trimmed.toLowerCase().startsWith(RECIPE_ID_PREFIX)) {
    const recipeId = ctx.db.normalizeId("recipes", trimmed.slice(RECIPE_ID_PREFIX.length));
    if (!recipeId) return null;
    const recipe = await ctx.db.get(recipeId);
    return recipe?.familyId === familyId && recipe.status === "published" ? recipe : null;
  }
  const recipes = await ctx.db
    .query("recipes")
    .withIndex("by_family_and_status_and_updated_at", (q) =>
      q.eq("familyId", familyId).eq("status", "published"))
    .take(100);
  return recipes.find((recipe) => recipe.title.toLowerCase() === trimmed.toLowerCase()) ?? null;
}

async function findWikiTarget(
  ctx: MutationCtx | QueryCtx,
  familyId: Id<"families">,
  target: string,
): Promise<WikiTarget | null> {
  const lower = target.trim().toLowerCase();
  if (lower.startsWith(PAGE_ID_PREFIX)) {
    const page = await findWikiPage(ctx, familyId, target);
    return page ? { kind: "page", record: page } : null;
  }
  if (lower.startsWith(RECIPE_ID_PREFIX)) {
    const recipe = await findWikiRecipe(ctx, familyId, target);
    return recipe ? { kind: "recipe", record: recipe } : null;
  }
  const [page, recipe] = await Promise.all([
    findWikiPage(ctx, familyId, target),
    findWikiRecipe(ctx, familyId, target),
  ]);
  if (page && recipe) return null;
  if (page) return { kind: "page", record: page };
  if (recipe) return { kind: "recipe", record: recipe };
  return null;
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

  const resolved = new Map<string, WikiTarget>();
  for (const reference of references) {
    const target = await findWikiTarget(ctx, familyId, reference.target);
    if (target) resolved.set(reference.target.toLowerCase(), target);
  }

  return content.replace(WIKI_LINK_RE, (original, rawTarget, rawLabel) => {
    const target = String(rawTarget).trim();
    const resolvedTarget = resolved.get(target.toLowerCase());
    if (!resolvedTarget) return original;
    const record = resolvedTarget.record;
    const label = String(rawLabel || record.title).trim() || record.title;
    const prefix = resolvedTarget.kind === "page" ? PAGE_ID_PREFIX : RECIPE_ID_PREFIX;
    return `[[${prefix}${record._id}|${label}]]`;
  });
}
