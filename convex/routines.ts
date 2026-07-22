import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import {
  requireFamilyMember,
  requireFamilyAdmin,
  isOwner,
} from "./permissions";
import { canonicalizeWikiReferences } from "./wiki";

// ─── Queries ───────────────────────────────────────────────────────────

/** Active routines in the family, grouped by frequency. */
export const list = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const routines = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
    const order = { daily: 0, weekly: 1, monthly: 2 } as const;
    return routines.sort((a, b) => {
      const freqDiff = order[a.frequency] - order[b.frequency];
      if (freqDiff !== 0) return freqDiff;
      return a.sortOrder - b.sortOrder;
    });
  },
});

/** All routines incl. inactive — admin (or owner) only. */
export const listAll = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { userId, family, membership } = await requireFamilyMember(
      ctx,
      args.familyId,
    );
    if (!isOwner(family, userId) && membership.role !== "admin") {
      throw new Error("Admin access required");
    }
    const routines = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) => q.eq("familyId", args.familyId))
      .collect();
    return routines.sort((a, b) => a.sortOrder - b.sortOrder);
  },
});

export const get = query({
  args: { routineId: v.string() },
  handler: async (ctx, args) => {
    const routineId = ctx.db.normalizeId("routines", args.routineId);
    if (!routineId) return null;
    const routine = await ctx.db.get(routineId);
    if (!routine) return null;
    await requireFamilyMember(ctx, routine.familyId);
    return routine;
  },
});

export const dueOnDate = query({
  args: { familyId: v.id("families"), date: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const date = new Date(args.date + "T00:00:00Z");
    const dayOfWeek = date.getUTCDay();
    const dayOfMonth = date.getUTCDate();
    const active = await ctx.db
      .query("routines")
      .withIndex("active_frequency", (q) =>
        q.eq("familyId", args.familyId).eq("isActive", true),
      )
      .collect();
    return active.filter((r) => {
      switch (r.frequency) {
        case "daily": return true;
        case "weekly": return r.dayOfWeek === dayOfWeek;
        case "monthly": return r.dayOfMonth === dayOfMonth;
        default: return false;
      }
    });
  },
});

// ─── Mutations (admin/owner only) ─────────────────────────────────────

export const create = mutation({
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
    const { userId } = await requireFamilyAdmin(ctx, args.familyId);
    if (args.frequency === "weekly" && args.dayOfWeek === undefined) {
      throw new Error("dayOfWeek is required for weekly routines");
    }
    if (args.frequency === "monthly" && args.dayOfMonth === undefined) {
      throw new Error("dayOfMonth is required for monthly routines");
    }
    let sortOrder = args.sortOrder;
    if (sortOrder === undefined) {
      const existing = await ctx.db
        .query("routines")
        .withIndex("active_frequency", (q) =>
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

export const update = mutation({
  args: {
    routineId: v.id("routines"),
    title: v.optional(v.string()),
    description: v.optional(v.string()),
    frequency: v.optional(
      v.union(v.literal("daily"), v.literal("weekly"), v.literal("monthly")),
    ),
    dayOfWeek: v.optional(v.number()),
    dayOfMonth: v.optional(v.number()),
    pageId: v.optional(v.id("pages")),
    sortOrder: v.optional(v.number()),
    isActive: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.routineId);
    if (!existing) throw new Error("Routine not found");
    await requireFamilyAdmin(ctx, existing.familyId);
    const patch: Record<string, unknown> = {};
    if (args.title !== undefined) {
      patch.title = await canonicalizeWikiReferences(
        ctx,
        existing.familyId,
        args.title,
      );
    }
    if (args.description !== undefined) {
      patch.description = await canonicalizeWikiReferences(
        ctx,
        existing.familyId,
        args.description,
      );
    }
    if (args.frequency !== undefined) patch.frequency = args.frequency;
    if (args.dayOfWeek !== undefined) patch.dayOfWeek = args.dayOfWeek;
    if (args.dayOfMonth !== undefined) patch.dayOfMonth = args.dayOfMonth;
    if (args.pageId !== undefined) patch.pageId = args.pageId;
    if (args.sortOrder !== undefined) patch.sortOrder = args.sortOrder;
    if (args.isActive !== undefined) patch.isActive = args.isActive;
    await ctx.db.patch(args.routineId, patch);
    return ctx.db.get(args.routineId);
  },
});

export const remove = mutation({
  args: { routineId: v.id("routines") },
  handler: async (ctx, args) => {
    const existing = await ctx.db.get(args.routineId);
    if (!existing) throw new Error("Routine not found");
    await requireFamilyAdmin(ctx, existing.familyId);
    const completions = await ctx.db
      .query("routineCompletions")
      .withIndex("routineId_date", (q) => q.eq("routineId", args.routineId))
      .collect();
    for (const c of completions) {
      await ctx.db.delete(c._id);
    }
    const translations = await ctx.db
      .query("contentTranslations")
      .withIndex("by_entity_field_locale", (q) =>
        q
          .eq("familyId", existing.familyId)
          .eq("entityType", "routine")
          .eq("entityId", existing._id),
      )
      .take(21);
    if (translations.length > 20) {
      throw new Error("Too many cached translations for this routine");
    }
    for (const translation of translations) {
      await ctx.db.delete(translation._id);
    }
    await ctx.db.delete(args.routineId);
  },
});
