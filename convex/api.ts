/**
 * Internal mutations for the HTTP API (called by httpActions).
 *
 * These bypass standard user JWT auth — the HTTP layer authenticates via
 * API key (see http.ts). Attribution uses a dedicated API agent user.
 *
 * Family scope: the agent acts WITHIN a family passed by the caller. On
 * first use of a family, the agent is added as an admin member so its
 * writes satisfy requireFamilyMember. The HTTP layer is responsible for
 * authorizing which family an API key may act in.
 *
 * TODO(follow-up): the HTTP layer currently trusts the caller's familyId.
 * Tighten by binding API keys → familyId in the secrets store.
 */
import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import {
  canonicalizeWikiReferences,
  findWikiPage,
  parseWikiReferences,
} from "./wiki";

const AGENT_EMAIL = "api-agent@bluetape.local";

/** Locate or create the API agent user + an admin membership in the family. */
async function resolveAgentInFamily(
  ctx: any,
  familyId: Id<"families">,
): Promise<Id<"users">> {
  const existingUser = await ctx.db
    .query("users")
    .withIndex("email", (q: any) => q.eq("email", AGENT_EMAIL))
    .unique();
  const userId: Id<"users"> = existingUser
    ? existingUser._id
    : await ctx.db.insert("users", {
        name: "API Agent",
        email: AGENT_EMAIL,
        isAnonymous: true,
      });

  // Ensure a profile exists (agent has no role; membership carries it).
  const hasProfile = await ctx.db
    .query("userProfiles")
    .withIndex("userId", (q: any) => q.eq("userId", userId))
    .unique();
  if (!hasProfile) {
    await ctx.db.insert("userProfiles", {
      userId,
      displayName: "API Agent",
      locale: "en",
      timezone: "Asia/Singapore",
    });
  }

  // Ensure the agent is an admin member of this family.
  const membership = await ctx.db
    .query("familyMembers")
    .withIndex("family_user", (q: any) =>
      q.eq("familyId", familyId).eq("userId", userId),
    )
    .unique();
  if (!membership) {
    await ctx.db.insert("familyMembers", {
      familyId,
      userId,
      role: "admin",
      displayName: "API Agent",
      joinedAt: Date.now(),
    });
  }

  return userId;
}

// ─── Tasks ─────────────────────────────────────────────────────────────

export const addTask = internalMutation({
  args: {
    familyId: v.id("families"),
    title: v.string(),
    dueDate: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAgentInFamily(ctx, args.familyId);
    const title = await canonicalizeWikiReferences(
      ctx,
      args.familyId,
      args.title.trim(),
    );
    const taskId = await ctx.db.insert("tasks", {
      familyId: args.familyId,
      title,
      status: "pending",
      dueDate: args.dueDate,
      createdBy: userId,
      createdAt: Date.now(),
    });
    return ctx.db.get(taskId);
  },
});

export const markTaskDone = internalMutation({
  args: { taskId: v.id("tasks") },
  handler: async (ctx, args) => {
    const task = await ctx.db.get(args.taskId);
    if (!task) throw new Error("Task not found");
    if (task.status === "done") throw new Error("Task is already done");
    await ctx.db.patch(args.taskId, { status: "done", completedAt: Date.now() });
    return ctx.db.get(args.taskId);
  },
});

// ─── Grocery Items ─────────────────────────────────────────────────────

export const addGroceryItem = internalMutation({
  args: {
    familyId: v.id("families"),
    name: v.string(),
    quantity: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAgentInFamily(ctx, args.familyId);
    const name = await canonicalizeWikiReferences(
      ctx,
      args.familyId,
      args.name.trim(),
    );
    const legacyCount = Number.parseInt(args.quantity ?? "", 10);
    const itemId = await ctx.db.insert("groceryItems", {
      familyId: args.familyId,
      name,
      count: Number.isFinite(legacyCount) && legacyCount > 0 ? legacyCount : 1,
      quantity: args.quantity,
      status: "pending",
      addedBy: userId,
      createdAt: Date.now(),
    });
    return ctx.db.get(itemId);
  },
});

export const markGroceryBought = internalMutation({
  args: { itemId: v.id("groceryItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    if (item.status === "bought") throw new Error("Item is already bought");
    await ctx.db.patch(args.itemId, { status: "bought", boughtAt: Date.now() });
    return ctx.db.get(args.itemId);
  },
});

export const unmarkGroceryBought = internalMutation({
  args: { itemId: v.id("groceryItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    if (item.status !== "bought") throw new Error("Item is not bought");
    await ctx.db.patch(args.itemId, {
      status: "pending",
      boughtAt: undefined,
      boughtBy: undefined,
    });
    return ctx.db.get(args.itemId);
  },
});

// ─── Routines ─────────────────────────────────────────────────────────

export const createRoutine = internalMutation({
  args: {
    familyId: v.id("families"),
    title: v.string(),
    description: v.optional(v.string()),
    frequency: v.union(
      v.literal("daily"),
      v.literal("weekly"),
      v.literal("monthly"),
    ),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    pageId: v.optional(v.id("pages")),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await resolveAgentInFamily(ctx, args.familyId);
    if (args.frequency === "weekly" && args.dayOfWeek === undefined) {
      throw new Error("dayOfWeek required for weekly routines");
    }
    if (args.frequency === "monthly" && args.dayOfMonth === undefined) {
      throw new Error("dayOfMonth required for monthly routines");
    }
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const existing = await ctx.db
        .query("routines")
        .withIndex("active_frequency", (q: any) =>
          q.eq("familyId", args.familyId).eq("isActive", true),
        )
        .collect();
      sortOrder = existing.length;
    }
    const title = await canonicalizeWikiReferences(ctx, args.familyId, args.title);
    const description = args.description === undefined
      ? undefined
      : await canonicalizeWikiReferences(ctx, args.familyId, args.description);
    const routineId = await ctx.db.insert("routines", {
      familyId: args.familyId,
      title,
      description,
      frequency: args.frequency,
      dayOfWeek: args.dayOfWeek,
      dayOfMonth: args.dayOfMonth,
      pageId: args.pageId,
      sortOrder,
      isActive: args.isActive ?? true,
      createdBy: userId,
    });
    return ctx.db.get(routineId);
  },
});

export const toggleRoutineCompletion = internalMutation({
  args: {
    routineId: v.id("routines"),
    date: v.string(),
  },
  handler: async (ctx, args) => {
    const routine = await ctx.db.get(args.routineId);
    if (!routine) throw new Error("Routine not found");
    const existing = await ctx.db
      .query("routineCompletions")
      .withIndex("routineId_date", (q: any) =>
        q.eq("routineId", args.routineId).eq("date", args.date),
      )
      .unique();
    if (existing) {
      await ctx.db.delete(existing._id);
      return { completed: false };
    }
    const userId = await resolveAgentInFamily(ctx, routine.familyId);
    await ctx.db.insert("routineCompletions", {
      familyId: routine.familyId,
      routineId: args.routineId,
      date: args.date,
      completedBy: userId,
    });
    return { completed: true };
  },
});

// ─── Pages ────────────────────────────────────────────────────────────

export const savePage = internalMutation({
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
    const userId = await resolveAgentInFamily(ctx, args.familyId);

    const slug = slugify(args.title);
    if (!slug) throw new Error("Title must contain alphanumeric chars");
    const now = Date.now();

    if (args.pageId) {
      const existing = await ctx.db.get(args.pageId);
      if (!existing) throw new Error("Page not found");
      const slugConflict = await ctx.db
        .query("pages")
        .withIndex("slug", (q: any) =>
          q.eq("familyId", args.familyId).eq("slug", slug),
        )
        .unique();
      if (slugConflict && slugConflict._id !== args.pageId) {
        throw new Error(`Page "${args.title}" already exists`);
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

    const existingBySlug = await ctx.db
      .query("pages")
      .withIndex("slug", (q: any) =>
        q.eq("familyId", args.familyId).eq("slug", slug),
      )
      .unique();
    if (existingBySlug) throw new Error(`Page "${args.title}" already exists`);

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

function slugify(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// ─── Internal reads (HTTP agent layer) ───────────────────────────────
// These bypass JWT membership checks — the HTTP layer authenticates via
// API key and is responsible for authorizing the familyId. A follow-up
// should bind API keys → familyId in the secrets store so an agent key
// can only act within its own family.

export const today = internalQuery({
  args: {
    familyId: v.id("families"),
    date: v.string(),
    includeUndatedTasks: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const dateObj = new Date(args.date + "T00:00:00Z");
    const dayOfWeek = dateObj.getUTCDay();
    const dayOfMonth = dateObj.getUTCDate();
    const active = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
    const due = active.filter((r) =>
      r.frequency === "daily" ? true
        : r.frequency === "weekly" ? r.dayOfWeek === dayOfWeek
        : r.dayOfMonth === dayOfMonth,
    );
    const routines = await Promise.all(
      due.map(async (routine) => ({
        ...routine,
        isDone:
          (await ctx.db
            .query("routineCompletions")
            .withIndex("routineId_date", (q) =>
              q.eq("routineId", routine._id).eq("date", args.date),
            )
            .unique()) !== null,
      })),
    );
    routines.sort((a, b) => a.sortOrder - b.sortOrder);
    const tasks = (
      await ctx.db
        .query("tasks")
        .withIndex("status_dueDate", (q) =>
          q.eq("familyId", args.familyId).eq("status", "pending"),
        )
        .collect()
    ).filter((t) =>
      t.dueDate === args.date || (args.includeUndatedTasks === true && !t.dueDate)
    );
    const pinnedRules = (
      await ctx.db
        .query("pages")
        .withIndex("by_type", (q) =>
          q.eq("familyId", args.familyId).eq("type", "rule"),
        )
        .collect()
    ).filter((r) => r.pinnedToToday === true);
    return { date: args.date, routines, tasks, pinnedRules };
  },
});

export const listTasks = internalQuery({
  args: {
    familyId: v.id("families"),
    status: v.optional(v.union(v.literal("pending"), v.literal("done"))),
  },
  handler: async (ctx, args) => {
    if (args.status) {
      return ctx.db
        .query("tasks")
        .withIndex("status_dueDate", (q) =>
          q.eq("familyId", args.familyId).eq("status", args.status!),
        )
        .order("desc")
        .collect();
    }
    return ctx.db
      .query("tasks")
      .withIndex("status_dueDate", (q) =>
        q.eq("familyId", args.familyId).eq("status", "pending"),
      )
      .order("desc")
      .collect();
  },
});

export const listGrocery = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("groceryItems")
      .withIndex("status_createdAt", (q) =>
        q.eq("familyId", args.familyId).eq("status", "pending"),
      )
      .order("asc")
      .collect();
  },
});

export const listRoutines = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    return ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
  },
});

export const getPageBySlug = internalQuery({
  args: { familyId: v.id("families"), slug: v.string() },
  handler: async (ctx, args) => {
    return ctx.db
      .query("pages")
      .withIndex("slug", (q) =>
        q.eq("familyId", args.familyId).eq("slug", args.slug),
      )
      .unique();
  },
});

export const listPagesByType = internalQuery({
  args: {
    familyId: v.id("families"),
    type: v.union(v.literal("item"), v.literal("rule")),
  },
  handler: async (ctx, args) => {
    return ctx.db
      .query("pages")
      .withIndex("by_type", (q) =>
        q.eq("familyId", args.familyId).eq("type", args.type),
      )
      .order("desc")
      .collect();
  },
});

export const allTitles = internalQuery({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const pages = await ctx.db
      .query("pages")
      .withIndex("slug", (q) => q.eq("familyId", args.familyId))
      .collect();
    return pages.map((p) => ({ title: p.title, slug: p.slug, type: p.type }));
  },
});

async function rebuildLinks(
  ctx: MutationCtx,
  familyId: Id<"families">,
  sourcePageId: Id<"pages">,
  content: string,
) {
  const existingLinks = await ctx.db
    .query("links")
    .withIndex("sourcePageId", (q: any) => q.eq("sourcePageId", sourcePageId))
    .collect();
  for (const link of existingLinks) await ctx.db.delete(link._id);

  for (const reference of parseWikiReferences(content)) {
    const target = await findWikiPage(ctx, familyId, reference.target);
    if (target && target._id === sourcePageId) continue;
    await ctx.db.insert("links", {
      familyId,
      sourcePageId,
      targetTitle: target?.title ?? reference.label ?? reference.target,
      targetPageId: target?._id,
    });
  }
}
