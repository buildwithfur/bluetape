import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { requireUser, tryUser } from "./permissions";
import { SUPPORTED_LOCALES } from "./supportedLocales";

const localeValidator = v.union(
  ...SUPPORTED_LOCALES.map((locale) => v.literal(locale)),
);

/**
 * userProfiles is now app-level user settings only (displayName, locale,
 * timezone, currentFamilyId). ROLE LIVES ON familyMembers — it can no
 * longer be self-assigned at profile creation. This closes the
 * privilege-escalation hole: a user signs up, gets a profile with no
 * role, then either creates a family (becomes owner → admin) or joins
 * one via invite (becomes a user; owner may promote).
 */
export const getMe = query({
  args: {},
  handler: async (ctx) => {
    const userId = await tryUser(ctx);
    if (!userId) return null;
    return ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
  },
});

/**
 * Create the user's profile (display name + locale + timezone).
 * No role field — role is assigned per-family by the owner. Called once
 * after sign-up, before family creation/join.
 */
export const create = mutation({
  args: {
    displayName: v.string(),
    locale: v.optional(localeValidator),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) throw new Error("User profile already exists");
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      displayName: args.displayName,
      locale: args.locale ?? "en",
      timezone: args.timezone ?? "Asia/Singapore",
      autoTranslateEnabled: false,
    });
    return ctx.db.get(profileId);
  },
});

/**
 * Create the app profile after the first successful sign-in.
 *
 * The display name is already captured by the Password provider during sign-up
 * and stored on the auth user. Deriving it here keeps users from having to
 * enter the same information twice. Returning an existing profile makes this
 * safe to call repeatedly while the client settles after authentication.
 */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const existing = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (existing) return existing;

    const authUser = await ctx.db.get(userId);
    const displayName = authUser?.name?.trim() || authUser?.email || "Member";
    const profileId = await ctx.db.insert("userProfiles", {
      userId,
      displayName,
      locale: "en",
      timezone: "Asia/Singapore",
      autoTranslateEnabled: false,
    });
    return ctx.db.get(profileId);
  },
});

/** Update display name / locale / timezone. */
export const update = mutation({
  args: {
    displayName: v.optional(v.string()),
    locale: v.optional(localeValidator),
    timezone: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { profile } = await (async () => {
      const userId = await requireUser(ctx);
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .unique();
      if (!profile) throw new Error("Profile not found");
      return { profile };
    })();
    const patch: Record<string, string> = {};
    if (args.displayName !== undefined) patch.displayName = args.displayName;
    if (args.locale !== undefined) patch.locale = args.locale;
    if (args.timezone !== undefined) patch.timezone = args.timezone;
    await ctx.db.patch(profile._id, patch);
    return ctx.db.get(profile._id);
  },
});
