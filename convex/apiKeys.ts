import { v } from "convex/values";
import { query, mutation, internalQuery } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { requireFamilyOwner } from "./permissions";
import { sha256Hex } from "./lib/sha256";

/**
 * Per-family agent API keys for the HTTP /api/* surface.
 *
 * Threat model: an integration (Zapier, custom cron, voice assistant)
 * gets a key that lets it read+write ONE family's data over HTTP. A key
 * must never let an agent cross into another family. We bind each key to
 * a single familyId at creation (by the family owner) and store only a
 * SHA-256 hash — the plaintext is returned exactly once to the owner.
 *
 * The HTTP layer (http.ts) hashes the incoming Bearer token with sha256
 * and resolves it via `getByHash` → { familyId }. No client-supplied
 * familyId is trusted.
 */

/** Cryptographically-random URL-safe key (32 bytes → ~43 chars). */
function generateKey(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

// ─── Owner-gated management ────────────────────────────────────────────

/** List a family's API keys (keyHash not exposed; only metadata). */
export const list = query({
  args: { familyId: v.id("families") },
  handler: async (ctx, args) => {
    await requireFamilyOwner(ctx, args.familyId);
    const keys = await ctx.db
      .query("apiKeys")
      .withIndex("by_family", (q) => q.eq("familyId", args.familyId))
      .collect();
    return keys
      .filter((k) => k.revokedAt === undefined)
      .map((k) => ({
        _id: k._id,
        label: k.label ?? null,
        createdAt: k.createdAt,
      }))
      .sort((a, b) => b.createdAt - a.createdAt);
  },
});

/**
 * Create a new API key bound to this family. Returns the plaintext key
 * EXACTLY ONCE — the owner must copy it; it is never retrievable again.
 */
export const create = mutation({
  args: {
    familyId: v.id("families"),
    label: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const { userId } = await requireFamilyOwner(ctx, args.familyId);
    const plaintext = generateKey();
    const keyHash = await sha256Hex(plaintext);
    await ctx.db.insert("apiKeys", {
      keyHash,
      familyId: args.familyId,
      label: args.label,
      createdBy: userId,
      createdAt: Date.now(),
    });
    return { key: plaintext };
  },
});

/** Revoke (soft-delete) an API key — owner only. */
export const revoke = mutation({
  args: { keyId: v.id("apiKeys") },
  handler: async (ctx, args) => {
    const key = await ctx.db.get(args.keyId);
    if (!key) throw new Error("API key not found");
    await requireFamilyOwner(ctx, key.familyId);
    if (key.revokedAt !== undefined) return key;
    await ctx.db.patch(args.keyId, { revokedAt: Date.now() });
    return ctx.db.get(args.keyId);
  },
});

// ─── Internal (HTTP layer) ─────────────────────────────────────────────

/**
 * Resolve a Bearer token's hash to its bound family. Returns null if the
 * key doesn't exist or has been revoked. No auth check — the HTTP layer
 * trusts this as the authentication itself.
 */
export const getByHash = internalQuery({
  args: { keyHash: v.string() },
  handler: async (ctx, args) => {
    const key = await ctx.db
      .query("apiKeys")
      .withIndex("by_keyHash", (q) => q.eq("keyHash", args.keyHash))
      .unique();
    if (!key || key.revokedAt !== undefined) return null;
    return { familyId: key.familyId, label: key.label ?? null };
  },
});

/** Hash helper exposed for the HTTP layer (so it uses the same algorithm). */
export const hashForHttp = async (input: string): Promise<string> =>
  sha256Hex(input);

export type { Id };
