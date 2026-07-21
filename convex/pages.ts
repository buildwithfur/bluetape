import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireFamilyMember,
  requireFamilyAdmin,
  isOwner,
} from "./permissions";
import {
  canonicalizeWikiReferences,
  findWikiPage,
  parseWikiReferences,
} from "./wiki";

// ─── Helpers ──────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/** Rebuild the links table for a page (family-scoped). */
async function rebuildLinks(
  ctx: MutationCtx,
  familyId: Id<"families">,
  sourcePageId: Id<"pages">,
  content: string,
) {
  // Delete existing outbound links from this page.
  const existingLinks = await ctx.db
    .query("links")
    .withIndex("sourcePageId", (q) => q.eq("sourcePageId", sourcePageId))
    .collect();
  for (const link of existingLinks) {
    await ctx.db.delete(link._id);
  }

  // Parse + insert fresh, resolving targets against same-family pages.
  const references = parseWikiReferences(content);
  for (const reference of references) {
    const targetPage = await findWikiPage(ctx, familyId, reference.target);
    if (targetPage && targetPage._id === sourcePageId) continue; // self-link

    await ctx.db.insert("links", {
      familyId,
      sourcePageId,
      targetTitle: targetPage?.title ?? reference.label ?? reference.target,
      targetPageId: targetPage?._id,
    });
  }
}

// ─── Queries ───────────────────────────────────────────────────────────

export const getBySlug = query({
  args: { familyId: v.id("families"), slug: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    return ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId).eq("slug", args.slug))
      .unique();
  },
});

export const getById = query({
  args: { pageId: v.string() },
  handler: async (ctx, args) => {
    const pageId = ctx.db.normalizeId("pages", args.pageId);
    if (!pageId) return null;
    const page = await ctx.db.get(pageId);
    if (!page) return null;
    await requireFamilyMember(ctx, page.familyId);
    return page;
  },
});

/** List pages by type within a family, newest first. */
export const listByType = query({
  args: {
    familyId: v.id("families"),
    type: v.union(v.literal("item"), v.literal("rule")),
  },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    return ctx.db
      .query("pages")
      .withIndex("by_type", (q) =>
        q.eq("familyId", args.familyId).eq("type", args.type),
      )
      .order("desc")
      .collect();
  },
});

/** All pages in the family (for selectors + search). */
export const listAll = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    return ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId))
      .collect();
  },
});

/** Title → stable record target map for rendered wiki links. */
export const wikiTargetMap = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const pages = await ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId))
      .take(500);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_family_and_status_and_updated_at", (q) =>
        q.eq("familyId", args.familyId).eq("status", "published"))
      .take(100);
    const map: Record<string, {
      id: Id<"pages"> | Id<"recipes">;
      type: "item" | "rule" | "recipe";
      slug?: string;
      title: string;
    }> = {};
    for (const page of pages) {
      const target = {
        id: page._id,
        type: page.type,
        slug: page.slug,
        title: page.title,
      };
      map[page.title.toLowerCase()] = target;
      map[`page:${page._id}`] = target;
    }
    for (const recipe of recipes) {
      const target = {
        id: recipe._id,
        type: "recipe" as const,
        title: recipe.title,
      };
      const titleKey = recipe.title.toLowerCase();
      if (!map[titleKey]) map[titleKey] = target;
      map[`recipe:${recipe._id}`] = target;
    }
    return map;
  },
});

/** All page titles (for link autocomplete). */
export const allTitles = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const pages = await ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId))
      .take(500);
    const recipes = await ctx.db
      .query("recipes")
      .withIndex("by_family_and_status_and_updated_at", (q) =>
        q.eq("familyId", args.familyId).eq("status", "published"))
      .take(100);
    return [
      ...pages.map((p) => ({ id: p._id, title: p.title, slug: p.slug, type: p.type })),
      ...recipes.map((recipe) => ({ id: recipe._id, title: recipe.title, type: "recipe" as const })),
    ];
  },
});

/** Backlinks: pages whose content links to this one (case-insensitive). */
export const backlinks = query({
  args: { familyId: v.id("families"), slug: v.string() },
  handler: async (ctx, args) => {
    const { family } = await requireFamilyMember(ctx, args.familyId);
    const page = await ctx.db
      .query("pages")
      .withIndex("slug", (q) =>
        q.eq("familyId", args.familyId).eq("slug", args.slug),
      )
      .unique();
    if (!page) return [];

    // Case-insensitive: scan links by family, match targetTitle lowercased.
    const links = await ctx.db
      .query("links")
      .withIndex("targetTitle", (q) => q.eq("familyId", args.familyId))
      .collect();
    const matching = links.filter((link) =>
      link.targetPageId === page._id ||
      link.targetTitle.toLowerCase() === page.title.toLowerCase()
    );

    const sourcePages: Doc<"pages">[] = [];
    for (const link of matching) {
      // Exclude self-links.
      if (link.sourcePageId === page._id) continue;
      const src = await ctx.db.get(link.sourcePageId);
      if (src) sourcePages.push(src);
    }
    void family; // referenced for clarity; ownership already checked.
    return sourcePages;
  },
});

/** Pinned rules for the Today callout. */
export const pinnedRules = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const rules = await ctx.db
      .query("pages")
      .withIndex("by_type", (q) =>
        q.eq("familyId", args.familyId).eq("type", "rule"),
      )
      .collect();
    return rules.filter((r) => r.pinnedToToday === true);
  },
});

// ─── Mutations ────────────────────────────────────────────────────────

/**
 * Save (create or update) a page. Family-scoped.
 * Permissions:
 * - User: can create item pages; cannot create/edit rules; cannot
 *   edit existing pages.
 * - Admin (or owner): full control over all page types.
 */
export const save = mutation({
  args: {
    familyId: v.id("families"),
    pageId: v.optional(v.id("pages")),
    title: v.string(),
    type: v.union(v.literal("item"), v.literal("rule")),
    content: v.string(),
    localName: v.optional(v.string()),
    localContent: v.optional(v.string()),
    location: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    pinnedToToday: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { userId, family, membership } = await requireFamilyMember(
      ctx,
      args.familyId,
    );
    const isAdmin = isOwner(family, userId) || membership.role === "admin";

    // Rule pages are admin-only.
    if (args.type === "rule" && !isAdmin) {
      throw new Error("Only admins can create or edit rules");
    }
    // Editing an existing page is admin-only (users can create, not edit).
    if (args.pageId && !isAdmin) {
      const existing = await ctx.db.get(args.pageId);
      if (existing) {
        throw new Error("Only admins can edit existing pages");
      }
    }

    let slug = slugify(args.title);
    if (!slug) throw new Error("Title must contain at least one alphanumeric character");

    const now = Date.now();

    if (args.pageId) {
      const existing = await ctx.db.get(args.pageId);
      if (!existing) throw new Error("Page not found");
      if (existing.familyId !== args.familyId) {
        throw new Error("Page does not belong to this family");
      }

      const slugConflict = await ctx.db
        .query("pages")
        .withIndex("slug", (q) =>
          q.eq("familyId", args.familyId).eq("slug", slug),
        )
        .unique();
      if (slugConflict && slugConflict._id !== args.pageId) {
        throw new Error(`A page titled "${args.title}" already exists`);
      }

      const preResolvedContent = await canonicalizeWikiReferences(
        ctx,
        args.familyId,
        args.content,
      );
      const preResolvedLocalContent = args.localContent === undefined
        ? undefined
        : await canonicalizeWikiReferences(ctx, args.familyId, args.localContent);
      await ctx.db.patch(args.pageId, {
        title: args.title,
        slug,
        type: args.type,
        content: preResolvedContent,
        localName: args.localName,
        localContent: preResolvedLocalContent,
        location: args.location,
        photoId: args.photoId,
        pinnedToToday: args.pinnedToToday,
        updatedBy: userId,
        updatedAt: now,
      });
      const content = await canonicalizeWikiReferences(
        ctx,
        args.familyId,
        preResolvedContent,
      );
      const localContent = preResolvedLocalContent === undefined
        ? undefined
        : await canonicalizeWikiReferences(ctx, args.familyId, preResolvedLocalContent);
      if (content !== preResolvedContent || localContent !== preResolvedLocalContent) {
        await ctx.db.patch(args.pageId, { content, localContent });
      }
      await rebuildLinks(ctx, args.familyId, args.pageId, content);
      return ctx.db.get(args.pageId);
    }

    // Create.
    const existingBySlug = await ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId).eq("slug", slug))
      .unique();
    if (existingBySlug) {
      throw new Error(`A page titled "${args.title}" already exists`);
    }

    const pageId = await ctx.db.insert("pages", {
      familyId: args.familyId,
      title: args.title,
      slug,
      type: args.type,
      content: args.content,
      localName: args.localName,
      localContent: args.localContent,
      location: args.location,
      photoId: args.photoId,
      pinnedToToday: args.pinnedToToday,
      createdBy: userId,
      updatedBy: userId,
      updatedAt: now,
    });
    const content = await canonicalizeWikiReferences(ctx, args.familyId, args.content);
    const localContent = args.localContent === undefined
      ? undefined
      : await canonicalizeWikiReferences(ctx, args.familyId, args.localContent);
    if (content !== args.content || localContent !== args.localContent) {
      await ctx.db.patch(pageId, { content, localContent });
    }
    await rebuildLinks(ctx, args.familyId, pageId, content);
    return ctx.db.get(pageId);
  },
});

/**
 * Delete a page — admin-only, rules only (PLAN.md §12.12). Other page
 * types cannot be deleted in V1.
 */
export const remove = mutation({
  args: { pageId: v.id("pages") },
  handler: async (ctx, args) => {
    const page = await ctx.db.get(args.pageId);
    if (!page) throw new Error("Page not found");
    await requireFamilyAdmin(ctx, page.familyId);
    if (page.type !== "rule") {
      throw new Error('Only "rule" pages can be deleted in V1');
    }
    const links = await ctx.db
      .query("links")
      .withIndex("sourcePageId", (q) => q.eq("sourcePageId", args.pageId))
      .collect();
    for (const link of links) {
      await ctx.db.delete(link._id);
    }
    await ctx.db.delete(args.pageId);
  },
});
