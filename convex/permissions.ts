import { getAuthUserId } from "@convex-dev/auth/server";
import type { Id, Doc } from "./_generated/dataModel";
import type { QueryCtx, MutationCtx } from "./_generated/server";

// ─── Low-level auth ────────────────────────────────────────────────────

export async function requireUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await getAuthUserId(ctx);
  if (userId === null) {
    throw new Error("Not authenticated");
  }
  return userId;
}

export async function tryUser(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users"> | null> {
  return getAuthUserId(ctx);
}

// ─── User profile ─────────────────────────────────────────────────────

export async function requireProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userProfiles">> {
  const profile = await ctx.db
    .query("userProfiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique();
  if (!profile) {
    throw new Error("User profile not found");
  }
  return profile;
}

export async function getProfile(
  ctx: QueryCtx | MutationCtx,
  userId: Id<"users">,
): Promise<Doc<"userProfiles"> | null> {
  return ctx.db
    .query("userProfiles")
    .withIndex("userId", (q) => q.eq("userId", userId))
    .unique();
}

export async function requireAuthenticatedUser(
  ctx: QueryCtx | MutationCtx,
): Promise<{ userId: Id<"users">; profile: Doc<"userProfiles"> }> {
  const userId = await requireUser(ctx);
  const profile = await requireProfile(ctx, userId);
  return { userId, profile };
}

// ─── Family membership ────────────────────────────────────────────────

export type MemberRole = "admin" | "user";

/** A user's membership in a family, or null if not a member. */
export async function getMembership(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
  userId: Id<"users">,
): Promise<Doc<"familyMembers"> | null> {
  return ctx.db
    .query("familyMembers")
    .withIndex("family_user", (q) =>
      q.eq("familyId", familyId).eq("userId", userId),
    )
    .unique();
}

/** Load the family doc, throwing if it doesn't exist. */
export async function requireFamily(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
): Promise<Doc<"families">> {
  const family = await ctx.db.get(familyId);
  if (!family) throw new Error("Family not found");
  return family;
}

/**
 * Require the authenticated user is a member of this family.
 * Returns { userId, membership, family }. The owner is always treated
 * as a member (they have a familyMembers row created at family creation).
 */
export async function requireFamilyMember(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
): Promise<{
  userId: Id<"users">;
  family: Doc<"families">;
  membership: Doc<"familyMembers">;
}> {
  const userId = await requireUser(ctx);
  const family = await requireFamily(ctx, familyId);
  const membership = await getMembership(ctx, familyId, userId);
  if (!membership) {
    throw new Error("You are not a member of this family");
  }
  return { userId, family, membership };
}

/** Is this user the owner of the family? */
export function isOwner(
  family: Doc<"families">,
  userId: Id<"users">,
): boolean {
  return family.ownerUserId === userId;
}

/**
 * Require an admin-level member: the family owner OR a member with
 * role "admin". Admin members manage content (rules, routines, note
 * edits) but CANNOT manage other members or transfer ownership.
 */
export async function requireFamilyAdmin(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
): Promise<{
  userId: Id<"users">;
  family: Doc<"families">;
  membership: Doc<"familyMembers">;
}> {
  const { userId, family, membership } = await requireFamilyMember(
    ctx,
    familyId,
  );
  if (isOwner(family, userId) || membership.role === "admin") {
    return { userId, family, membership };
  }
  throw new Error("Admin access required for this family");
}

/**
 * Require the family owner: the user who created the family. Only the
 * owner can invite/regenerate tokens, assign member roles, or remove
 * members. This is the gate that closes the privilege-escalation hole:
 * no user can ever self-assign admin — only the owner grants it.
 */
export async function requireFamilyOwner(
  ctx: QueryCtx | MutationCtx,
  familyId: Id<"families">,
): Promise<{
  userId: Id<"users">;
  family: Doc<"families">;
}> {
  const userId = await requireUser(ctx);
  const family = await requireFamily(ctx, familyId);
  if (!isOwner(family, userId)) {
    throw new Error("Only the family owner can perform this action");
  }
  return { userId, family };
}

/**
 * Global admin check for app-level (non-family) resources like secrets.
 * A user is a global admin if they own or admin at least one family.
 */
export async function requireAnyFamilyAdmin(
  ctx: QueryCtx | MutationCtx,
): Promise<Id<"users">> {
  const userId = await requireUser(ctx);
  const memberships = await ctx.db
    .query("familyMembers")
    .withIndex("user", (q) => q.eq("userId", userId))
    .collect();
  // Owners are always admin members, so a role==="admin" row suffices.
  const isAdmin = memberships.some((m) => m.role === "admin");
  if (!isAdmin) {
    throw new Error("Admin access required");
  }
  return userId;
}
