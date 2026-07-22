import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { isOwner, requireFamilyMember, requireProfile } from "./permissions";
import { canonicalizeWikiReferences } from "./wiki";
import { singaporeDayBounds } from "./date";

function currentCount(item: { count?: number; quantity?: string }): number {
  if (typeof item.count === "number" && Number.isFinite(item.count)) {
    return Math.max(1, Math.trunc(item.count));
  }
  const legacyCount = Number.parseInt(item.quantity ?? "", 10);
  return Number.isFinite(legacyCount) && legacyCount > 0 ? legacyCount : 1;
}

// ─── Queries ───────────────────────────────────────────────────────────

/** Pending items plus items bought on the current SG calendar day. */
export const listPending = query({
  args: { familyId: v.id("families"), currentDate: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    const pending = await ctx.db
      .query("groceryItems")
      .withIndex("status_createdAt", (q) =>
        q.eq("familyId", args.familyId).eq("status", "pending"),
      )
      .order("asc")
      .collect();
    const { start, end } = singaporeDayBounds(args.currentDate);
    const bought = await ctx.db
      .query("groceryItems")
      .withIndex("status_boughtAt", (q) =>
        q
          .eq("familyId", args.familyId)
          .eq("status", "bought")
          .gte("boughtAt", start)
          .lt("boughtAt", end),
      )
      .order("asc")
      .collect();
    return [...pending, ...bought].sort((a, b) => a.createdAt - b.createdAt);
  },
});

export const listBought = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyMember(ctx, args.familyId);
    return ctx.db
      .query("groceryItems")
      .withIndex("status_createdAt", (q) =>
        q.eq("familyId", args.familyId).eq("status", "bought"),
      )
      .order("desc")
      .collect();
  },
});

export const get = query({
  args: { itemId: v.string() },
  handler: async (ctx, args) => {
    const itemId = ctx.db.normalizeId("groceryItems", args.itemId);
    if (!itemId) return null;
    const item = await ctx.db.get(itemId);
    if (!item) return null;
    await requireFamilyMember(ctx, item.familyId);
    return item;
  },
});

// ─── Mutations (any family member) ────────────────────────────────────

export const add = mutation({
  args: {
    familyId: v.id("families"),
    name: v.string(),
    count: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireFamilyMember(ctx, args.familyId);
    const profile = await requireProfile(ctx, userId);
    if (!args.name.trim()) throw new Error("Item name cannot be empty");
    const name = await canonicalizeWikiReferences(
      ctx,
      args.familyId,
      args.name.trim(),
    );
    const itemId = await ctx.db.insert("groceryItems", {
      familyId: args.familyId,
      name,
      nameLocale: profile.locale,
      count: Math.max(1, Math.trunc(args.count ?? 1)),
      status: "pending",
      addedBy: userId,
      createdAt: Date.now(),
    });
    return ctx.db.get(itemId);
  },
});

export const adjustCount = mutation({
  args: {
    itemId: v.id("groceryItems"),
    delta: v.union(v.literal(-1), v.literal(1)),
  },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    await requireFamilyMember(ctx, item.familyId);
    if (item.status !== "pending") {
      throw new Error("Only pending grocery items can be changed");
    }
    const count = Math.max(1, currentCount(item) + args.delta);
    await ctx.db.patch(args.itemId, {
      count,
      quantity: undefined,
    });
    return ctx.db.get(args.itemId);
  },
});

export const markBought = mutation({
  args: { itemId: v.id("groceryItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    const { userId } = await requireFamilyMember(ctx, item.familyId);
    if (item.status === "bought") throw new Error("Item is already bought");
    await ctx.db.patch(args.itemId, {
      status: "bought",
      boughtAt: Date.now(),
      boughtBy: userId,
    });
    return ctx.db.get(args.itemId);
  },
});

export const unmarkBought = mutation({
  args: { itemId: v.id("groceryItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    await requireFamilyMember(ctx, item.familyId);
    if (item.status !== "bought") throw new Error("Item is not bought");
    await ctx.db.patch(args.itemId, {
      status: "pending",
      boughtAt: undefined,
      boughtBy: undefined,
    });
    return ctx.db.get(args.itemId);
  },
});

/** Hard-delete a shopping item. Creator, family admin, or owner only. */
export const remove = mutation({
  args: { itemId: v.id("groceryItems") },
  handler: async (ctx, args) => {
    const item = await ctx.db.get(args.itemId);
    if (!item) throw new Error("Grocery item not found");
    const { userId, family, membership } = await requireFamilyMember(
      ctx,
      item.familyId,
    );
    const canDelete =
      item.addedBy === userId ||
      isOwner(family, userId) ||
      membership.role === "admin";
    if (!canDelete) {
      throw new Error("Only the item creator or a family admin can delete this item");
    }
    const translations = await ctx.db
      .query("contentTranslations")
      .withIndex("by_entity_field_locale", (q) =>
        q
          .eq("familyId", item.familyId)
          .eq("entityType", "groceryItem")
          .eq("entityId", item._id),
      )
      .take(21);
    if (translations.length > 20) {
      throw new Error("Too many cached translations for this shopping item");
    }
    for (const translation of translations) {
      await ctx.db.delete(translation._id);
    }
    await ctx.db.delete(args.itemId);
    return null;
  },
});
