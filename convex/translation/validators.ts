import { v } from "convex/values";

export const taskTranslationFieldValidator = v.union(
  v.literal("title"),
  v.literal("note"),
);

export const translationFieldRefValidator = v.union(
  v.object({
    entityType: v.literal("task"),
    entityId: v.id("tasks"),
    field: taskTranslationFieldValidator,
  }),
  v.object({
    entityType: v.literal("recipe"),
    entityId: v.id("recipes"),
    field: v.union(v.literal("title"), v.literal("notes")),
  }),
  v.object({
    entityType: v.literal("recipeIngredient"),
    entityId: v.id("recipeIngredients"),
    field: v.literal("text"),
  }),
  v.object({
    entityType: v.literal("recipeStep"),
    entityId: v.id("recipeSteps"),
    field: v.literal("text"),
  }),
  v.object({
    entityType: v.literal("routine"),
    entityId: v.id("routines"),
    field: v.union(v.literal("title"), v.literal("description")),
  }),
  v.object({
    entityType: v.literal("page"),
    entityId: v.id("pages"),
    field: v.union(v.literal("title"), v.literal("content"), v.literal("location")),
  }),
  v.object({
    entityType: v.literal("groceryItem"),
    entityId: v.id("groceryItems"),
    field: v.literal("name"),
  }),
);

export const translationClaimValidator = v.object({
  translationId: v.id("contentTranslations"),
  sourceHash: v.string(),
  generation: v.number(),
});

/** A route may request up to three provider batches at once. */
export const MAX_TRANSLATION_FIELDS = 120;
/** Keep each provider request comfortably within the response-token budget. */
export const MAX_TRANSLATION_BATCH = 40;
/** Keep long recipe batches below the provider's 1,200-token response budget. */
export const MAX_PROVIDER_BATCH = 8;
export const TRANSLATION_LEASE_MS = 2 * 60 * 1000;
export const TRANSLATION_RETRY_MS = 5 * 60 * 1000;

export type TaskTranslationField = "title" | "note";
export type TranslationFieldRef =
  | { entityType: "task"; entityId: import("../_generated/dataModel").Id<"tasks">; field: TaskTranslationField }
  | { entityType: "recipe"; entityId: import("../_generated/dataModel").Id<"recipes">; field: "title" | "notes" }
  | { entityType: "recipeIngredient"; entityId: import("../_generated/dataModel").Id<"recipeIngredients">; field: "text" }
  | { entityType: "recipeStep"; entityId: import("../_generated/dataModel").Id<"recipeSteps">; field: "text" }
  | { entityType: "routine"; entityId: import("../_generated/dataModel").Id<"routines">; field: "title" | "description" }
  | { entityType: "page"; entityId: import("../_generated/dataModel").Id<"pages">; field: "title" | "content" | "location" }
  | { entityType: "groceryItem"; entityId: import("../_generated/dataModel").Id<"groceryItems">; field: "name" };

export type TranslationMode = "label" | "instruction" | "ingredient" | "document";
