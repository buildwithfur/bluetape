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
    field: v.literal("title"),
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
);

export const translationClaimValidator = v.object({
  translationId: v.id("contentTranslations"),
  sourceHash: v.string(),
  generation: v.number(),
});

export const MAX_TRANSLATION_FIELDS = 40;
export const TRANSLATION_LEASE_MS = 2 * 60 * 1000;
export const TRANSLATION_RETRY_MS = 5 * 60 * 1000;

export type TaskTranslationField = "title" | "note";
export type TranslationFieldRef =
  | { entityType: "task"; entityId: import("../_generated/dataModel").Id<"tasks">; field: TaskTranslationField }
  | { entityType: "recipe"; entityId: import("../_generated/dataModel").Id<"recipes">; field: "title" }
  | { entityType: "recipeIngredient"; entityId: import("../_generated/dataModel").Id<"recipeIngredients">; field: "text" }
  | { entityType: "recipeStep"; entityId: import("../_generated/dataModel").Id<"recipeSteps">; field: "text" };

export type TranslationMode = "label" | "instruction" | "ingredient";
