import { v } from "convex/values";
import { query, mutation, internalMutation } from "./_generated/server";
import { requireAnyFamilyAdmin } from "./permissions";

/**
 * App-level secrets (e.g. integration API keys). Global, not
 * family-scoped. Gated by requireAnyFamilyAdmin: a user who owns or
 * admins at least one family can read/write app secrets.
 */
export const get = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireAnyFamilyAdmin(ctx);
    const doc = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    return doc?.value ?? null;
  },
});

export const set = mutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    await requireAnyFamilyAdmin(ctx);
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
      return { updated: true, name: args.name };
    }
    await ctx.db.insert("secrets", { name: args.name, value: args.value });
    return { created: true, name: args.name };
  },
});

export const remove = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    await requireAnyFamilyAdmin(ctx);
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (!existing) throw new Error(`Secret "${args.name}" not found`);
    await ctx.db.delete(existing._id);
  },
});

export const listNames = query({
  args: {},
  handler: async (ctx) => {
    await requireAnyFamilyAdmin(ctx);
    const docs = await ctx.db.query("secrets").collect();
    return docs.map((d) => d.name);
  },
});

// Internal (no auth check) — used by the HTTP API layer for API-key verify.
export const getInternal = query({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    return doc?.value ?? null;
  },
});

export const setInternal = internalMutation({
  args: { name: v.string(), value: v.string() },
  handler: async (ctx, args) => {
    const existing = await ctx.db
      .query("secrets")
      .withIndex("by_name", (q) => q.eq("name", args.name))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, { value: args.value });
    } else {
      await ctx.db.insert("secrets", { name: args.name, value: args.value });
    }
    return { name: args.name, value: args.value };
  },
});
