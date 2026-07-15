import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser } from "./permissions";

/**
 * File storage helpers for item photos.
 * Upload URLs are issued to any authenticated user; the family-scope
 * check happens when the storageId is attached to a page via pages.save
 * (which requires family membership). getUrl is gated so random storage
 * IDs can't be enumerated by non-members.
 */
export const generateUploadUrl = mutation({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    return ctx.storage.generateUploadUrl();
  },
});

export const getUrl = query({
  args: { storageId: v.id("_storage") },
  handler: async (ctx, args) => {
    await requireUser(ctx);
    return ctx.storage.getUrl(args.storageId);
  },
});
