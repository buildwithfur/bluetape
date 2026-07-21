import { v } from "convex/values";

export const taskTranslationFieldValidator = v.union(
  v.literal("title"),
  v.literal("note"),
);

export const translationFieldRefValidator = v.object({
  entityType: v.literal("task"),
  entityId: v.id("tasks"),
  field: taskTranslationFieldValidator,
});

export const translationClaimValidator = v.object({
  translationId: v.id("contentTranslations"),
  sourceHash: v.string(),
  generation: v.number(),
});

export const MAX_TRANSLATION_FIELDS = 40;
export const TRANSLATION_LEASE_MS = 2 * 60 * 1000;
export const TRANSLATION_RETRY_MS = 5 * 60 * 1000;

export type TaskTranslationField = "title" | "note";
