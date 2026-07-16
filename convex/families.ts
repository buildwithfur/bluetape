import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import {
  requireUser,
  tryUser,
  requireFamilyMember,
  requireFamilyOwner,
  getMembership,
  isOwner,
} from "./permissions";

// ─── Helpers ───────────────────────────────────────────────────────────

/** Cryptographically-random URL-safe token for invite links. */
function generateInviteToken(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

// ─── Queries ───────────────────────────────────────────────────────────

/**
 * List all families the current user belongs to (as owner or member).
 * Drives the family switcher and bootstrap gating.
 */
export const listMine = query({
  args: {},
  handler: async (ctx) => {
    const userId = await requireUser(ctx);
    const memberships = await ctx.db
      .query("familyMembers")
      .withIndex("user", (q) => q.eq("userId", userId))
      .collect();
    const families: Doc<"families">[] = [];
    for (const m of memberships) {
      const f = await ctx.db.get(m.familyId);
      if (f) families.push(f);
    }
    // Attach the user's role + displayName in each family for the UI.
    return families.map((f) => {
      const membership = memberships.find((m) => m.familyId === f._id)!;
      return {
        ...f,
        role: isOwner(f, userId) ? "owner" : membership.role,
        displayName: membership.displayName,
      };
    });
  },
});

/** Get a single family (must be a member). */
export const get = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { family, membership, userId } = await requireFamilyMember(
      ctx,
      args.familyId,
    );
    return {
      ...family,
      role: isOwner(family, userId) ? "owner" : membership.role,
      displayName: membership.displayName,
    };
  },
});

/** List members of a family (must be a member to view). */
export const listMembers = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { family, userId } = await requireFamilyMember(ctx, args.familyId);
    const members = await ctx.db
      .query("familyMembers")
      .withIndex("family", (q) => q.eq("familyId", args.familyId))
      .collect();
    return members
      .map((m) => ({
        ...m,
        isOwner: family.ownerUserId === m.userId,
        you: m.userId === userId,
      }))
      .sort((a, b) => (a.isOwner ? -1 : b.isOwner ? 1 : a.joinedAt - b.joinedAt));
  },
});

/**
 * Resolve an invite token to the family's name (for the invite landing
 * page). Does not require auth — only the family name is exposed.
 */
export const getByInviteToken = query({
  args: { token: v.string() },
  handler: async (ctx, args) => {
    const family = await ctx.db
      .query("families")
      .withIndex("inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!family) return null;
    const userId = await tryUser(ctx);
    const isMember = userId
      ? (await getMembership(ctx, family._id, userId)) !== null
      : false;
    return { familyId: family._id, name: family.name, isMember };
  },
});

// ─── Mutations ────────────────────────────────────────────────────────

/**
 * Create a new family. The creator becomes the immutable owner and an
 * admin member. Their currentFamilyId is set to the new family.
 */
export const create = mutation({
  args: { name: v.string() },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const name = args.name.trim();
    if (!name) throw new Error("Family name cannot be empty");

    const now = Date.now();
    const familyId = await ctx.db.insert("families", {
      name,
      ownerUserId: userId,
      inviteToken: generateInviteToken(),
      createdAt: now,
    });

    // Owner is an admin member.
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    await ctx.db.insert("familyMembers", {
      familyId,
      userId,
      role: "admin",
      displayName: profile?.displayName ?? "Owner",
      joinedAt: now,
    });

    // Set as current family if they don't have one yet.
    if (profile && !profile.currentFamilyId) {
      await ctx.db.patch(profile._id, { currentFamilyId: familyId });
    }
    return ctx.db.get(familyId);
  },
});

/**
 * Join a family via invite token. The joining user is added as a
 * "user" — the owner promotes them to admin if desired. No role is
 * ever self-assigned. Idempotent: if already a member, no-op.
 */
export const acceptInvite = mutation({
  args: { token: v.string(), displayName: v.optional(v.string()) },
  handler: async (ctx, args) => {
    const userId = await requireUser(ctx);
    const family = await ctx.db
      .query("families")
      .withIndex("inviteToken", (q) => q.eq("inviteToken", args.token))
      .unique();
    if (!family) throw new Error("Invite link is invalid or expired");

    // Already a member? Just ensure currentFamilyId is set.
    const existing = await getMembership(ctx, family._id, userId);
    if (existing) {
      const profile = await ctx.db
        .query("userProfiles")
        .withIndex("userId", (q) => q.eq("userId", userId))
        .unique();
      if (profile && profile.currentFamilyId !== family._id) {
        await ctx.db.patch(profile._id, { currentFamilyId: family._id });
      }
      return { familyId: family._id, alreadyMember: true };
    }

    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    const now = Date.now();
    await ctx.db.insert("familyMembers", {
      familyId: family._id,
      userId,
      role: "user",
      displayName: args.displayName ?? profile?.displayName ?? "Member",
      joinedAt: now,
      invitedBy: family.ownerUserId,
    });
    if (profile && !profile.currentFamilyId) {
      await ctx.db.patch(profile._id, { currentFamilyId: family._id });
    }
    return { familyId: family._id, alreadyMember: false };
  },
});

/** Switch the active family (for users in multiple families). */
export const setCurrent = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { userId } = await requireFamilyMember(ctx, args.familyId);
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (!profile) throw new Error("Profile not found");
    await ctx.db.patch(profile._id, { currentFamilyId: args.familyId });
    return ctx.db.get(profile._id);
  },
});

/**
 * Set a member's role — owner only. This is the only way a user becomes
 * an admin inside a family. The owner's own role cannot be changed.
 */
export const setMemberRole = mutation({
  args: {
    familyId: v.id("families"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
  },
  handler: async (ctx, args) => {
    const { family } = await requireFamilyOwner(ctx, args.familyId);
    if (family.ownerUserId === args.userId) {
      throw new Error("Cannot change the owner's role");
    }
    const membership = await getMembership(ctx, args.familyId, args.userId);
    if (!membership) throw new Error("User is not a member of this family");
    await ctx.db.patch(membership._id, { role: args.role });
    return ctx.db.get(membership._id);
  },
});

/**
 * Remove a member from the family — owner only. The owner cannot be
 * removed (transfer ownership first, out of scope for V1).
 */
export const removeMember = mutation({
  args: {
    familyId: v.id("families"),
    userId: v.id("users"),
  },
  handler: async (ctx, args) => {
    const { family } = await requireFamilyOwner(ctx, args.familyId);
    if (family.ownerUserId === args.userId) {
      throw new Error("Cannot remove the family owner");
    }
    const membership = await getMembership(ctx, args.familyId, args.userId);
    if (!membership) throw new Error("User is not a member of this family");
    await ctx.db.delete(membership._id);
  },
});

/** A member leaves a family themselves (not the owner). */
export const leave = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    const { userId, family, membership } = await requireFamilyMember(
      ctx,
      args.familyId,
    );
    if (family.ownerUserId === userId) {
      throw new Error("Owner cannot leave; transfer ownership or delete the family");
    }
    await ctx.db.delete(membership._id);
    // Clear currentFamilyId if it pointed here.
    const profile = await ctx.db
      .query("userProfiles")
      .withIndex("userId", (q) => q.eq("userId", userId))
      .unique();
    if (profile && profile.currentFamilyId === args.familyId) {
      await ctx.db.patch(profile._id, { currentFamilyId: undefined });
    }
  },
});

/** Regenerate the invite token (invalidates the old link) — owner only. */
export const regenerateInviteToken = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyOwner(ctx, args.familyId);
    const token = generateInviteToken();
    await ctx.db.patch(args.familyId, { inviteToken: token });
    return token;
  },
});

/** Rename the family — owner only. */
export const rename = mutation({
  args: { familyId: v.id("families"), name: v.string() },
  handler: async (ctx, args) => {
    await requireFamilyOwner(ctx, args.familyId);
    const name = args.name.trim();
    if (!name) throw new Error("Family name cannot be empty");
    await ctx.db.patch(args.familyId, { name });
    return ctx.db.get(args.familyId);
  },
});

/**
 * Delete a family and all its content — owner only. Cleans up members,
 * pages, links, routines, tasks, groceryItems, routineCompletions.
 */
export const remove = mutation({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyOwner(ctx, args.familyId);

    // Best-effort cleanup of all family content. Explicit per-table loops
    // keep the index names type-safe (each table has a different one).
    // Household-scale: well within transaction limits.
    await deleteByFamily(ctx, "familyMembers", args.familyId, "family");
    await deleteByFamily(ctx, "pages", args.familyId, "familyId");
    await deleteByFamily(ctx, "links", args.familyId, "familyId");
    await deleteByFamily(ctx, "routines", args.familyId, "familyId");
    await deleteByFamily(ctx, "tasks", args.familyId, "familyId");
    await deleteByFamily(ctx, "groceryItems", args.familyId, "familyId");
    await deleteByFamily(ctx, "routineCompletions", args.familyId, "familyId");
    await ctx.db.delete(args.familyId);
  },
});

/** Delete all rows of `table` belonging to `familyId` in batches. */
async function deleteByFamily<
  Table extends "familyMembers" | "pages" | "links" | "routines" | "tasks" | "groceryItems" | "routineCompletions",
>(
  ctx: MutationCtx,
  table: Table,
  familyId: Id<"families">,
  indexName: Table extends "familyMembers" ? "family" : "familyId",
) {
  let done = false;
  while (!done) {
    const docs = await ctx.db
      .query(table)
      .withIndex(indexName, (q: any) => q.eq("familyId", familyId))
      .take(100);
    for (const d of docs) {
      await ctx.db.delete(d._id);
    }
    done = docs.length < 100;
  }
}
