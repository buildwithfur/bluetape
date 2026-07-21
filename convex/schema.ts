import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

export default defineSchema({
  // Auth tables from @convex-dev/auth.
  ...authTables,

  // ─── Families (the grouping layer) ────────────────────────────────

  /**
   * families — a household. Owns all content via `familyId` on each
   * content table. Created by an owner; members join via invite token.
   */
  families: defineTable({
    name: v.string(),
    ownerUserId: v.id("users"),
    inviteToken: v.string(), // random, used in /invite/:token
    createdAt: v.number(),
  })
    .index("owner", ["ownerUserId"])
    .index("inviteToken", ["inviteToken"]),

  /**
   * familyMembers — a user's membership in a family, with a role.
   * Role lives HERE, not on userProfiles. The owner also has a row
   * (role "admin") so membership queries are uniform.
   * One row per (familyId, userId), enforced in mutations.
   */
  familyMembers: defineTable({
    familyId: v.id("families"),
    userId: v.id("users"),
    role: v.union(v.literal("admin"), v.literal("user")),
    displayName: v.string(),
    joinedAt: v.number(),
    invitedBy: v.optional(v.id("users")),
  })
    .index("family", ["familyId"])
    .index("user", ["userId"])
    .index("family_user", ["familyId", "userId"]),

  // ─── Application Tables (all family-scoped) ─────────────────────

  /**
   * pages — the universal wiki entity. Family-scoped: a page belongs to
   * exactly one family. Slug uniqueness is enforced within a family.
   */
  pages: defineTable({
    familyId: v.id("families"),
    title: v.string(),
    slug: v.string(),
    type: v.union(v.literal("item"), v.literal("rule")),
    content: v.string(),
    localName: v.optional(v.string()),
    localContent: v.optional(v.string()),
    location: v.optional(v.string()),
    photoId: v.optional(v.id("_storage")),
    pinnedToToday: v.optional(v.boolean()),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    updatedAt: v.number(),
  })
    .index("slug", ["familyId", "slug"])
    .index("title", ["familyId", "title"])
    .index("by_type", ["familyId", "type", "updatedAt"])
    .index("pinned_rules", ["familyId", "type", "pinnedToToday"]),

  /**
   * links — outbound wiki links from a page, rebuilt on every save.
   */
  links: defineTable({
    familyId: v.id("families"),
    sourcePageId: v.id("pages"),
    targetTitle: v.string(),
    targetPageId: v.optional(v.id("pages")),
  })
    .index("sourcePageId", ["sourcePageId"])
    .index("targetTitle", ["familyId", "targetTitle"]),

  /**
   * routines — recurring scheduled work. Family-scoped, admin-managed.
   */
  routines: defineTable({
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
    sortOrder: v.number(),
    isActive: v.boolean(),
    createdBy: v.id("users"),
  })
    .index("active_frequency", ["familyId", "isActive", "frequency"]),

  /**
   * tasks — one-off todos. Title/note and completion can be updated.
   */
  tasks: defineTable({
    familyId: v.id("families"),
    title: v.string(),
    note: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("done")),
    dueDate: v.optional(v.string()),
    createdBy: v.id("users"),
    completedAt: v.optional(v.number()),
    createdAt: v.number(),
  })
    .index("status_dueDate", ["familyId", "status", "dueDate"])
    .index("status_completedAt", ["familyId", "status", "completedAt"]),

  /**
   * recipes — structured family recipes. Imports create a draft immediately;
   * only published rows appear in the family recipe catalog.
   */
  recipes: defineTable({
    familyId: v.id("families"),
    title: v.string(),
    status: v.union(v.literal("draft"), v.literal("published")),
    sourceUrl: v.string(),
    normalizedSourceUrl: v.string(),
    sourceType: v.union(
      v.literal("tiktok"),
      v.literal("instagram"),
      v.literal("youtube"),
      v.literal("website"),
    ),
    sourceDomain: v.string(),
    sourceName: v.optional(v.string()),
    sourceImageUrl: v.optional(v.string()),
    searchText: v.string(),
    ingredientCount: v.number(),
    stepCount: v.number(),
    createdBy: v.id("users"),
    updatedBy: v.id("users"),
    createdAt: v.number(),
    updatedAt: v.number(),
    reviewedAt: v.optional(v.number()),
    manuallyEditedAt: v.optional(v.number()),
  })
    .index("familyId", ["familyId"])
    .index("by_family_and_status_and_updated_at", ["familyId", "status", "updatedAt"])
    .index("by_family_and_normalized_source_url", ["familyId", "normalizedSourceUrl"]),

  recipeIngredients: defineTable({
    familyId: v.id("families"),
    recipeId: v.id("recipes"),
    text: v.string(),
    sortOrder: v.number(),
  })
    .index("familyId", ["familyId"])
    .index("by_recipe_and_sort_order", ["recipeId", "sortOrder"]),

  recipeSteps: defineTable({
    familyId: v.id("families"),
    recipeId: v.id("recipes"),
    text: v.string(),
    sortOrder: v.number(),
  })
    .index("familyId", ["familyId"])
    .index("by_recipe_and_sort_order", ["recipeId", "sortOrder"]),

  /** Operational state for the external recipe extraction worker. */
  recipeImportJobs: defineTable({
    familyId: v.id("families"),
    recipeId: v.id("recipes"),
    sourceUrl: v.string(),
    normalizedSourceUrl: v.string(),
    sourceType: v.union(
      v.literal("tiktok"),
      v.literal("instagram"),
      v.literal("youtube"),
      v.literal("website"),
    ),
    sourceDomain: v.string(),
    createdBy: v.id("users"),
    status: v.union(
      v.literal("queued"),
      v.literal("processing"),
      v.literal("needs_review"),
      v.literal("failed"),
      v.literal("published"),
    ),
    stage: v.union(
      v.literal("queued"),
      v.literal("reading_source"),
      v.literal("reading_caption"),
      v.literal("transcribing"),
      v.literal("extracting_recipe"),
      v.literal("needs_review"),
      v.literal("failed"),
      v.literal("published"),
    ),
    attemptCount: v.number(),
    leaseToken: v.optional(v.string()),
    leaseExpiresAt: v.optional(v.number()),
    lastErrorCode: v.optional(v.string()),
    lastErrorMessage: v.optional(v.string()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("familyId", ["familyId"])
    .index("by_family_and_created_at", ["familyId", "createdAt"])
    .index("by_status_and_created_at", ["status", "createdAt"])
    .index("by_status_and_lease_expires_at", ["status", "leaseExpiresAt"])
    .index("by_family_and_normalized_source_url", ["familyId", "normalizedSourceUrl"]),

  /**
   * groceryItems — shared shopping list. Creator/admin/owner can delete.
   */
  groceryItems: defineTable({
    familyId: v.id("families"),
    name: v.string(),
    count: v.optional(v.number()),
    // Legacy free-text quantity. New writes use count; retained so existing
    // rows remain readable without a blocking migration.
    quantity: v.optional(v.string()),
    status: v.union(v.literal("pending"), v.literal("bought")),
    addedBy: v.id("users"),
    boughtAt: v.optional(v.number()),
    boughtBy: v.optional(v.id("users")),
    createdAt: v.number(),
  })
    .index("status_createdAt", ["familyId", "status", "createdAt"])
    .index("status_boughtAt", ["familyId", "status", "boughtAt"]),

  /**
   * routineCompletions — per-day completion log.
   */
  routineCompletions: defineTable({
    familyId: v.id("families"),
    routineId: v.id("routines"),
    date: v.string(),
    completedBy: v.id("users"),
  })
    .index("routineId_date", ["routineId", "date"]),

  /**
   * userProfiles — app-level user settings (NOT role). Role lives on
   * familyMembers. userProfiles is 1:1 with auth users; currentFamilyId
   * selects the active family when a user belongs to several.
   */
  userProfiles: defineTable({
    userId: v.id("users"),
    displayName: v.string(),
    locale: v.string(),
    timezone: v.string(),
    currentFamilyId: v.optional(v.id("families")),
    // Operator-managed feature flag. Missing and false both mean disabled.
    autoTranslateEnabled: v.optional(v.boolean()),
  })
    .index("userId", ["userId"]),

  /** On-demand user-content translation cache. Authored fields stay source. */
  contentTranslations: defineTable(
    v.union(
      v.object({
        familyId: v.id("families"),
        entityType: v.union(v.literal("task"), v.literal("recipe"), v.literal("recipeIngredient"), v.literal("recipeStep")),
        entityId: v.union(v.id("tasks"), v.id("recipes"), v.id("recipeIngredients"), v.id("recipeSteps")),
        field: v.union(v.literal("title"), v.literal("note"), v.literal("text")),
        targetLocale: v.string(),
        sourceHash: v.string(),
        generation: v.number(),
        status: v.literal("pending"),
        leaseExpiresAt: v.number(),
        updatedAt: v.number(),
      }),
      v.object({
        familyId: v.id("families"),
        entityType: v.union(v.literal("task"), v.literal("recipe"), v.literal("recipeIngredient"), v.literal("recipeStep")),
        entityId: v.union(v.id("tasks"), v.id("recipes"), v.id("recipeIngredients"), v.id("recipeSteps")),
        field: v.union(v.literal("title"), v.literal("note"), v.literal("text")),
        targetLocale: v.string(),
        sourceHash: v.string(),
        generation: v.number(),
        status: v.literal("ready"),
        detectedSourceLocale: v.string(),
        normalizedSource: v.string(),
        translatedText: v.string(),
        provider: v.string(),
        model: v.string(),
        updatedAt: v.number(),
      }),
      v.object({
        familyId: v.id("families"),
        entityType: v.union(v.literal("task"), v.literal("recipe"), v.literal("recipeIngredient"), v.literal("recipeStep")),
        entityId: v.union(v.id("tasks"), v.id("recipes"), v.id("recipeIngredients"), v.id("recipeSteps")),
        field: v.union(v.literal("title"), v.literal("note"), v.literal("text")),
        targetLocale: v.string(),
        sourceHash: v.string(),
        generation: v.number(),
        status: v.literal("source_is_target"),
        detectedSourceLocale: v.string(),
        provider: v.string(),
        model: v.string(),
        updatedAt: v.number(),
      }),
      v.object({
        familyId: v.id("families"),
        entityType: v.union(v.literal("task"), v.literal("recipe"), v.literal("recipeIngredient"), v.literal("recipeStep")),
        entityId: v.union(v.id("tasks"), v.id("recipes"), v.id("recipeIngredients"), v.id("recipeSteps")),
        field: v.union(v.literal("title"), v.literal("note"), v.literal("text")),
        targetLocale: v.string(),
        sourceHash: v.string(),
        generation: v.number(),
        status: v.literal("failed"),
        errorCode: v.string(),
        retryAfter: v.number(),
        updatedAt: v.number(),
      }),
    ),
  )
    .index(
      "by_entity_field_locale",
      ["familyId", "entityType", "entityId", "field", "targetLocale"],
    )
    .index(
      "by_locale_status",
      ["familyId", "targetLocale", "status"],
    ),

  /**
   * secrets — app-level configuration (e.g. integration API keys).
   * Global (not family-scoped). Gated by requireAnyFamilyAdmin.
   *
   * Note: per-family agent API keys live in the `apiKeys` table, not here.
   * `secrets` is for global app config only.
   */
  secrets: defineTable({
    name: v.string(),
    value: v.string(),
  })
    .index("by_name", ["name"]),

  /**
   * apiKeys — per-family agent API keys for the HTTP /api/* surface.
   * Each key is bound to exactly one family at creation (by the family
   * owner). We store a SHA-256 hash of the secret, never the plaintext,
   * so a DB leak can't expose live keys. The HTTP layer hashes the
   * incoming Bearer token and looks up the bound familyId here.
   */
  apiKeys: defineTable({
    keyHash: v.string(),
    familyId: v.id("families"),
    label: v.optional(v.string()),
    createdBy: v.id("users"),
    createdAt: v.number(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_keyHash", ["keyHash"])
    .index("by_family", ["familyId"]),
});
